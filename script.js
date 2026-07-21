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

function matchFirst(text, patterns) {
  for (let p of patterns) {
    const m = text.match(p);
    if (m) return (m[2] || m[1])?.trim();
  }
  return "";
}

function extractBlock(text, startPatterns, endPatterns) {
  let startIndex = -1;

  for (let p of startPatterns) {
    const m = text.search(p);
    if (m !== -1) {
      startIndex = m;
      break;
    }
  }

  if (startIndex === -1) return "";

  const afterStart = text.slice(startIndex);

  for (let p of endPatterns) {
    const m = afterStart.search(p);
    if (m !== -1) {
      return afterStart.slice(0, m);
    }
  }

  return afterStart;
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

function extractItemsZ1(text) {
  const items = [];

  // --- isolate product section ---
  const start = text.search(/Products\s+Item\s+Number/i);
  if (start === -1) return items;

  const section = text.slice(start);

  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // skip header row
    if (/products|item number|qty|price/i.test(line)) continue;

    // skip long descriptions
    if (line.length > 40 || /\s{2,}/.test(line)) continue;

    // --- stitch SKU ---
    let stitched = stitchNextLineSKU(lines, i);
    if (stitched) {
      line = stitched;
      i++;
    }

    line = normalizeSKU(line);

    // 🔒 STRICT SKU RULE (Z1 specific)
    // ---- extract inline SKU + qty ----
    const inlineMatch = line.match(/([A-Z0-9-]{8,})\s+(\d+)\s+\$\d/i);

    if (inlineMatch) {
      items.push({
        sku: normalizeSKU(inlineMatch[1]),
        qty: Number(inlineMatch[2])
      });

      continue;
    }

    // ---- standalone SKU ----
    if (/^[A-Z0-9-]{8,}$/i.test(line)) {
      const nextLine = lines[i + 1] || "";

      const qtyMatch = nextLine.match(/^(\d+)/);

      const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

      if (qtyMatch) i++;

      items.push({
        sku: normalizeSKU(line),
        qty
      });

      continue;
    }
  }

  return items.slice(0, 5);
}

function extractItemsTDOT(text) {
  const items = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let line of lines) {
    if (!line.includes("QTY:")) continue;

    const match = line.match(/QTY:\s*(\d+)\s*-\s*([A-Z0-9-]{6,})/i);

    if (!match) continue;

    const qty = Number(match[1]);
    const sku = normalizeSKU(match[2]);

    if (!isLikelySKU(sku)) continue;

    items.push({ sku, qty });
  }

  return items;
}

function extractAddressZ1(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const start = lines.findIndex((l) => /^Deliver To$/i.test(l));

  if (start === -1) return {};
  const block = lines.slice(start + 1, start + 10);

  const phone =
    block
      .find((l) => /^\d{10}$/.test(l.replace(/\D/g, "")))
      ?.replace(/\D/g, "") || "";

  const countryIndex = block.findIndex((l) => /^United States$/i.test(l));

  const usableLines =
    countryIndex !== -1
      ? block.slice(0, countryIndex)
      : block.filter((l) => l !== phone);

  let city = "";
  let state = "";
  let zip = "";
  let cityIndex = -1;

  // find city/state/zip line
  for (let i = 0; i < usableLines.length; i++) {
    const match = usableLines[i].match(
      /^(.*?),\s*(.+?)\s+(\d{5}(?:-\d{4})?)$/i
    );

    if (match) {
      city = match[1].trim();
      state = normalizeState(match[2].trim());
      zip = match[3].trim();
      cityIndex = i;
      break;
    }
  }

  const addrIndex = cityIndex - 1;

  let addr1 = "";
  let addr2 = "";

  if (addrIndex >= 0) {
    addr1 = usableLines[addrIndex];
  }

  const beforeAddress = usableLines.slice(0, addrIndex);

  let name = "";

  if (beforeAddress.length) {
    // last line before address = person's name
    name = beforeAddress[beforeAddress.length - 1];

    // everything before name = extra address info
    if (beforeAddress.length > 1) {
      addr2 = beforeAddress.slice(0, -1).join(" ");
    }
  }
  return {
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    country: "US",
    phone
  };
}

function parseCityStateZip(line) {
  if (!line) return {};

  // --- US: City, State ZIP (State can be full name) ---
  let m = line.match(/^(.*?)\s+([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);
  if (m) {
    const rawState = m[2].trim().toLowerCase();

    return {
      city: m[1].trim(),
      state: normalizeState(rawState),
      zip: m[3]
    };
  }

  m = line.match(/^(.*?),\s*([A-Za-z\s]+),?\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);

  if (m) {
    return {
      city: m[1].trim(),
      state: normalizeState(m[2]),
      zip: m[3]
    };
  }

  // --- Canada: City, Province Postal ---
  m = line.match(/^(.*?),\s*([A-Za-z\s]+),?\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);

  if (m) {
    const rawState = m[2].trim().toLowerCase();

    return {
      city: m[1].trim(),
      state: normalizeState(rawState),
      zip: m[3].toUpperCase()
    };
  }

  return {};
}

  function extractPhone(text) {
    const match =
      text.match(
        /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
      )?.[0] || "";

    return match.replace(/\D/g, "");
  }

  const detectedDealer = detectBestDealer(order).dealer;
  const config = DEALER_CONFIG[detectedDealer] || DEALER_CONFIG["redline360"];

  const dealer = detectedDealer;

  const row = {
    "DShipper ID": config.dshipper,
    "Tr.Orig.No.": po,
    "Cust. PO No.": po
  };

  const MAX_ITEMS = 5;

  for (let i = 0; i < MAX_ITEMS; i++) {
    const item = items[i] || {};
    const sku = item.sku || "";

    row[`Item ID ${i + 1}`] = sku;
    row[`Qty ${i + 1}`] = item.qty || "";

    row[`Price ${i + 1}`] = getPrice(dealer, sku);
  }

  row["Ship Name"] = addr.name || "";
  row["Ship Addr1"] = addr.addr1 || "";
  row["Ship Addr2"] = addr.addr2 || "";
  row["Ship City"] = addr.city || "";
  row["Ship State"] = addr.state || "";
  row["Ship Zip"] = addr.zip || "";
  row["Ship Country"] = detectCountry(addr);
  row["Ship Phone"] = addr.phone || "";
  row["Ship Email"] = config.email;
  row["Ship Service"] = "GND";

  const totalPrice = items.reduce((sum, item) => {
    const price = Number(getPrice(dealer, item.sku)) || 0;
    const qty = Number(item.qty) || 0;

    return sum + price * qty;
  }, 0);

  row["Ship Ins."] = "";
  row["Ship COD"] = "";
  row["Ship Confirm."] = totalPrice > 500 ? "Y" : "";

  row["Ship From"] = config.thirdParty ? "Y" : "";
  row["Ship Acct"] = config.thirdParty ? "Y" : "";

  if (!items.length) {
    console.warn("Generic parser returned no items:", order);
  }

  return [row];
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

function getSection(text, startLabel, endLabel) {
  const start = text.search(new RegExp(startLabel, "i"));
  if (start === -1) return "";

  const slice = text.slice(start);

  if (!endLabel) return slice;

  const end = slice.search(new RegExp(endLabel, "i"));
  return end === -1 ? slice : slice.slice(0, end);
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

// -------- ITEM PARSERS --------
function extractItemsRedline(text) {
  const items = [];
  const blocks = text.split("SKU:");
  blocks.shift();
  blocks.forEach((block) => {
    const skuMatch = block.match(/^([^\n]+)/);
    const qtyMatch = block.match(/Quantity:\s*(\d+)/);
    if (skuMatch && qtyMatch)
      items.push({
        sku: normalizeSKU(skuMatch[1]),
        qty: Number(qtyMatch[1]) || 0
      });
  });
  return items;
}

function extractItemsAAG(text) {
  const items = [];
  const section = text.split("Spec-D Tuning Items Purchased")[1];
  if (!section) return items;

  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let line of lines) {
    if (/^qty|^brand/i.test(line)) continue;

    const parts = line.split(/\s+/);

    const qty = Number(parts[0]);
    if (!qty || qty > 100) continue; // sanity check

    // find best SKU candidate in line
    const candidates = line.match(/[A-Z0-9-]{6,}/gi) || [];

    const scored = candidates
      .map((c) => ({
        sku: normalizeSKU(c),
        score: scoreSKU(c)
      }))
      .filter((c) => c.score >= 0.6);

    if (!scored.length) continue;

    const best = scored.sort((a, b) => b.score - a.score)[0];

    items.push({
      sku: best.sku,
      qty
    });
  }

  return items;
}

function extractItemsNewDealer(text) {
  const items = [];
  const section = text.split("Spec-D Tuning Items Purchased")[1];
  if (!section) return items;
  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let line of lines) {
    if (line.startsWith("Qty") || line.startsWith("Brand")) continue;
    const parts = line.split(/\s{2,}|\t+/);
    if (parts.length >= 2)
      items.push({ sku: normalizeSKU(parts.at(-1)), qty: Number(parts[0]) });
  }
  return items;
}

// -------- ADDRESS PARSERS --------
function normalizeState(state) {
  if (!state) return "";

  const s = state.trim().toLowerCase();
  if (s.length === 2) return s.toUpperCase();

  // US states first
  if (STATE_MAP[s]) return STATE_MAP[s];

  // Canadian provinces
  if (PROVINCE_MAP[s]) return PROVINCE_MAP[s];

  return state; // fallback
}

function extractAddressRedline(order) {
  const phone =
    (order.match(/Phone:\s*(.*)/) || [])[1]?.replace(/\D/g, "") || "";
  const addrMatch = order.match(/Shipping Address:\s*([\s\S]*?)Phone:/);
  const lines = addrMatch
    ? addrMatch[1]
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  let name = "",
    addr1 = "",
    addr2 = "",
    city = "",
    state = "",
    zip = "",
    country = "";
  if (lines.length >= 3) {
    name = lines[0];
    country = lines.at(-1);
    const cityLine = lines.at(-2);
    const street = lines.slice(1, -2);
    addr1 = street[0] || "";
    addr2 = street.slice(1).join(" ") || "";
    const m = cityLine.match(/^(.*?),\s*([A-Za-z\s]+)\s+([\d-]+)/);
    if (m) {
      city = m[1];
      state = normalizeState(m[2]);
      zip = m[3];
    }
  }
  return { name, addr1, addr2, city, state, zip, country, phone };
}

function extractAddressAAG(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let start = lines.findIndex((l) => l.toLowerCase() === "ship to");

  if (start === -1) return {};

  // stop before Bill To
  let end = lines.findIndex(
    (l, i) => i > start && l.toLowerCase() === "bill to"
  );

  if (end === -1) end = start + 10;

  const block = lines.slice(start + 1, end);

  // ---- phone ----
  const phoneLine =
    block.find((l) => /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(l)) || "";

  const phone = phoneLine.replace(/\D/g, "");

  // ---- city/state/zip ----
  let city = "",
    state = "",
    zip = "",
    cityIndex = -1;

  for (let i = 0; i < block.length; i++) {
    // combined line support
    const combined = `${block[i]} ${block[i + 1] || ""}`;

    let parsed = parseCityStateZip(combined);

    if (!parsed.city) {
      parsed = parseCityStateZip(block[i]);
    }

    if (parsed.city) {
      city = parsed.city;
      state = parsed.state;
      zip = parsed.zip;
      cityIndex = i;
      break;
    }

    // fallback:
    const m = block[i].match(/^(.*?),\s*([A-Za-z]{2})$/);

    if (m && block[i + 1]?.match(/^\d{5}/)) {
      city = m[1];
      state = normalizeState(m[2]);
      zip = block[i + 1];
      cityIndex = i;
      break;
    }
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

function extractAddressNewDealer(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let start = lines.findIndex((l) => l.toLowerCase() === "ship to");
  if (start === -1) return {};
  const block = lines.slice(start + 1, start + 7);
  let name = block[0] || "",
    addr1 = block[2] || "",
    cityLine = block[3] || "",
    zip = block[4] || "",
    phone = (block[5] || "").replace(/\D/g, "");
  const m = cityLine.match(/^(.*),\s*(.*)$/);
  let city = "",
    state = "";
  if (m) {
    city = m[1];
    state = normalizeState(m[2]);
  }
  return { name, addr1, addr2: "", city, state, zip, country: "", phone };
}

function detectCountry(addr) {
  const rawCountry = (addr.country || "").trim().toLowerCase();
  const zip = (addr.zip || "").replace(/\s+/g, "").toUpperCase();
  if (rawCountry.includes("canada") || rawCountry === "ca") return "CA";
  if (["us", "usa", "united states"].includes(rawCountry)) return "US";
  const canadaPostalRegex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
  const usZipRegex = /^\d{5}(-\d{4})?$/;
  if (canadaPostalRegex.test(zip)) return "CA";
  if (usZipRegex.test(zip)) return "US";
  return "US";
}

// -------- MAIN PARSER --------
function parseOrder(order) {
  const detection = detectBestDealer(order);
  const dealer = detection.dealer;

  lastDetection = detection;

  const plugin = PARSER_PLUGINS[dealer] || PARSER_PLUGINS.generic;

  const result = plugin.parse(order);

  return result;
}

function parseRedlineWrapper(order) {
  const items = extractItemsRedline(order);
  const addr = extractAddressRedline(order);
  return buildRow(order, "redline360", items, addr);
}

function parseAAGWrapper(order) {
  const items = extractItemsAAG(order);
  const addr = extractAddressAAG(order);
  return buildRow(order, "aag", items, addr);
}

function parseTDOTWrapper(order) {
  const items = extractItemsTDOT(order);
  const addr = extractAddressGeneric(order);
  return buildRow(order, "tdot", items, addr);
}

function parseZ1Wrapper(order) {
  const items = extractItemsZ1(order);
  const addr = extractAddressZ1(order);
  return buildRow(order, "z1", items, addr);
}

function parseNewDealerWrapper(order) {
  const items = extractItemsNewDealer(order);
  const addr = extractAddressNewDealer(order);
  return buildRow(order, "newdealer", items, addr);
}

function buildRow(order, dealer, items, addr) {
  const config = DEALER_CONFIG[dealer] || DEALER_CONFIG["redline360"];

  const paymentSection = getSection(
    order,
    "Payment/Shipping",
    "Deliver To|Products|$"
  );

  let po =
    matchFirst(paymentSection, GENERIC_RULES.po) ||
    matchFirst(order, GENERIC_RULES.po) ||
    "";

  const row = {
    "DShipper ID": config.dshipper,
    "Tr.Orig.No.": po,
    "Cust. PO No.": po
  };

  const MAX_ITEMS = 5;

  for (let i = 0; i < MAX_ITEMS; i++) {
    const item = items[i] || {};
    const sku = item.sku || "";

    row[`Item ID ${i + 1}`] = sku;
    row[`Qty ${i + 1}`] = item.qty || "";
    row[`Price ${i + 1}`] = getPrice(dealer, sku);
  }

  row["Ship Name"] = addr.name || "";
  row["Ship Addr1"] = addr.addr1 || "";
  row["Ship Addr2"] = addr.addr2 || "";
  row["Ship City"] = addr.city || "";
  row["Ship State"] = addr.state || "";
  row["Ship Zip"] = addr.zip || "";
  row["Ship Country"] = detectCountry(addr);
  row["Ship Phone"] = addr.phone || "";
  row["Ship Email"] = config.email;
  row["Ship Service"] = "GND";

  const totalPrice = items.reduce((sum, item) => {
    const price = Number(getPrice(dealer, item.sku)) || 0;
    const qty = Number(item.qty) || 0;

    return sum + price * qty;
  }, 0);

  row["Ship Ins."] = "";
  row["Ship COD"] = "";
  row["Ship Confirm."] = totalPrice > 500 ? "Y" : "";

  row["Ship From"] = config.thirdParty ? "Y" : "";
  row["Ship Acct"] = config.thirdParty ? "Y" : "";

  return [row];
}

function generatePluginSuggestion(text) {
  return {
    itemPattern: "[A-Z0-9-]{6,}",
    addressHint: text.includes("Ship To"),
    poHint: /PO|Order/i.test(text),
    confidenceBoost: 0.3
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
