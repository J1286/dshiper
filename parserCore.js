function parseOrder(order) {
  const detection = detectBestDealer(order);
  const dealer = detection.dealer;

  lastDetection = detection;

  const plugin = PARSER_PLUGINS[dealer] || PARSER_PLUGINS.generic;

  const result = plugin.parse(order);

  return result;
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
  const country = detectCountry(addr);
  row["Ship Service"] =
    country === "CA"
      ? "ST"
      : "GND";

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

function getSection(text, startLabel, endLabel) {
  const start = text.search(new RegExp(startLabel, "i"));
  if (start === -1) return "";

  const slice = text.slice(start);

  if (!endLabel) return slice;

  const end = slice.search(new RegExp(endLabel, "i"));
  return end === -1 ? slice : slice.slice(0, end);
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

function getDealerFromRow(row) {
  return DSHIPPER_TO_DEALER[row["DShipper ID"]] || "redline360";
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
