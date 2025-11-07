// ----------------------
// Admin.js - Cleaned & Corrected
// ----------------------

window.addEventListener("DOMContentLoaded", () => {
  // ----------------------
  // DOM Elements
  // ----------------------
  const resultDiv = document.getElementById("action-result");

  // Transaction section
  const transactionEmailInput = document.getElementById("transaction-email");
  const transactionItemsDropdown = document.getElementById("transaction-items-dropdown");
  const transactionList = document.getElementById("transaction-list");
  const addTransactionBtn = document.getElementById("add-transaction-btn");
  const submitTransactionsBtn = document.getElementById("submit-transactions-btn");

  // Refund section
  const refundEmailInput = document.getElementById("refund-email");
  const refundTransactionsDropdown = document.getElementById("refund-transactions-dropdown");
  const refundItemsDropdown = document.getElementById("refund-items-dropdown");
  const refundList = document.getElementById("refund-list");
  const addRefundBtn = document.getElementById("add-refund-btn");
  const submitRefundsBtn = document.getElementById("submit-refunds-btn");

  // Users / Password section
  const userEmailsTextarea = document.getElementById("user-emails");
  const createUsersBtn = document.getElementById("create-users-btn");
  const resetEmailsTextarea = document.getElementById("reset-emails");
  const resetPasswordsBtn = document.getElementById("reset-passwords-btn");

  // ----------------------
  // In-memory storage
  // ----------------------
  let transactions = [];
  let pendingRefunds = [];

  // ----------------------
  // Load inventory items
  // ----------------------
  async function loadItems() {
    try {
      const res = await fetch("/api/items"); // expects [{id, name}]
      const data = await res.json();
      console.log(data);

      transactionItemsDropdown.innerHTML = '<option value="">Select item</option>';
      refundItemsDropdown.innerHTML = '<option value="">Select item</option>';

      // Sort alphabetically by name
      data.sort((a, b) => a.name.localeCompare(b.name));

      data.forEach(item => {
        const option1 = document.createElement("option");
        option1.value = item.id;
        option1.textContent = item.name;
        transactionItemsDropdown.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = item.id;
        option2.textContent = item.name;
        refundItemsDropdown.appendChild(option2);
      });
    } catch (err) {
      console.error("Failed to load items:", err);
      transactionItemsDropdown.innerHTML = '<option value="">Failed to load items</option>';
      refundItemsDropdown.innerHTML = '<option value="">Failed to load items</option>';
    }
  }

  // ----------------------
  // Helpers
  // ----------------------
  function getLines(textarea) {
    return textarea.value
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
  }

  function renderTransactions() {
    transactionList.innerHTML = "";
    transactions.forEach((t, index) => {
      const li = document.createElement("li");
      li.textContent = `${t.email} - ${t.itemName}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.style.marginLeft = "0.5em";
      deleteBtn.addEventListener("click", () => {
        transactions.splice(index, 1);
        renderTransactions();
      });

      li.appendChild(deleteBtn);
      transactionList.appendChild(li);
    });
  }

  function renderRefunds() {
    refundList.innerHTML = "";
    pendingRefunds.forEach((r, index) => {
      const li = document.createElement("li");
      li.textContent = `${r.email} - ${r.name}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.style.marginLeft = "0.5em";
      deleteBtn.addEventListener("click", () => {
        pendingRefunds.splice(index, 1);
        renderRefunds();
      });

      li.appendChild(deleteBtn);
      refundList.appendChild(li);
    });
  }

  // ----------------------
  // Refund dropdown mutual exclusivity
  // ----------------------
  refundTransactionsDropdown.addEventListener("change", () => {
    if (refundTransactionsDropdown.value) refundItemsDropdown.value = "";
  });

  refundItemsDropdown.addEventListener("change", () => {
    if (refundItemsDropdown.value) refundTransactionsDropdown.value = "";
  });

  // ----------------------
  // Fetch last 5 transactions for a user
  // ----------------------
  refundEmailInput.addEventListener("change", async () => {
    const email = refundEmailInput.value.trim();
    if (!email) return;

    try {
      const res = await fetch(`/api/user-transactions?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      console.log(data);

      refundTransactionsDropdown.innerHTML = '<option value="">Select recent transaction</option>';
      data.transactions.slice(0, 5).forEach(t => {
        const option = document.createElement("option");
        option.value = t.id;
        option.textContent = t.name;
        refundTransactionsDropdown.appendChild(option);
      });

      refundItemsDropdown.value = "";
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    }
  });

  // ----------------------
  // Handlers
  // ----------------------
  function addTransactionHandler() {
    const email = transactionEmailInput.value.trim();
    const itemId = transactionItemsDropdown.value;
    const itemName = transactionItemsDropdown.selectedOptions[0]?.textContent || "";

    if (!email || !itemId) {
      alert("Please enter an email and select an item.");
      return;
    }

    transactions.push({ email, itemId, itemName });
    renderTransactions();

    transactionEmailInput.value = "";
    transactionItemsDropdown.value = "";
  }

  function addRefundHandler() {
    const email = refundEmailInput.value.trim();
    let id, name;

    if (refundTransactionsDropdown.value) {
      id = refundTransactionsDropdown.value;
      name = refundTransactionsDropdown.selectedOptions[0].textContent;
    } else if (refundItemsDropdown.value) {
      id = refundItemsDropdown.value;
      name = refundItemsDropdown.selectedOptions[0].textContent;
    } else {
      alert("Select a transaction or an item.");
      return;
    }

    if (!email || !id) {
      alert("Enter email and select a transaction or item.");
      return;
    }

    pendingRefunds.push({ email, id, name });
    renderRefunds();

    refundTransactionsDropdown.value = "";
    refundItemsDropdown.value = "";
  }

  async function submitTransactionsHandler() {
    if (!transactions.length) return;

    const payload = transactions.map(t => ({ email: t.email, item_id: t.itemId }));

    try {
      const res = await fetch("/api/add-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: payload })
      });
      const data = await res.json();
      console.log(data);
      resultDiv.textContent = `Inserted: ${data.inserted}, Failed: ${data.failed?.length || 0}, Invalid: ${data.invalidFormat?.length || 0}`;
      transactions = [];
      renderTransactions();
    } catch (err) {
      console.error("Failed to submit transactions:", err);
    }
  }

  async function submitRefundsHandler() {
    if (!pendingRefunds.length) return;

    const payload = pendingRefunds.map(r => ({ email: r.email, item_id: r.id }));

    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refunds: payload })
      });
      const data = await res.json();
      console.log(data);
      resultDiv.textContent = `Refunded: ${data.inserted}, Failed: ${data.failed?.length || 0}, Invalid: ${data.invalidFormat?.length || 0}`;
      pendingRefunds = [];
      renderRefunds();
    } catch (err) {
      console.error("Failed to submit refunds:", err);
    }
  }

  async function createUsers() {
    const emails = getLines(userEmailsTextarea);
    if (!emails.length) return;

    try {
      const res = await fetch("/api/add-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails })
      });
      const data = await res.json();
      console.log(data);
      resultDiv.textContent = `Inserted: ${data.inserted}, Conflicts: ${data.conflicts?.length || 0}, Invalid: ${data.invalid?.length || 0}`;
      userEmailsTextarea.value = ""
    } catch (err) {
      console.error("Failed to create users:", err);
    }
  }

  async function resetPasswordsHandler() {
    const emails = getLines(resetEmailsTextarea);
    if (!emails.length) return;

    try {
      const res = await fetch("/api/reset-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails })
      });
      const data = await res.json();
      console.log(data);
      resultDiv.textContent = `Reset: ${data.reset}, Not Found: ${data.notFound?.length || 0}, Invalid: ${data.invalid?.length || 0}`;
      resetEmailsTextarea.value = ""
    } catch (err) {
      console.error("Failed to reset passwords:", err);
    }

  }

  // ----------------------
  // Initialize
  // ----------------------
  loadItems();

  // Event listeners
  addTransactionBtn.addEventListener("click", addTransactionHandler);
  submitTransactionsBtn.addEventListener("click", submitTransactionsHandler);
  createUsersBtn.addEventListener("click", createUsers);
  resetPasswordsBtn.addEventListener("click", resetPasswordsHandler);
  addRefundBtn.addEventListener("click", addRefundHandler);
  submitRefundsBtn.addEventListener("click", submitRefundsHandler);
});

