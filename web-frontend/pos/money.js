export function price_row(item) {
  return `<div class='price-row'>
        <span class='price-name'>
            ${item.name}
        </span>
        <span class="dots"></span>
        <span class='price-cost'>
            ${dollars(item.cents)}
        </span>
    </div>`;
}

export function dollars(cents) {
  let d = Math.floor(cents / 100);
  let c = Math.abs(cents) % 100;
  return `${d}.${c < 10 ? "0" + c : c}`;
}
