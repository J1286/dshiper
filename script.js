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

function getDealerFromRow(row) {
  return DSHIPPER_TO_DEALER[row["DShipper ID"]] || "redline360";
}

function safeParseOrder(order) {
  const detection = detectBestDealer(order);
  const detectedDealer = detection?.dealer;
  lastDetection = detection;

  let result;

  switch (detectedDealer) {
    case "aag":
    case "redline360":
    case "tdot":
    case "z1":
    case "newdealer":
      result = parseOrder(order);
      break;

    default:
      result = parseGeneric(order);
  }

  const row = result[0] || {};

  const itemCount = Object.keys(row).filter(
    (k) => k.includes("Item ID") && row[k]
  ).length;

  const hasItem = itemCount > 0;
  const hasGoodAddress = row["Ship Addr1"] && row["Ship City"];

  let qualityScore = 0;
  if (itemCount >= 1) qualityScore += 0.4;
  if (itemCount >= 2) qualityScore += 0.2;
  if (itemCount >= 3) qualityScore += 0.1;
  if (hasGoodAddress) qualityScore += 0.3;
  if (row["Tr.Orig.No."]) qualityScore += 0.1;

  if (!hasItem || !hasGoodAddress) {
    row["⚠️ Warning"] = "Missing Critical Data";
  } else if (qualityScore < 0.5) {
    row["⚠️ Warning"] = "Low Confidence Parse";
  }

  const fingerprint = order.replace(/\s+/g, " ").slice(0, 250);

  const confidence = detection?.confidence ?? 0;

  const shouldFlag =
    detectedDealer === "unknown" ||
    !hasItem ||
    !hasGoodAddress ||
    qualityScore < 0.5;

  if (shouldFlag) {
    const existing = unknownOrders.find((o) => o.fingerprint === fingerprint);

    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      unknownOrders.push({
        fingerprint,
        raw: order,
        detectedDealer,
        confidence
      });
    }
  }

  updateUnknownTable();
  return result;
}

function updateDetectionUI() {
  const el = document.getElementById("detectionInfo");

  if (!lastDetection) {
    el.textContent = "No order analyzed yet";
    return;
  }

  const lines = [];

  lines.push(`Best Match: ${lastDetection.dealer}`);
  lines.push(`Confidence: ${lastDetection.confidence.toFixed(2)}`);
  lines.push("");
  lines.push("Ranking:");

  lastDetection.ranked.forEach((r) => {
    lines.push(`- ${r.dealer}: ${r.score.toFixed(2)}`);
  });

  el.textContent = lines.join("\n");
}

function openRawViewer(index) {
  selectedUnknownOrder = unknownOrders[index];

  const viewer = document.getElementById("rawViewer");
  const textEl = document.getElementById("rawViewerText");
  const metaEl = document.getElementById("rawViewerMeta");

  textEl.textContent = selectedUnknownOrder.raw;

  metaEl.textContent = `
Dealer Guess: ${selectedUnknownOrder.detectedDealer || "unknown"}
Confidence: ${(selectedUnknownOrder.confidence ?? 0).toFixed(2)}
`.trim();

  viewer.style.display = "block";
}

function closeRawViewer() {
  document.getElementById("rawViewer").style.display = "none";
  selectedUnknownOrder = null;
}

function updateUnknownTable() {
  const head = document.getElementById("unknownHeader");
  const body = document.getElementById("unknownBody");
  const status = document.getElementById("unknownStatus");

  head.innerHTML = "";
  body.innerHTML = "";

  status.textContent = `Unknown Orders: ${unknownOrders.length}`;

  if (!unknownOrders.length) return;

  const headers = ["Dealer Guess", "Confidence", "Raw Preview"];

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  unknownOrders.forEach((o, index) => {
    const tr = document.createElement("tr");

    tr.style.cursor = "pointer";
    tr.onclick = () => openRawViewer(index);

    const preview = o.raw.slice(0, 120).replace(/\n/g, " ");

    const cells = [o.detectedDealer, o.confidence.toFixed(2), preview];

    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

// -------- PRICE TABLE --------
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

function normalizeSKU(sku) {
  if (!sku) return "";

  let clean = sku
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase();

  clean = clean.replace(/^SPECDTUNING[-_]?/i, "");

  return clean;
}

// -------- DEALER DETECTION --------
function scoreDealer(text) {
  const t = text.toLowerCase();

  const scores = {
    aag: 0,
    redline360: 0,
    tdot: 0,
    z1: 0,
    newdealer: 0,
    newdealer2: 0
  };

  // -------- AAG --------
  if (t.includes("spec-d tuning items purchased")) scores.aag += 0.6;
  if (t.includes("bill to") && t.includes("ship to")) scores.aag += 0.2;
  if (t.includes("aag")) scores.aag += 0.2;

  // -------- REDLINE --------
  if (t.includes("redline360")) scores.redline360 += 0.8;
  if (t.includes("sku:")) scores.redline360 += 0.1;
  if (t.includes("quantity:")) scores.redline360 += 0.1;

  // -------- TDOT --------
  if (t.includes("tdot")) scores.tdot += 0.7;
  if (/tdot\s*performance/i.test(t)) scores.tdot += 0.3;

  // -------- Z1 --------
  if (t.includes("z1 motorsports")) scores.z1 += 0.8;
  if (t.includes("qty") && /[a-z0-9-]{6,}/i.test(t)) scores.z1 += 0.2;
  if (t.includes("purchase order") && t.includes("fedex")) scores.z1 += 0.2;
  if (t.includes("deliver to")) scores.z1 += 0.2;
  if (t.includes("purchase order number")) scores.z1 += 0.2;
  if (t.includes("products item number")) scores.z1 += 0.3;

  // -------- NEW DEALER --------
  if (t.includes("ship to") && t.includes("brand")) scores.newdealer += 0.4;
  if (t.includes("purchase order")) scores.newdealer += 0.2;
  if (t.includes("unique keyword")) scores.newdealer2 += 0.8;

  return Object.entries(scores)
    .map(([dealer, score]) => ({ dealer, score }))
    .sort((a, b) => b.score - a.score);
}

function detectBestDealer(text) {
  const ranked = scoreDealer(text);

  const best = ranked[0];

  if (!best || best.score < 0.45) {
    return {
      dealer: "unknown",
      confidence: best ? best.score : 0,
      ranked
    };
  }

  return {
    dealer: best.dealer,
    confidence: best.score,
    ranked
  };
}

  // ---- build address lines safely ----
  const addressLines = [];

  for (let i = 0; i < block.length; i++) {
    const line = block[i];

    // skip phone
    if (line === phoneLine) continue;

    if (i === cityIndex) continue;

    if (i === cityIndex + 1) continue;

    // skip labels
    if (/ship to|bill to/i.test(line)) continue;

    // remove duplicates
    if (addressLines[addressLines.length - 1] === line) continue;

    addressLines.push(line);
  }

  return {
    name: addressLines[0] || "",
    addr1: addressLines[1] || "",
    addr2: addressLines.slice(2).join(" "),
    city: city.replace(/,\s*$/, ""),
    state,
    zip,
    country: "",
    phone
  };
}

// -------- PROCESS & PREVIEW --------
function processData() {
  const raw = document.getElementById("input").value;
  const orders = raw.includes("Subject:") ? raw.split(/(?=Subject:)/g) : [raw];
  let result = [];
  orders.forEach((o) => (result = result.concat(safeParseOrder(o))));
  return result;
}

function addOrders() {
  const newOrders = processData();
  previewOrders = previewOrders.concat(newOrders);
  const input = document.getElementById("input");
  if (input) input.value = "";
  updatePreview();
  updateDetectionUI();
  updateUnknownTable();
}

function updatePreview() {
  const head = document.getElementById("previewHeader"),
    body = document.getElementById("previewBody");
  head.innerHTML = "";
  body.innerHTML = "";
  document.getElementById(
    "output"
  ).textContent = `Orders: ${previewOrders.length}`;

  if (!previewOrders.length) return;
  const headers = Object.keys(previewOrders[0]);
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });
  previewOrders.forEach((r) => {
    const tr = document.createElement("tr");
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.contentEditable = true;
      td.textContent = r[h] || "";
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  document.getElementById(
    "output"
  ).textContent = `Orders: ${previewOrders.length}`;
}

function clearPreview() {
  previewOrders = [];
  updatePreview();

  lastDetection = null;
  updateDetectionUI();

  unknownOrders = [];
  selectedUnknownOrder = null;
  updateUnknownTable();

  const input = document.getElementById("input");
  if (input) input.value = "";

  document.getElementById("output").textContent = "Orders: 0";
}

function syncPreviewToOrders() {
  const head = document.getElementById("previewHeader"),
    body = document.getElementById("previewBody");
  const headers = Array.from(head.querySelectorAll("th")).map(
    (th) => th.textContent
  );
  const updatedOrders = [];
  Array.from(body.querySelectorAll("tr")).forEach((tr) => {
    const row = {};
    Array.from(tr.querySelectorAll("td")).forEach((td, i) => {
      row[headers[i]] = td.textContent;
    });
    updatedOrders.push(row);
  });

  previewOrders = updatedOrders;
}

function recalculateShipConfirm(row) {
  let total = 0;

  for (let i = 1; i <= 5; i++) {
    const price = parseFloat(row[`Price ${i}`]) || 0;
    const qty = parseFloat(row[`Qty ${i}`]) || 0;

    total += price * qty;
  }

  row["Ship Confirm."] = total > 500 ? "Y" : "";
}

function saveOrders() {
  syncPreviewToOrders();
  previewOrders.forEach(recalculateShipConfirm);

  savedOrders = savedOrders.concat(previewOrders);

  localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

  previewOrders = [];

  lastDetection = null; // clear detection UI
  updateDetectionUI();

  updatePreview();
  updateSavedTable();
}

function updateSavedTable() {
  const head = document.getElementById("savedHeader");
  const body = document.getElementById("savedBody");

  head.innerHTML = "";
  body.innerHTML = "";

  if (!savedOrders.length) return;

  // ---- headers ----
  const headers = Object.keys(savedOrders[0]);

  // # column
  const numTh = document.createElement("th");
  numTh.textContent = "#";
  head.appendChild(numTh);

  // actions column
  const actionTh = document.createElement("th");
  actionTh.textContent = "Actions";
  head.appendChild(actionTh);

  // normal headers
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  // ---- rows ----
  savedOrders.forEach((r, index) => {
    const tr = document.createElement("tr");

    // # cell
    const numTd = document.createElement("td");
    numTd.textContent = index + 1;
    tr.appendChild(numTd);

    // actions cell
    const actionTd = document.createElement("td");

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋";

    copyBtn.onclick = () => {
      const rowText = headers.map((h) => r[h] || "").join("\t");

      navigator.clipboard.writeText(rowText);

      copyBtn.textContent = "✅";

      setTimeout(() => {
        copyBtn.textContent = "📋";
      }, 800);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";

    deleteBtn.onclick = () => {
      const confirmed = confirm("Delete this order?");
      if (!confirmed) return;

      savedOrders.splice(index, 1);

      localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

      updateSavedTable();
    };

    actionTd.className = "action-cell";

    copyBtn.className = "action-btn";
    deleteBtn.className = "action-btn";

    actionTd.appendChild(copyBtn);
    actionTd.appendChild(deleteBtn);

    tr.appendChild(actionTd);

    // normal cells
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.textContent = r[h] || "";
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

function copyAllOrders() {
  if (!savedOrders.length) {
    alert("No saved orders to copy");
    return;
  }

  const headers = Object.keys(savedOrders[0]);

  const text = savedOrders
    .map((row) => headers.map((h) => row[h] || "").join("\t"))
    .join("\n");

  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert(`Copied ${savedOrders.length} orders`);
    })
    .catch((err) => {
      console.error("Copy failed:", err);
      alert("Copy failed");
    });
}

function downloadExcel() {
  if (!savedOrders.length) {
    console.log("No orders to download");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(savedOrders);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SavedOrders");

  // Generate file as blob instead of direct download
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SavedOrders.xlsx";
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearAllOrders() {
  const confirmed = confirm("Delete ALL saved orders?");
  if (!confirmed) return;

  savedOrders = [];
  localStorage.setItem("savedOrders", JSON.stringify(savedOrders));
  updateSavedTable();
}

// -------- INIT --------
window.onload = function () {
  updateUnknownTable();
  document.getElementById("app").style.display = "block";

  // restore price table
  const savedPrice = localStorage.getItem("priceRows");
  if (savedPrice) {
    allPriceRows = JSON.parse(savedPrice);
    buildPriceTable();
  }

  // restore saved orders
  const saved = localStorage.getItem("savedOrders");
  if (saved) {
    const parsed = JSON.parse(saved);
    savedOrders = Array.isArray(parsed) ? parsed : [];
    updateSavedTable();
  }

  updatePriceStatus();
};

function generateParserTemplate() {
  if (!selectedUnknownOrder) return;

  const text = selectedUnknownOrder.raw;

  const dealerName = prompt("Name this new dealer format (e.g. newdealer2)");
  if (!dealerName) return;

  const safeName = dealerName.replace(/\s+/g, "_").toLowerCase();

  // ---- extract preview signals ----
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const sampleLines = lines.slice(0, 8);

  const skuGuess = lines.find((l) => /[A-Z0-9-]{6,}/.test(l)) || "";
  const hasShipTo = text.toLowerCase().includes("ship to");
  const hasBillTo = text.toLowerCase().includes("bill to");

  // ---- build template ----
  const template = `
// ===== ${safeName.toUpperCase()} PARSER TEMPLATE =====

function extractItems_${safeName}(text) {
  const items = [];
  const section = getItemSection(text);

const lines = section
  .split("\n")
  .map(l => l.trim())
  .filter(Boolean);

  for (let line of lines) {
    // TODO: refine item extraction
    // sample line: ${sampleLines[0] || "N/A"}

    const match = line.match(/([A-Z0-9-]{6,})/);
    if (match) {
      items.push({
        sku: normalizeSKU(match[1]),
        qty: 1
      });
    }
  }

  return items;
}

testParserName = "${safeName}";

testParserFn = function(text) {
  const items = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  for (let line of lines) {
    const match = line.match(/([A-Z0-9-]{6,})/);
    if (match) {
      items.push({
        sku: normalizeSKU(match[1]),
        qty: 1
      });
    }
  }

  return [{
    "Test Parser": "${safeName}",
    "Items": items.length,
    "Raw Items": items
  }];
};

function extractAddress_${safeName}(text) {
  const lines = text.split("\\n").map(l => l.trim()).filter(Boolean);

  return {
    name: lines[0] || "",
    addr1: lines[1] || "",
    addr2: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    phone: ""
  };
}

// --- DETECTION RULE SUGGESTION ---
if (
  text.toLowerCase().includes("${
    lines[0]?.toLowerCase() || "unique_keyword"
  }") &&
  ${hasShipTo} &&
  ${hasBillTo}
) {
  return "${safeName}";
}

// --- CONFIG SUGGESTION ---
/*
${safeName}: {
  dshipper: "",
  email: ""
}
*/
`;

  // ---- show result ----
  const win = window.open("", "_blank");

  if (!win) {
    alert("Popup blocked. Please allow popups for this site.");
    return;
  }

  win.document.write(`<pre>${template}</pre>`);
  win.document.close();
}

function runTestParser() {
  if (!selectedUnknownOrder) return;

  const raw = selectedUnknownOrder.raw;

  // ---- generic result ----
  const generic = parseGeneric(raw)[0];

  // ---- test result ----
  let testResult = null;

  if (testParserFn) {
    testResult = testParserFn(raw)[0];
  }

  // ---- render output ----
  const metaEl = document.getElementById("rawViewerMeta");

  metaEl.style.background = "";

  if (testResult && testResult.Items > 0) {
    metaEl.style.background = "#f3fff3";
  }

  metaEl.textContent = `
🧪 TEST MODE RESULTS

--- Generic Parser ---
${JSON.stringify(generic, null, 2)}

--- Test Parser (${testParserName}) ---
${JSON.stringify(testResult, null, 2)}

--- Comparison ---
Items (Generic): ${
    Object.keys(generic).filter((k) => k.includes("Item")).length
  }
Items (Test): ${testResult?.Items || 0}
`.trim();
}
