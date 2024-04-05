// non-module code used for the POS user interface

// in milliseconds
const TIME_SPENT_XED_OUT = 300;

// The default O character is U+2B24
const EYE_O = "&#11044;";

// I looked at a lot of X characters until I found something of roughly? the
// same dimensions as the default O character; the current X character is
// U+2718. For reference, other good X options include 2716 and 2717.
const EYE_X = "&#10008;";

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
