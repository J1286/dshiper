// -------- GENERIC CONFIG 2.0 --------
// Experimental semantic / label configuration.
// This file does NOT replace config.js.

const GENERIC_CONFIG_V2 = {
  labels: {
    po: [
      "purchase order",
      "purchase order number",
      "purchase order no",
      "purchase order #",
      "po",
      "po#",
      "po #",
      "order number",
      "order no",
      "order #",
      "order id"
    ],

    shipTo: [
      "ship to",
      "ship-to",
      "shipping address",
      "shipping information",
      "shipping details",
      "delivery address",
      "delivery information",
      "delivery details",
      "deliver to",
      "recipient",
      "recipient address",
      "customer information"
    ],

    billTo: [
      "bill to",
      "bill-to",
      "billing address",
      "billing information",
      "billing details"
    ],

    item: [
      "sku",
      "item sku",
      "vendor sku",
      "manufacturer sku",
      "mfg sku",
      "part number",
      "part no",
      "part #",
      "item number",
      "item no",
      "item #",
      "product",
      "product number",
      "model"
    ],

    quantity: [
      "quantity",
      "qty",
      "order qty",
      "ordered quantity"
    ],

    price: [
      "unit price",
      "price",
      "unit cost",
      "cost",
      "amount"
    ],

    phone: [
      "phone",
      "phone number",
      "telephone",
      "tel",
      "contact number"
    ],

    email: [
      "email",
      "email address"
    ],

    country: [
      "country"
    ]
  },

  sectionEndLabels: {
    shipTo: [
      "bill to",
      "billing address",
      "payment",
      "items",
      "products",
      "order items",
      "subtotal",
      "total",
      "grand total",
      "shipping method",
      "shipping cost",
      "payment method"
    ],

    items: [
      "ship to",
      "shipping address",
      "deliver to",
      "bill to",
      "subtotal",
      "total",
      "grand total",
      "shipping",
      "payment"
    ]
  },

  addressPatterns: {
    street: [
      /^\d+\s+.+/i,
      /^p\.?\s*o\.?\s*box\s+\d+/i,
      /^#\s*\d+\s+.+/i
    ],

    usCityStateZip: [
      /^\d{5}(?:-\d{4})?\s+.+\s+[A-Z]{2}$/i,
      /^.+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i
    ],

    canadianPostal: [
      /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i
    ]
  },

  countryMap: {
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "u.s.a.": "US",
    "us": "US",

    "canada": "CA",
    "ca": "CA"
  }
};
