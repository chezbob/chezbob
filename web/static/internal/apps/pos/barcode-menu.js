import barcodes from "../../../js/known-barcodes.js";

/*
  Some items in chezbob do not have barcodes and require an explicit UI to purchse
  The menu for these items is described structurally in this file, but the
  rendering logic is stored in mode.js.

  This file is also used by database seeds to ensure that all mentioned products
  can properly be scanned.
*/

const menu = {
  "Coffee &amp; Drinks": ["Cold Brew Coffee", "Espresso", "Oat Milk (150ml)"],
  "Small Snacks": ["Madeline Cookie", "York Peppermint Pattie"],
  "Ice Cream": ["Kirkland Ice Cream Bars", "Nestle Ice Cream"],
  Others: ["Cutlery"],
};

// Just do a little data validation to prevent dumb errors.
// This happens at load time and requires no network access
// so the impact is negligible. Just check that all items
// exist in the known-barcodes list
Object.values(menu)
  .flat()
  .forEach((item) => {
    if (!(item in barcodes)) {
      console.error("Menu contains unknown item", item);
    }
  });

export default menu;
