function buildPriceTable() {
  priceTable = {
    redline360: {},
    aag: {},
    tdot: {},
    pq: {}
  };

  allPriceRows.forEach((r) => {
    const sku = normalizeSKU(r["SKU"]);
    if (!sku) return;

    Object.keys(r).forEach((col) => {
      const key = col.toLowerCase();

      if (key.includes("redline")) {
        priceTable.redline360[sku] = r[col];
      } else if (key.includes("aag")) {
        priceTable.aag[sku] = r[col];
      } else if (key.includes("tdot")) {
        priceTable.tdot[sku] = r[col];
      } else if (key === "pq") {
        priceTable.pq[sku] = r[col];
      }
    });
  });
}

function getPrice(dealer, sku) {
  if (!sku) return "";

  let price = priceTable[dealer]?.[sku] ?? priceTable.pq?.[sku] ?? "";

  if (price === "") return "";

  // normalize floating point precision
  const num = Number(price);

  if (isNaN(num)) return price;

  return num.toFixed(2);
}

function updatePriceStatus() {
  const el = document.getElementById("priceStatus");
  const saved = localStorage.getItem("priceLastUpdated");

  if (!saved) {
    el.textContent = "No price table loaded";
    return;
  }

  const date = new Date(saved);
  const formatted = `${date.getMonth() + 1}/${date.getDate()}`;
  el.textContent = `Price Table Updated: ${formatted}`;
}

document.getElementById("priceFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    allPriceRows = XLSX.utils.sheet_to_json(sheet);

    // Save parsed data in localStorage
    localStorage.setItem("priceRows", JSON.stringify(allPriceRows));

    // Save timestamp
    const now = new Date();
    localStorage.setItem("priceLastUpdated", now.toISOString());

    buildPriceTable();
    updatePriceStatus(); // call function to update display
  };
  reader.readAsArrayBuffer(file);
});
