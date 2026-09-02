// -------- PRICE TABLE --------
// API
const PRICE_API_URL =
  "https://adcjrkudofddvmcpmdzw.supabase.co/functions/v1/get-prices";

// PRICE SOURCE
let priceSource = localStorage.getItem("priceSource") || "api";

// RUNTIME PRICE CACHE
const loadedPriceSKUs = new Set();

// EXCEL PRICE BACKUP
const priceFileInput = document.getElementById("priceFileInput");

if (priceFileInput) {
  priceFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);

        const workbook = XLSX.read(data, {
          type: "array"
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        allPriceRows = XLSX.utils.sheet_to_json(sheet);

        // Save parsed rows
        localStorage.setItem("priceRows", JSON.stringify(allPriceRows));

        // Save timestamp
        const now = new Date();

        localStorage.setItem("priceLastUpdated", now.toISOString());

        // Build price table
        buildPriceTable();

        // Reset API cache
        loadedPriceSKUs.clear();

        updatePriceStatus();

        updateExcelBackupStatus(file.name);

        console.log(
          "📊 Excel price table loaded:",
          allPriceRows.length,
          "rows"
        );
      } catch (error) {
        console.error("Excel price table error:", error);

        const status = document.getElementById("priceBackupStatus");

        if (status) {
          status.textContent = "⚠️ Unable to read price table";
        }
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// BUILD PRICE TABLE FROM EXCEL

function buildPriceTable() {
  priceTable = {
    redline360: {},
    aag: {},
    tdot: {},
    pq: {},
    ntxglow: {},
    omac: {}
  };

  allPriceRows.forEach((r) => {
    const sku = normalizeSKU(r["SKU"]);

    if (!sku) {
      return;
    }

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
      } else if (key.includes("ntxglow")) {
        priceTable.ntxglow[sku] = r[col];
      } else if (key.includes("omac")) {
        priceTable.omac[sku] = r[col];
      }
    });
  });
}

// PRICE API

async function loadPricesForSKUs(skus) {
  // EXCEL MODE
  if (priceSource === "excel") {
    console.log("📊 Using Excel price backup");

    return true;
  }

  // VALIDATE
  if (!Array.isArray(skus) || !skus.length) {
    return true;
  }

  // NORMALIZE + REMOVE DUPLICATES
  const normalizedSKUs = [
    ...new Set(skus.map((sku) => normalizeSKU(sku)).filter(Boolean))
  ];

  if (!normalizedSKUs.length) {
    return true;
  }

  // ONLY REQUEST SKUs WE DON'T ALREADY HAVE
  const missingSKUs = normalizedSKUs.filter((sku) => !loadedPriceSKUs.has(sku));

  // EVERYTHING ALREADY CACHED
  if (!missingSKUs.length) {
    console.log("All", normalizedSKUs.length, "SKUs already cached");

    updatePriceStatus();

    return true;
  }

  console.log("Requesting prices for", missingSKUs.length, "new SKUs");

  // API REQUEST
  try {
    updatePriceStatus(`⏳ Loading ${missingSKUs.length} SKU prices...`);

    const startTime = performance.now();

    const response = await fetch(PRICE_API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        skus: missingSKUs
      })
    });

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const timingIcon = elapsed >= 3 ? "🔴" : elapsed >= 1 ? "🟡" : "🟢";

    console.log(
      `${timingIcon} Price API response time: ${elapsed}s`,
      `| ${missingSKUs.length} SKU(s)`,
      missingSKUs
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Price API request failed");
    }

    const prices = result.prices || {};

    // MAKE SURE PRICE BUCKETS EXIST
    priceTable.redline360 ||= {};
    priceTable.aag ||= {};
    priceTable.tdot ||= {};
    priceTable.pq ||= {};
    priceTable.ntxglow ||= {};
    priceTable.omac ||= {};

    // STORE RETURNED PRICES
    Object.entries(prices).forEach(([sku, row]) => {
      const normalizedSKU = normalizeSKU(sku);

      if (!normalizedSKU || !row) {
        return;
      }

      if (row.redline360 != null) {
        priceTable.redline360[normalizedSKU] = row.redline360;
      }

      if (row.aag != null) {
        priceTable.aag[normalizedSKU] = row.aag;
      }

      if (row.tdot != null) {
        priceTable.tdot[normalizedSKU] = row.tdot;
      }

      if (row.pq != null) {
        priceTable.pq[normalizedSKU] = row.pq;
      }

      if (row.ntxglow != null) {
        priceTable.ntxglow[normalizedSKU] = row.ntxglow;
      }

      if (row.omac != null) {
        priceTable.omac[normalizedSKU] = row.omac;
      }

      // Mark SKU as loaded
      loadedPriceSKUs.add(normalizedSKU);
    });

    updatePriceStatus(`✓ Price Database: ${loadedPriceSKUs.size} SKUs cached`);

    console.log("Price API loaded:", Object.keys(prices).length, "SKUs");

    console.log("Total cached:", loadedPriceSKUs.size, "SKUs");

    return true;
  } catch (error) {
    console.error("Price API error:", error);

    updatePriceStatus("⚠️ Unable to load prices");

    return false;
  }
}

// GET PRICE
function getPrice(dealer, sku) {
  if (!sku) {
    return "";
  }

  const normalizedSKU = normalizeSKU(sku);

  if (!normalizedSKU) {
    return "";
  }

  const dealerKey = String(dealer || "")
    .trim()
    .toLowerCase();

  const price =
    priceTable[dealerKey]?.[normalizedSKU] ??
    priceTable.pq?.[normalizedSKU] ??
    "";

  if (price === "") {
    return "";
  }

  const num = Number(price);

  if (Number.isNaN(num)) {
    return price;
  }

  return num.toFixed(2);
}

// PRICE SOURCE TOGGLE
function handlePriceSourceToggle() {
  const toggle = document.getElementById("priceApiToggle");

  const label = document.getElementById("priceSourceLabel");

  const backupControls = document.getElementById("excelBackupControls");

  if (!toggle) {
    return;
  }

  // DETERMINE SOURCE
  priceSource = toggle.checked ? "api" : "excel";

  // Remember user's choice
  localStorage.setItem("priceSource", priceSource);

  // API MODE
  if (priceSource === "api") {
    if (label) {
      label.textContent = "ON";
    }

    if (backupControls) {
      backupControls.style.display = "none";
    }

    loadedPriceSKUs.clear();

    console.log("💰 Price source: API");

    updatePriceStatus();

    return;
  }

  // EXCEL BACKUP MODE
  if (label) {
    label.textContent = "OFF";
  }

  if (backupControls) {
    backupControls.style.display = "block";
  }

  loadedPriceSKUs.clear();

  console.log("📊 Price source: Excel Backup");

  // Restore existing Excel table
  restoreExcelPriceTable();

  updateExcelBackupStatus();
  updatePriceStatus();
}

// EXCEL BACKUP STATUS
function updateExcelBackupStatus(fileName) {
  const el = document.getElementById("priceBackupStatus");

  if (!el) {
    return;
  }

  const saved = localStorage.getItem("priceLastUpdated");

  if (!saved) {
    el.textContent = "⚠️ No backup price table loaded";

    return;
  }

  const date = new Date(saved);

  const formatted =
    `${date.getMonth() + 1}/${date.getDate()} ` +
    `${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    })}`;

  el.textContent = `✓ Price Table Uploaded: ${formatted}`;
}

// PRICE STATUS
function updatePriceStatus(message) {
  const el = document.getElementById("priceStatus");

  if (!el) {
    return;
  }

  if (message) {
    el.textContent = message;
    return;
  }

  if (priceSource === "api") {
    el.textContent = "✓ Price Database: API";

    return;
  }

  const saved = localStorage.getItem("priceLastUpdated");

  if (!saved) {
    el.textContent = "⚠️ No backup price table loaded";

    return;
  }

  const date = new Date(saved);

  const formatted =
    `${date.getMonth() + 1}/${date.getDate()} ` +
    `${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    })}`;

  el.textContent = `✓ Price Table Uploaded: ${formatted}`;
}

function restoreExcelPriceTable() {
  const saved = localStorage.getItem("priceRows");

  if (!saved) {
    console.log("📊 No saved Excel price table found");

    return false;
  }

  try {
    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed) || !parsed.length) {
      console.log("📊 Saved Excel price table is empty");

      return false;
    }

    allPriceRows = parsed;

    buildPriceTable();

    console.log("📊 Restored Excel price table:", allPriceRows.length, "rows");

    return true;
  } catch (error) {
    console.error("Failed to restore Excel price table:", error);

    return false;
  }
}