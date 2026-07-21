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
