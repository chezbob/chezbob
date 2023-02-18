// Will be run from the index page, to only sometimes show this. Based on the
// wos.js code (thanks Eric) because i forgor how node works
function onlyShowIfLucky() {
  let r = Math.random(); // in [0, 1)
  if (r <= 0.2) {
    let ahp = document.getElementById("alt-hist");
    ahp.innerHTML = 
        `<a href="apps/ah">Chez Bob's History (real)</a>`;
  }
}

onlyShowIfLucky();
