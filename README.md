Drop Ship Order V2.0

Browser-based order processing tool that:

- Parses order emails from multiple dealers
- Detects dealer format automatically
- Extracts SKUs, quantities, and shipping addresses
- Imports price tables from Excel
- Exports processed orders to Excel
- Stores saved orders locally in the browser
- Refactor completed
- Refactored JavaScript into modular files:
  - parser logic separated
  - dealer parsers separated
  - price table separated
  - order management separated
- git commit -m "Document refactor structure"
- Generic parser template upgraded to fit all dealer formats as possible
- 🚚 DropShip → Backorder API Integration
- Quick paste function added
- New temporary dealer setup

Future Features
- Continue to improve template generation (generate better detection rules automatically)
