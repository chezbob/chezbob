export function price_row(item) {
  return `<div class="price-row">
        <span class="price-name">
            ${item.name}
        </span>
        <span class="dots"></span>
        <span class="price-cost">
            ${dollars(item.cents)}
        </span>
    </div>`;
}

export function dollars(cents, show_dollar_sign = false) {
  let d = Math.abs(Math.trunc(cents / 100));
  let c = Math.abs(Math.round(cents)) % 100;
  return `${cents < 0 ? "-" : ""}${show_dollar_sign ? "$" : ""}${d}.${c < 10 ? "0" + c : c}`;
}
