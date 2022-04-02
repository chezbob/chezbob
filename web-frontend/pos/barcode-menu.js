/*
  Some items in chezbob do not have barcodes and require an explicit UI to purchse
  The menu for these items is described structurally in this file, but the
  rendering logic is stored in mode.js.

  This file is also used by database seeds to ensure that all mentioned products
  can properly be scanned.
*/

export default {
  "Coffee &amp; Drinks": {
    "Cold Brew Coffee": {
      defaultCents: 100,
      barcode: "488348702402",
    },
  },
  "Small Snacks": {
    "Madeline Cookie": {
      defaultCents: 100,
      barcode: "697941861007",
    },
    "York Peppermint Pattie": {
      defaultCents: 10,
      barcode: "034000066421",
    },
  },
  "Ice Cream": {
    "Kirkland Ice Cream Bars": {
      defaultCents: 100,
      barcode: "482573882311",
    },

    "Nestle Ice Cream": {
      defaultCents: 100,
      barcode: "411337930531",
    },
  },
};
