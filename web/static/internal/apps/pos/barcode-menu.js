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
    "Espresso": {
      defaultCents: 150,
      barcode: "845183001266",
    },
    "Oat Milk (150ml)": {
      defaultCents: 61,
      barcode: "813636022816",
    },
    "Tea Bag": {
      defaultCents: 11,
      barcode: "077652685053",
    },
  },
  "Small Snacks": {
    "Mott's Fruit Snacks": {
      defaultCents: 17,
      barcode: "016000477278",
    },
    Gushers: {
      defaultCents: 50,
      barcode: "1016094",
    },
    "Fruit by the Foot": {
      defaultCents: 38,
      barcode: "016000178847",
    },
    "Instant Oatmeal Packet": {
      defaultCents: 35,
      barcode: "030000569757",
    },
    "Madeleine Cookie": {
      defaultCents: 100,
      barcode: "697941861007",
    },
    "York Peppermint Pattie": {
      defaultCents: 10,
      barcode: "034000066421",
    },
  },
  Freezer: {
    Drumstick: {
      defaultCents: 100,
      barcode: "072554870262",
    },
    "Klondike Bar": {
      defaultCents: 80,
      barcode: "075856001105",
    },
  },
  Others: {
    Cutlery: {
      defaultCents: 25,
      barcode: "417645123481",
    },
  },
};
