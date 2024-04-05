// Will be run from the index page. Based on the wos.js code (thanks Eric)
// because i forgor how node works
function onlyShowIfLucky() {
  let r = Math.random(); // in [0, 1)
  if (r <= 0.1) {
    let ahp = document.getElementById("ah");
    ahp.innerHTML = 
        `<a href="apps/ah">Chez Bob's History (real)</a>`;
  }
}

onlyShowIfLucky();
