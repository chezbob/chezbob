export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function menuContent(items) {
  const categories = new Map();
  for (const item of items) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0) continue;
    if (!categories.has(item.category)) categories.set(item.category, []);
    categories.get(item.category).push(item);
  }
  if (!categories.size) return "<p>No items are currently in this menu.</p>";
  return Array.from(categories, ([category, entries]) =>
    `<h1>${escapeHtml(category)}</h1><section>${entries.map((item) =>
      `<button data-item-id="${item.id}" onclick="window.mode.select_item(event)">${escapeHtml(item.name)}</button>`
    ).join("")}</section>`
  ).join("");
}

export async function loadMenu(socket) {
  const response = await socket.request({
    header: { to: "inventory", type: "no_barcode_menu" }, body: {},
  });
  if (!Array.isArray(response.body?.items)) throw new Error("Invalid menu response");
  return response.body.items;
}
