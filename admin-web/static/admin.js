(() => {
  "use strict";

  const main = document.querySelector("#admin-main");
  const params = new URLSearchParams(location.search);
  const charts = new Map();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (cents, signed = false) => {
    const value = Number(cents || 0) / 100;
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(value));
    if (value < 0) return `−${formatted}`;
    return signed && value > 0 ? `+${formatted}` : formatted;
  };
  const dateTime = (value) => {
    if (!value) return "Never";
    const parsed = new Date(`${String(value).replace(" ", "T")}Z`);
    return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
      year: "2-digit", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(parsed);
  };
  const initials = (name) => String(name || "?").slice(0, 2).toUpperCase();
  const userLink = (row) => `<a class="user-link" href="/users/${row.user_id ?? row.id}">${escapeHtml(row.username)}</a>`;
  const itemLink = (row) => `<a class="user-link" href="/inventory/${row.item_id ?? row.id}">${escapeHtml(row.name ?? row.item_name)}</a>`;

  main.addEventListener("click", (event) => {
    const backButton = event.target.closest("[data-browser-back]");
    if (backButton) history.back();
  });

  async function api(path, options) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The request could not be completed.");
    return body;
  }

  function showError(error) {
    main.innerHTML = `<div class="panel error-state"><div><strong>Something went wrong</strong><p>${escapeHtml(error.message)}</p></div></div>`;
  }

  function heading(name, pill = "", action = "") {
    return `<div class="page-heading"><h1>${escapeHtml(name)}</h1>${pill || action ? `<div class="heading-actions">${pill ? `<span class="window-pill">${escapeHtml(pill)}</span>` : ""}${action}</div>` : ""}</div>`;
  }

  function subnav(items) {
    return `<nav class="subnav" aria-label="Page sections">${items.map((item) => `<a href="${item.href}" class="${item.active ? "active" : ""}">${escapeHtml(item.label)}</a>`).join("")}</nav>`;
  }

  const inventorySubnav = (active) => subnav([
    { href: "/inventory", label: "Popular", active: active === "popular" },
    { href: "/inventory/items", label: "Items", active: active === "items" },
  ]);
  const volunteerSubnav = (active) => subnav([
    { href: "/volunteers", label: "Rankings", active: active === "rankings" },
    { href: "/volunteers/history", label: "Restock history", active: active === "history" },
  ]);

  function windowLabel(window) {
    const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
    const parse = (value) => new Date(`${String(value).replace(" ", "T")}Z`);
    return `${formatter.format(parse(window.start))} – ${formatter.format(parse(window.end))}`;
  }

  function naturalDetails(details) {
    const source = details?.after && typeof details.after === "object" ? details.after : details;
    if (!source || typeof source !== "object") return escapeHtml(source || "No additional details");
    const labels = {
      name: "Name", username: "Username", email: "Email", unit_price_cents: "Unit price",
      whole_price_cents: "Package price", unit_count: "Units", taxable: "Taxable", crv: "CRV",
      profit_rate: "Profit rate", cents: "Amount", note: "Note",
      transaction_id: "Transaction ID", barcode: "Barcode",
    };
    const order = Object.keys(labels);
    const entries = Object.entries(source)
      .filter(([key]) => key !== "before" && key !== "after")
      .sort(([left], [right]) => {
        const leftIndex = order.indexOf(left);
        const rightIndex = order.indexOf(right);
        return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
      });
    if (!entries.length) return "No additional details";
    return entries.map(([key, value]) => {
      const label = labels[key] || key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
      let display = value;
      if (key.endsWith("_cents")) display = money(value);
      else if (key === "cents") display = money(value, true);
      else if (key === "profit_rate") display = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 3 }).format(value);
      else if (typeof value === "boolean") display = value ? "Yes" : "No";
      else if (value === null || value === "") display = "—";
      else if (typeof value === "object") display = JSON.stringify(value);
      return `<span class="log-detail"><b>${escapeHtml(label)}:</b> ${escapeHtml(display)}</span>`;
    }).join("");
  }

  function pagination(data, onPage) {
    const { page, page_size: pageSize, total, pages } = data;
    const first = total ? (page - 1) * pageSize + 1 : 0;
    const last = Math.min(page * pageSize, total);
    const node = document.createElement("div");
    node.className = "pagination";
    node.innerHTML = `<span>Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}</span><div class="pagination-buttons"><button class="button button-secondary prev" type="button" ${page <= 1 ? "disabled" : ""}>Previous</button><button class="button button-secondary next" type="button" ${page >= pages ? "disabled" : ""}>Next</button></div>`;
    node.querySelector(".prev").addEventListener("click", () => onPage(page - 1));
    node.querySelector(".next").addEventListener("click", () => onPage(page + 1));
    return node;
  }

  function tablePanel(headers, rows, emptyText) {
    if (!rows.length) return `<div class="panel empty-state">${escapeHtml(emptyText)}</div>`;
    return `<div class="panel"><div class="table-scroll"><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div><div data-pagination></div></div>`;
  }

  function transactionRows(items, includeUser = true) {
    return items.map((item) => `<tr>
      <td><span class="cell-primary">${dateTime(item.created_at)}</span><span class="cell-secondary">#${item.id}</span></td>
      ${includeUser ? `<td>${userLink(item)}</td>` : ""}
      <td><span class="cell-primary">${item.item_id ? itemLink(item) : escapeHtml(item.item_name)}</span>${item.note ? `<span class="cell-secondary">${escapeHtml(item.note)}</span>` : ""}</td>
      <td><span class="badge ${item.cents < 0 ? "purchase" : "credit"}">${item.cents < 0 ? "Purchase" : "Credit"}</span></td>
      <td><span class="money ${item.cents < 0 ? "negative" : "positive"}">${money(item.cents, true)}</span></td>
    </tr>`);
  }

  function renderSalesChart(key, container, series, ariaLabel, unitLabel) {
    charts.get(key)?.destroy();
    container.innerHTML = `<canvas role="img" aria-label="${escapeHtml(ariaLabel)}"></canvas>`;
    if (!window.Chart) {
      container.innerHTML = '<div class="dashboard-empty">The chart library could not be loaded.</div>';
      return;
    }
    const labels = series.map((point) => point.date);
    const dateLabel = (value) => new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "2-digit",
    }).format(new Date(`${value}T00:00:00`));
    const chart = new window.Chart(container.querySelector("canvas"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: series.map((point) => Number(point.units_sold)),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, .14)",
          borderWidth: 2.5,
          fill: true,
          tension: .25,
          pointRadius: series.length <= 90 ? 2.5 : 0,
          pointHoverRadius: 6,
          pointHitRadius: 18,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items) => dateLabel(labels[items[0].dataIndex]),
              label: (context) => `${context.parsed.y.toLocaleString()} ${unitLabel}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: window.matchMedia("(max-width: 520px)").matches ? 4 : 8,
              callback: (_value, index) => dateLabel(labels[index]),
            },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
    charts.set(key, chart);
  }

  async function dashboardPage() {
    main.innerHTML = `${heading("Dashboard")}<div class="panel loading-state"><span class="spinner"></span>Loading dashboard…</div>`;
    try {
      const data = await api("/api/dashboard");
      const metrics = data.metrics;
      const metricCards = [
        ["Active users", Number(metrics.active_users).toLocaleString(), ""],
        ["Total debt", money(metrics.total_debt_cents), "negative"],
        ["New debt", money(metrics.new_debt_cents), "negative"],
        ["Purchases", Number(metrics.purchases).toLocaleString(), ""],
        ["Purchase value", money(metrics.purchase_value_cents), ""],
        ["Restock credits", Number(metrics.restock_credits).toLocaleString(), "positive"],
      ].map(([label, value, tone]) => `<div class="stat-card dashboard-stat"><small>${escapeHtml(label)}</small><strong class="${tone}">${escapeHtml(value)}</strong></div>`).join("");
      const popularItems = data.popular_items.length
        ? `<ol class="dashboard-list">${data.popular_items.map((item, index) => `<li><span class="rank ${index < 3 ? "top" : ""}">${index + 1}</span><span>${itemLink(item)}</span><strong>${Number(item.scan_count).toLocaleString()}</strong></li>`).join("")}</ol>`
        : '<div class="dashboard-empty">No purchases this month.</div>';
      const recentRows = data.recent_transactions.map((item) => `<tr><td>${dateTime(item.created_at)}</td><td>${userLink(item)}</td><td>${item.item_id ? itemLink(item) : escapeHtml(item.item_name)}</td><td><span class="money ${item.cents < 0 ? "negative" : "positive"}">${money(item.cents, true)}</span></td></tr>`);
      const purchaseTotal = data.purchase_series.reduce((sum, point) => sum + Number(point.units_sold), 0);
      main.innerHTML = `${heading("Dashboard", windowLabel(data.window))}
        <div class="dashboard-stats">${metricCards}</div>
        <section class="panel dashboard-purchases-panel"><div class="dashboard-panel-heading"><h2>Purchases per day</h2></div><div class="dashboard-chart"><div class="chart-summary"><strong>All items</strong><span>${purchaseTotal.toLocaleString()} purchases</span></div><div class="chart-canvas" id="dashboard-purchases-chart"></div>${purchaseTotal ? "" : '<p class="chart-empty-label">No purchases this month.</p>'}</div></section>
        <div class="dashboard-columns">
          <section class="panel dashboard-panel"><div class="dashboard-panel-heading"><h2>Popular</h2><a href="/inventory">View all</a></div>${popularItems}</section>
          <section class="panel dashboard-panel"><div class="dashboard-panel-heading"><h2>Recent activity</h2><a href="/transactions">View all</a></div>${recentRows.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>User</th><th>Item</th><th>Amount</th></tr></thead><tbody>${recentRows.join("")}</tbody></table></div>` : '<div class="dashboard-empty">No activity this month.</div>'}</section>
        </div>`;
      renderSalesChart("dashboard-purchases", document.querySelector("#dashboard-purchases-chart"), data.purchase_series, "Daily purchases across all items", "purchases");
    } catch (error) { showError(error); }
  }

  function setQuery(values) {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}`);
  }

  async function transactionsPage() {
    main.innerHTML = `${heading("Transactions")}
      <form class="filters" id="transaction-filters">
        <div class="filter-field search"><label for="item">Item name</label><input id="item" name="item" type="search" value="${escapeHtml(params.get("item") || "")}" placeholder="Search items"></div>
        <div class="filter-field"><label for="start">From</label><input id="start" name="start" type="date" value="${escapeHtml(params.get("start") || "")}"></div>
        <div class="filter-field"><label for="end">Through</label><input id="end" name="end" type="date" value="${escapeHtml(params.get("end") || "")}"></div>
        <button class="button button-primary" type="submit">Apply filters</button>
      </form><div id="results"><div class="panel loading-state"><span class="spinner"></span>Loading transactions…</div></div>`;
    const form = document.querySelector("#transaction-filters");
    const results = document.querySelector("#results");
    async function load(page = 1) {
      try {
        const values = Object.fromEntries(new FormData(form));
        setQuery(values);
        const query = new URLSearchParams({ page, page_size: 25 });
        Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
        const data = await api(`/api/transactions?${query}`);
        results.innerHTML = tablePanel(["Date", "User", "Item", "Type", "Amount"], transactionRows(data.items), "No transactions match these filters.");
        results.querySelector("[data-pagination]")?.append(pagination(data.pagination, load));
      } catch (error) { showError(error); }
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
    load(Number(params.get("page")) || 1);
  }

  async function popularPage() {
    main.innerHTML = `${heading("Inventory")}${inventorySubnav("popular")}<div class="panel loading-state"><span class="spinner"></span>Calculating popularity…</div>`;
    try {
      const data = await api("/api/popular-items");
      const rows = data.items.map((item, index) => `<tr><td><span class="rank ${index < 3 ? "top" : ""}">${index + 1}</span></td><td><span class="cell-primary">${itemLink(item)}</span></td><td><span class="cell-primary">${Number(item.scan_count).toLocaleString()}</span><span class="cell-secondary">scans</span></td></tr>`);
      main.innerHTML = `${heading("Inventory", windowLabel(data.window))}${inventorySubnav("popular")}${tablePanel(["Rank", "Item", "Popularity"], rows, "No item purchases were recorded in this period.")}`;
    } catch (error) { showError(error); }
  }

  async function volunteersPage() {
    main.innerHTML = `${heading("Volunteers")}${volunteerSubnav("rankings")}<div class="panel loading-state"><span class="spinner"></span>Loading volunteer activity…</div>`;
    try {
      const data = await api("/api/volunteers");
      const rows = data.items.map((item) => `<tr><td>${userLink(item)}</td><td><span class="cell-primary">${Number(item.scan_count).toLocaleString()}</span></td><td>${dateTime(item.last_scan_at)}</td></tr>`);
      main.innerHTML = `${heading("Volunteers", windowLabel(data.window))}${volunteerSubnav("rankings")}${tablePanel(["Volunteer", "Credits", "Last restock"], rows, "No Restocker Credit scans were recorded in this period.")}`;
    } catch (error) { showError(error); }
  }

  async function restockHistoryPage() {
    main.innerHTML = `${heading("Volunteers")}${volunteerSubnav("history")}<form class="filters" id="restock-filters"><div class="filter-field"><label for="start">From</label><input id="start" name="start" type="date" value="${escapeHtml(params.get("start") || "")}"></div><div class="filter-field"><label for="end">Through</label><input id="end" name="end" type="date" value="${escapeHtml(params.get("end") || "")}"></div><button class="button button-primary" type="submit">Apply dates</button></form><div id="results"><div class="panel loading-state"><span class="spinner"></span>Loading restocks…</div></div>`;
    const form = document.querySelector("#restock-filters");
    const results = document.querySelector("#results");
    async function load(page = 1) {
      try {
        const values = Object.fromEntries(new FormData(form));
        setQuery(values);
        const query = new URLSearchParams({ page, page_size: 25 });
        Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
        const data = await api(`/api/restocks?${query}`);
        const rows = data.items.map((item) => `<tr><td>${dateTime(item.created_at)}</td><td>${userLink(item)}</td><td><span class="money positive">${money(item.cents, true)}</span></td></tr>`);
        results.innerHTML = tablePanel(["Date", "Volunteer", "Amount"], rows, "No restock scans match these dates.");
        results.querySelector("[data-pagination]")?.append(pagination(data.pagination, load));
      } catch (error) { showError(error); }
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
    load(Number(params.get("page")) || 1);
  }

  async function debtPage() {
    main.innerHTML = `${heading("Wall of Shame", "", '<div class="debt-total"><span>Total debt</span><strong id="total-debt">—</strong></div>')}<div id="results"><div class="panel loading-state"><span class="spinner"></span>Loading balances…</div></div>`;
    const results = document.querySelector("#results");
    async function load(page = 1) {
      try {
        const data = await api(`/api/debts?page=${page}&page_size=25`);
        document.querySelector("#total-debt").textContent = money(data.total_debt_cents);
        const rows = data.items.map((item) => `<tr><td>${userLink(item)}</td><td><span class="money negative">${money(item.debt_cents)}</span></td><td>${dateTime(item.debt_started_at)}</td></tr>`);
        results.innerHTML = tablePanel(["User", "Amount", "Debt began"], rows, "No users currently have debt.");
        results.querySelector("[data-pagination]")?.append(pagination(data.pagination, load));
      } catch (error) { showError(error); }
    }
    load(Number(params.get("page")) || 1);
  }

  async function usersPage() {
    main.innerHTML = `${heading("Users")}
      <form class="filters" id="user-search"><div class="filter-field search"><label for="q">User</label><input id="q" name="q" type="search" value="${escapeHtml(params.get("q") || "")}" placeholder="Username or email" autofocus></div><div class="filter-field"><label for="user-sort">Sort by</label><select id="user-sort" name="sort"><option value="name">Name</option><option value="balance_desc">Balance: highest first</option><option value="balance_asc">Balance: lowest first</option></select></div><button class="button button-primary" type="submit">Apply</button></form>
      <div id="results"><div class="panel loading-state"><span class="spinner"></span>Loading users…</div></div>`;
    const form = document.querySelector("#user-search");
    form.sort.value = params.get("sort") || "name";
    const results = document.querySelector("#results");
    async function load(page = 1) {
      try {
        const q = form.q.value.trim();
        const sort = form.sort.value;
        setQuery({ q, sort: sort === "name" ? "" : sort });
        const data = await api(`/api/users?page=${page}&page_size=25&q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}`);
        const rows = data.items.map((item) => `<tr><td><div class="user-head"><span class="avatar">${escapeHtml(initials(item.username))}</span><span>${userLink(item)}<span class="cell-secondary">${escapeHtml(item.email)}</span></span></div></td><td><span class="money ${item.balance < 0 ? "negative" : item.balance > 0 ? "positive" : ""}">${money(item.balance)}</span></td></tr>`);
        results.innerHTML = tablePanel(["User", "Balance"], rows, "No users match that search.");
        results.querySelector("[data-pagination]")?.append(pagination(data.pagination, load));
      } catch (error) { showError(error); }
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
    load(Number(params.get("page")) || 1);
  }

  async function inventoryItemsPage() {
    main.innerHTML = `${heading("Inventory")}${inventorySubnav("items")}
      <form class="filters" id="inventory-search"><div class="filter-field search"><label for="q">Item</label><input id="q" name="q" type="search" value="${escapeHtml(params.get("q") || "")}" placeholder="Item name" autofocus></div><div class="filter-field"><label for="inventory-sort">Sort by</label><select id="inventory-sort" name="sort"><option value="last_purchased_desc">Last purchased: newest first</option><option value="last_purchased_asc">Last purchased: oldest first</option><option value="price_desc">Price: highest first</option><option value="price_asc">Price: lowest first</option></select></div><button class="button button-primary" type="submit">Apply</button></form>
      <div id="results"><div class="panel loading-state"><span class="spinner"></span>Loading inventory…</div></div>`;
    const form = document.querySelector("#inventory-search");
    form.sort.value = params.get("sort") || "last_purchased_desc";
    const results = document.querySelector("#results");
    async function load(page = 1) {
      try {
        const q = form.q.value.trim();
        const sort = form.sort.value;
        setQuery({ q, sort: sort === "last_purchased_desc" ? "" : sort });
        const query = new URLSearchParams({ page, page_size: 25, q, sort });
        const data = await api(`/api/inventory-items?${query}`);
        const rows = data.items.map((item) => `<tr><td>${itemLink(item)}</td><td><span class="money">${money(item.price_cents)}</span></td><td>${dateTime(item.last_purchased_at)}</td></tr>`);
        results.innerHTML = tablePanel(["Item", "Price", "Last purchased"], rows, "No inventory items match that search.");
        results.querySelector("[data-pagination]")?.append(pagination(data.pagination, load));
      } catch (error) { showError(error); }
    }
    form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
    load(Number(params.get("page")) || 1);
  }

  async function inventoryItemDetailPage(itemId) {
    main.innerHTML = `<div class="panel loading-state"><span class="spinner"></span>Loading item…</div>`;
    try {
      const detail = await api(`/api/inventory-items/${itemId}`);
      const item = detail.item;
      main.innerHTML = `<button class="back-link" data-browser-back type="button">← Back</button>
        <div class="page-heading"><h1>${escapeHtml(item.name)}</h1></div>
        <div class="stats-grid"><div class="stat-card"><small>Price</small><strong>${money(item.price_cents)}</strong></div><div class="stat-card"><small>Last Purchased</small><strong style="font-size:17px">${dateTime(item.last_purchased_at)}</strong></div><div class="stat-card"><small>Lifetime Sold</small><strong>${Number(item.purchase_count).toLocaleString()}</strong></div></div>
        <form class="filters" id="purchase-filters"><div class="filter-field"><label for="start">Purchases from</label><input id="start" name="start" type="date" value="${escapeHtml(params.get("start") || "")}"></div><div class="filter-field"><label for="end">Through</label><input id="end" name="end" type="date" value="${escapeHtml(params.get("end") || "")}"></div><button class="button button-primary" type="submit">Apply dates</button></form>
        <section class="panel item-sales-panel"><div class="dashboard-panel-heading"><h2>Items sold over time</h2></div><div id="item-sales-chart"><div class="dashboard-empty"><span class="spinner"></span></div></div></section>
        <div id="purchase-history"><div class="panel loading-state"><span class="spinner"></span>Loading purchase history…</div></div>`;
      const form = document.querySelector("#purchase-filters");
      const chart = document.querySelector("#item-sales-chart");
      const history = document.querySelector("#purchase-history");

      async function loadChart(values) {
        try {
          const query = new URLSearchParams({ item_id: itemId });
          Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
          const data = await api(`/api/inventory-items/sales?${query}`);
          form.start.value = data.start;
          form.end.value = data.end;
          const total = data.series.reduce((sum, point) => sum + Number(point.units_sold), 0);
          chart.innerHTML = `<div class="chart-summary"><strong>${escapeHtml(item.name)}</strong><span>${total.toLocaleString()} sold</span></div><div class="chart-canvas" id="item-sales-canvas"></div>${total ? "" : '<p class="chart-empty-label">No sales in this range.</p>'}`;
          renderSalesChart("item-sales", document.querySelector("#item-sales-canvas"), data.series, `Daily sales for ${item.name}`, "sold");
          return { start: data.start, end: data.end };
        } catch (error) {
          chart.innerHTML = `<div class="dashboard-empty">${escapeHtml(error.message)}</div>`;
          return values;
        }
      }

      async function loadHistory(page = 1, values = Object.fromEntries(new FormData(form))) {
        try {
          const query = new URLSearchParams({ page, page_size: 25 });
          Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
          const data = await api(`/api/inventory-items/${itemId}/purchases?${query}`);
          const rows = data.items.map((purchase) => `<tr><td>${dateTime(purchase.created_at)}</td><td>${userLink(purchase)}</td><td><span class="money">${money(-purchase.cents)}</span></td></tr>`);
          history.innerHTML = tablePanel(["Date", "User", "Amount"], rows, "No purchases match these dates.");
          history.querySelector("[data-pagination]")?.append(pagination(data.pagination, (nextPage) => loadHistory(nextPage)));
        } catch (error) {
          history.innerHTML = `<div class="panel error-state"><div><strong>Something went wrong</strong><p>${escapeHtml(error.message)}</p></div></div>`;
        }
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        setQuery(values);
        loadChart(values);
        loadHistory(1, values);
      });
      const initialValues = Object.fromEntries(new FormData(form));
      loadChart(initialValues).then((resolvedValues) => {
        loadHistory(Number(params.get("page")) || 1, resolvedValues);
      });
    } catch (error) { showError(error); }
  }

  async function userDetailPage(userId) {
    main.innerHTML = `<div class="panel loading-state"><span class="spinner"></span>Loading account…</div>`;
    try {
      const detail = await api(`/api/users/${userId}`);
      const user = detail.user;
      main.innerHTML = `<button class="back-link" data-browser-back type="button">← Back</button>
        <div class="page-heading"><div class="user-head"><span class="avatar">${escapeHtml(initials(user.username))}</span><div><h1>${escapeHtml(user.username)}</h1><p>${escapeHtml(user.email)}</p></div></div></div>
        <div class="stats-grid"><div class="stat-card"><small>Current balance</small><strong id="current-balance" class="${user.balance < 0 ? "negative" : ""}">${money(user.balance)}</strong></div><div class="stat-card"><small>Last account charge</small><strong style="font-size:17px">${dateTime(user.last_charge_at)}</strong></div><div class="stat-card"><small>User ID</small><strong>#${user.id}</strong></div></div>
        <form class="filters" id="history-filters"><div class="filter-field"><label for="start">Transactions from</label><input id="start" name="start" type="date" value="${escapeHtml(params.get("start") || "")}"></div><div class="filter-field"><label for="end">Through</label><input id="end" name="end" type="date" value="${escapeHtml(params.get("end") || "")}"></div><button class="button button-primary" type="submit">Apply dates</button></form>
        <div id="history"><div class="panel loading-state"><span class="spinner"></span>Loading transaction history…</div></div>`;
      const historyForm = document.querySelector("#history-filters");
      const history = document.querySelector("#history");
      async function loadHistory(page = 1) {
        try {
          const values = Object.fromEntries(new FormData(historyForm));
          setQuery(values);
          const query = new URLSearchParams({ page, page_size: 25 });
          Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
          const data = await api(`/api/users/${userId}/transactions?${query}`);
          history.innerHTML = tablePanel(["Date", "Item", "Type", "Amount"], transactionRows(data.items, false), "No transactions match these dates.");
          history.querySelector("[data-pagination]")?.append(pagination(data.pagination, loadHistory));
        } catch (error) { showError(error); }
      }
      historyForm.addEventListener("submit", (event) => { event.preventDefault(); loadHistory(); });
      loadHistory(Number(params.get("page")) || 1);
    } catch (error) { showError(error); }
  }

  async function logsPage() {
    main.innerHTML = `${heading("Logs", "", '<a class="button button-primary" href="/api/logs/export.csv">Export CSV</a>')}<div id="log-results"><div class="panel loading-state"><span class="spinner"></span>Loading audit log…</div></div>`;
    const logResults = document.querySelector("#log-results");
    async function loadLogs(page = 1) {
      try {
        const query = new URLSearchParams({ page, page_size: 25 });
        const data = await api(`/api/logs?${query}`);
        const rows = data.items.map((item) => `<tr><td>${dateTime(item.created_at)}<span class="cell-secondary">#${item.id}</span></td><td><span class="cell-primary">${escapeHtml(item.actor)}</span><span class="cell-secondary">${escapeHtml(item.ip_address || "Local SSH")}</span></td><td><span class="badge credit">${escapeHtml(item.action)}</span></td><td>${escapeHtml(item.entity_type)}${item.entity_id ? `<span class="cell-secondary">#${escapeHtml(item.entity_id)}</span>` : ""}</td><td><div class="log-details">${naturalDetails(item.details)}</div></td></tr>`);
        logResults.innerHTML = tablePanel(["Date", "Actor", "Action", "Target", "Details"], rows, "No audit records have been recorded.");
        logResults.querySelector("[data-pagination]")?.append(pagination(data.pagination, loadLogs));
      } catch (error) { showError(error); }
    }
    loadLogs(Number(params.get("page")) || 1);
  }

  const path = location.pathname.replace(/\/$/, "") || "/dashboard";
  const userMatch = path.match(/^\/users\/(\d+)$/);
  const itemMatch = path.match(/^\/inventory\/(\d+)$/);
  const inventoryItems = path === "/inventory/items";
  const restockHistory = path === "/volunteers/history";
  const route = userMatch ? "users" : itemMatch || inventoryItems ? "inventory" : restockHistory ? "volunteers" : path.slice(1);
  document.querySelector(`[data-route="${route}"]`)?.classList.add("active");
  const routes = { dashboard: dashboardPage, transactions: transactionsPage, volunteers: volunteersPage, debt: debtPage, users: usersPage, inventory: popularPage, logs: logsPage };
  if (userMatch) userDetailPage(userMatch[1]);
  else if (itemMatch) inventoryItemDetailPage(itemMatch[1]);
  else if (inventoryItems) inventoryItemsPage();
  else if (restockHistory) restockHistoryPage();
  else (routes[route] || dashboardPage)();

  const menuButton = document.querySelector("#menu-button");
  const closeMenu = () => { document.body.classList.remove("menu-open"); menuButton.setAttribute("aria-expanded", "false"); };
  menuButton.addEventListener("click", () => { const open = document.body.classList.toggle("menu-open"); menuButton.setAttribute("aria-expanded", String(open)); });
  document.querySelector("#scrim").addEventListener("click", closeMenu);
})();
