(() => {
  "use strict";

  const menuButton = document.querySelector("#menu-button");
  function closeMenu() {
    document.body.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }
  menuButton.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  document.querySelector("#scrim").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
      closeMenu();
      menuButton.focus();
    }
  });
})();
