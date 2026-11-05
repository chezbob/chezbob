(() => {
  "use strict";

  const root = document.querySelector("#costco-import");
  const uploadForm = document.querySelector("#invoice-upload");
  const matching = document.querySelector("#invoice-matching");
  const confirmation = document.querySelector("#invoice-confirmation");
  const matchForm = document.querySelector("#invoice-match-form");
  matchForm.noValidate = true;
  const confirmButton = document.querySelector("#confirm-invoice");
  const backButton = document.querySelector("#back-to-matches");
  let preview = null;
  let selections = [];
  let reviewedUpdates = null;
  let applied = false;

  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  const percent = (value) => new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(value);
  function message(id, text = "", tone = "") {
    const node = document.querySelector(`#${id}`);
    node.textContent = text;
    node.className = `form-message ${tone}`.trim();
  }
  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }
  const post = (path, payload) => api(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });

  function selectionCount() {
    const selected = selections.filter((row) => row.enabled.checked);
    const itemCount = selected.reduce((sum, row) => sum + row.itemIds.size, 0);
    document.querySelector("#invoice-selection-count").textContent =
      `${selected.length} invoice lines · ${itemCount} inventory items selected`;
  }

  function renderMatches(row) {
    const query = row.search.value.trim().toLocaleLowerCase();
    const byId = new Map(preview.catalog.map((item) => [item.id, item]));
    let candidates;
    if (query) {
      candidates = preview.catalog.filter((item) => item.name.toLocaleLowerCase().includes(query)).slice(0, 30);
    } else {
      candidates = row.line.suggested_item_ids.map((id) => byId.get(id)).filter(Boolean);
    }
    const ids = [...new Set([...row.itemIds, ...candidates.map((item) => item.id)])];
    row.options.replaceChildren();
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.className = "invoice-match-empty";
      empty.textContent = query ? "No inventory items match that search." : "Search inventory to choose a match, or leave this line unchecked.";
      row.options.append(empty);
    }
    for (const id of ids) {
      const item = byId.get(id);
      const label = document.createElement("label");
      label.className = "invoice-match-option";
      label.innerHTML = `<input type="checkbox" ${row.itemIds.has(id) ? "checked" : ""}><span>${escapeHtml(item.name)}<small>Current unit price ${money(item.cents)} · #${item.id}</small></span>`;
      label.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) row.itemIds.add(id);
        else row.itemIds.delete(id);
        row.enabled.checked = row.itemIds.size > 0;
        row.units.required = row.enabled.checked;
        if (!row.units.value && row.itemIds.size) row.units.value = item.unit_count || 1;
        selectionCount();
      });
      row.options.append(label);
    }
  }

  function renderLines() {
    const container = document.querySelector("#invoice-lines");
    container.replaceChildren();
    selections = preview.invoice.items.map((line) => {
      const card = document.createElement("article");
      card.className = "panel invoice-line";
      const id = line.line_id;
      const fee = line.crv_package_cents
        ? `${money(line.crv_package_cents)} CRV per package${line.crv_taxable ? " (taxable)" : ""}.` : "No CA redemption fee.";
      card.innerHTML = `
        <label class="invoice-line-heading"><input class="line-enabled" type="checkbox" ${line.selected_item_ids.length ? "checked" : ""}><span><strong>${escapeHtml(line.description)}</strong><small>Costco #${escapeHtml(line.sku)} · ${Number(line.shipped)} packages shipped · ${money(line.package_price_cents)} per package</small></span></label>
        <div class="invoice-line-layout">
          <div class="invoice-line-pricing"><div class="filter-field"><label for="units-${id}">Units in package</label><input id="units-${id}" type="number" inputmode="numeric" min="1" max="${root.dataset.maxUnits}" step="1" value="${line.unit_count || ""}" ${line.selected_item_ids.length ? "required" : ""}></div><p>${escapeHtml(fee)}<br>${line.taxable ? `${percent(preview.pricing.sales_tax_rate)} package sales tax.` : "Package is not taxable on this invoice."}</p></div>
          <div class="invoice-match-area"><p class="invoice-match-reason">${escapeHtml(line.match_reason)}</p><div class="filter-field invoice-match-search"><label for="search-${id}">Match existing inventory</label><input id="search-${id}" type="search" placeholder="Search item names" autocomplete="off"></div><div class="invoice-match-options"></div></div>
        </div>`;
      const row = {
        line, card, itemIds: new Set(line.selected_item_ids),
        enabled: card.querySelector(".line-enabled"), units: card.querySelector("input[type=number]"),
        search: card.querySelector("input[type=search]"), options: card.querySelector(".invoice-match-options"),
      };
      row.enabled.addEventListener("change", () => { row.units.required = row.enabled.checked; selectionCount(); });
      row.search.addEventListener("input", () => renderMatches(row));
      renderMatches(row);
      container.append(card);
      return row;
    });
    selectionCount();
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (preview && !applied && !window.confirm("Replace the current invoice review with a new upload?")) return;
    const button = uploadForm.querySelector("button");
    button.disabled = true;
    button.textContent = "Reading…";
    message("upload-message", "Reading invoice and finding inventory matches…");
    try {
      const next = await api("/api/inventory/costco/preview", { method: "POST", body: new FormData(uploadForm) });
      preview = next;
      reviewedUpdates = null;
      applied = false;
      document.querySelector("#invoice-label").textContent = preview.invoice.number ? `Invoice ${preview.invoice.number}` : preview.filename;
      document.querySelector("#invoice-pricing-note").textContent =
        `${preview.invoice.items.length} products found. Prices use ${percent(preview.pricing.profit_rate)} profit after invoice tax and redemption fees. Instant Savings are excluded.`;
      const warnings = document.querySelector("#invoice-warnings");
      warnings.textContent = preview.invoice.warnings.join(" ");
      warnings.classList.toggle("hidden", !preview.invoice.warnings.length);
      renderLines();
      confirmation.classList.add("hidden");
      matching.classList.remove("hidden");
      message("matching-message");
      message("upload-message", "Invoice ready to review. Inventory prices have not changed.", "success");
      matching.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      message("upload-message", error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Read invoice";
    }
  });

  matchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = selections.filter((row) => row.enabled.checked);
    if (!selected.length) { message("matching-message", "Select at least one invoice line to update.", "error"); return; }
    const unmatched = selected.find((row) => !row.itemIds.size);
    if (unmatched) {
      message("matching-message", `Choose an inventory match for Costco item ${unmatched.line.sku}, or uncheck its line.`, "error");
      unmatched.search.focus();
      return;
    }
    const invalidUnits = selected.find((row) => !row.units.checkValidity());
    if (invalidUnits) { invalidUnits.units.reportValidity(); return; }
    const updates = selected.map((row) => ({ line_id: row.line.line_id, item_ids: [...row.itemIds], unit_count: Number(row.units.value) }));
    const button = matchForm.querySelector('button[type="submit"]');
    button.disabled = true;
    message("matching-message", "Calculating price updates…");
    try {
      const result = await post(`/api/inventory/costco/${preview.preview_id}/review`, { updates });
      reviewedUpdates = updates;
      document.querySelector("#confirmation-count").textContent = `${result.updates.length} inventory items`;
      document.querySelector("#invoice-proposals").innerHTML = result.updates.map((item) => `<tr>
        <td><a class="user-link" href="/inventory/${item.item_id}">${escapeHtml(item.name)}</a></td>
        <td><span class="cell-primary">${money(item.line.package_price_cents)} / ${item.unit_count} units</span><span class="cell-secondary">Costco #${escapeHtml(item.line.sku)}${item.line.crv_package_cents ? ` · ${money(item.line.crv_package_cents)} CRV` : ""}</span></td>
        <td class="money" data-label="Current unit price">${money(item.current_price_cents)}</td><td class="money" data-label="New unit price">${money(item.unit_price_cents)}</td></tr>`).join("");
      confirmButton.textContent = `Confirm ${result.updates.length} price updates`;
      confirmButton.classList.remove("hidden");
      confirmButton.disabled = false;
      backButton.classList.remove("hidden");
      document.querySelector("#import-another").classList.add("hidden");
      message("confirmation-message");
      matching.classList.add("hidden");
      confirmation.classList.remove("hidden");
      confirmation.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      message("matching-message", error.message, "error");
    } finally { button.disabled = false; }
  });

  backButton.addEventListener("click", () => {
    confirmation.classList.add("hidden");
    matching.classList.remove("hidden");
    message("matching-message");
  });

  confirmButton.addEventListener("click", async () => {
    if (!reviewedUpdates || applied) return;
    confirmButton.disabled = true;
    backButton.disabled = true;
    message("confirmation-message", "Applying confirmed price updates…");
    try {
      const result = await post(`/api/inventory/costco/${preview.preview_id}/apply`, { updates: reviewedUpdates, confirmed: true });
      applied = true;
      message("confirmation-message", result.message, "success");
      message("upload-message");
      confirmButton.classList.add("hidden");
      backButton.classList.add("hidden");
      document.querySelector("#import-another").classList.remove("hidden");
    } catch (error) {
      message("confirmation-message", error.message, "error");
    } finally { confirmButton.disabled = false; backButton.disabled = false; }
  });

  document.querySelector("#import-another").addEventListener("click", () => {
    preview = null;
    selections = [];
    reviewedUpdates = null;
    applied = false;
    matching.classList.add("hidden");
    confirmation.classList.add("hidden");
    uploadForm.reset();
    document.querySelector("#invoice-file").focus();
  });
})();
