const STORAGE_KEY = "chezbob-accessible-font";

const fontToggleButton = document.createElement("button");
fontToggleButton.id = "font-toggle-btn";

function applyFont(usingAccessibleFont) {
  document.body.classList.toggle("accessible-font", usingAccessibleFont);
  fontToggleButton.textContent = usingAccessibleFont ? "Retro Font" : "Accessible Font";
}

fontToggleButton.addEventListener("click", function () {
  const toggleAccessibleFont = !document.body.classList.contains("accessible-font");
  localStorage.setItem(STORAGE_KEY, toggleAccessibleFont ? "1" : "");
  applyFont(toggleAccessibleFont);
});

const screen = document.getElementById("screen");
if (screen) {
  screen.appendChild(fontToggleButton);
}

applyFont(Boolean(localStorage.getItem(STORAGE_KEY)));
