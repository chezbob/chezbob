// non-module code used for the POS user interface

// in milliseconds
const TIME_SPENT_XED_OUT = 1000;

// The default O character is U+2B24
const EYE_O = "&#11044;";

// It's important to pick a character that is supported by the FreeMono font;
// see the comment above the .eye selector in pos.css for gratuitous details
const EYE_X = "X";

function openEye(eyeSpan) {
  eyeSpan.innerHTML = EYE_O;
}

function closeEye(eyeSpan) {
  eyeSpan.innerHTML = EYE_X;
}

function pokeEye(eyeEvent) {
  /* When an eye is poked, we change the eye to an X using closeEye() and then
   * set a delay (of duration TIME_SPENT_XED_OUT) after which we will open the
   * eye. Notably, poking the eye while it is already closed resets the
   * delay -- we set a new timeout of the same duration (TIME_SPENT_XED_OUT)
   * after the most recent poke, and "clear" the old timeout. (Failing to do
   * this would result in repeated pokes causing the eye to jitter back and
   * forth between open and closed, which looks funny but also kinda sloppy.)
   */

  var eyeSpan = eyeEvent.target;
  closeEye(eyeSpan);

  // To make it easy to clear the old timeout, we store each eye's most recent
  // timeout ID in the eye's "poketimeoutid" data attribute.
  var prevTimeoutID = eyeSpan.dataset.poketimeoutid;
  // The default values of these IDs are empty strings (""), which have lengths
  // of zero. Note that, although the timeout IDs returned by setTimeout() are
  // numbers, all HTML data attributes are strings -- so we can always assume
  // that prevTimeoutID will be a string, and will thus have a defined length.
  if (prevTimeoutID.length > 0) {
    clearTimeout(prevTimeoutID);
  }

  var newTimeoutID = setTimeout(function () {
    openEye(eyeSpan);
  }, TIME_SPENT_XED_OUT);
  eyeSpan.dataset.poketimeoutid = newTimeoutID;
}

document.querySelectorAll(".eye").forEach(function (eyeSpan) {
  eyeSpan.addEventListener("mousedown", pokeEye);
});
