function parseGeneric(order) {
  const analysis = analyzeOrder(order);

  let items;

  const analyzedItems = analysis.itemCandidates || [];
  const genericItems = extractItemsGeneric(order);

if (analyzedItems.length >= genericItems.length) {
  console.log("ITEM SOURCE: analyzeOrder.itemCandidates");
  console.log("ANALYZER ITEMS:", analyzedItems);

  items = analyzedItems;
} else {
  console.log("ITEM SOURCE: extractItemsGeneric");
  console.log("GENERIC ITEMS:", genericItems);

  items = genericItems;
}

  const addr =
    analysis.addressCandidate && analysis.addressCandidate.addr1
      ? analysis.addressCandidate
      : extractAddressGeneric(order);

  const subject = order.match(/Subject:\s*(.*)/i)?.[1] || "";
  const paymentSection = getSection(
    order,
    "Payment/Shipping",
    "Deliver To|Products|$"
  );

  let po =
    analysis.poCandidates?.[0]?.value ||
    matchFirst(paymentSection, GENERIC_RULES.po) ||
    matchFirst(order, GENERIC_RULES.po) ||
    "";

  if (!po) {
    const fallback = order.match(
      /\b(?:PO|PURCHASE ORDER)[ \t]*#?[-:]?[ \t]*([A-Z0-9-]{4,})\b/i
    );

    if (fallback) {
      po = fallback[1].toUpperCase();
    }
  }

  function extractPhone(text) {
    const match =
      text.match(
        /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
      )?.[0] || "";

    return match.replace(/\D/g, "");
  }

  const detection = detectBestDealer(order);
  const detectedDealer = detection.dealer;

  const config =
    getEffectiveDealerConfig(detectedDealer) ||
    DEALER_CONFIG["redline360"];

  const dealer = detectedDealer;

  console.log("DETECTION:", detection);
  console.log("DETECTED DEALER:", detectedDealer);
  console.log("TEMPORARY DEALER:",
    detection.temporary ? detection.config : null
  );
  console.log("DEALER CONFIG:", config);
  console.log("DETECTED DEALER:", detectedDealer);
  console.log("ITEM BEFORE PRIMARY SKU:", items[0]);
  console.log(
    "PRIMARY SKU TEST:",
    getPrimarySKU(items[0] || {}, detectedDealer)
  );
  const row = {
    "DShipper ID": config.dshipper,
    "Tr.Orig.No.": po,
    "Cust. PO No.": po
  };

  const MAX_ITEMS = 5;

  for (let i = 0; i < MAX_ITEMS; i++) {
    const item = items[i] || {};

    const sku = getPrimarySKU(item, dealer);

    row[`Item ID ${i + 1}`] = sku;
    row[`Qty ${i + 1}`] = item.qty || "";

    if (item.price !== undefined && item.price !== "") {
  row[`Price ${i + 1}`] = Number(item.price);
  setPriceSource(row, i + 1, "dealer");
} else {
  row[`Price ${i + 1}`] = getPrice(dealer, sku);
  setPriceSource(row, i + 1, "priceTable");
}

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

  for (let i = 1; i <= 5; i++) {
    const item = items[i - 1];

    if (!item) continue;

    const dealerPrice = Number(item.price);

    if (Number.isFinite(dealerPrice) && dealerPrice > 0) {
      setOrderPriceSource(row, i, "dealer");
    } else {
      setOrderPriceSource(row, i, "priceTable");
    }
  }

  const country = (addr.country || "").toUpperCase();
  row["Ship Service"] = country === "CA" || country === "CANADA" ? "ST" : "GND";
  row["Ship Ins."] = "";
  row["Ship COD"] = "";

  const totalPrice = items.reduce((sum, item) => {
  const sku = getPrimarySKU(item, dealer);
  const price =
    Number(item.price) || Number(getPrice(dealer, sku)) || 0;

    const qty = Number(item.qty) || 0;

    return sum + price * qty;
  }, 0);

  row["Ship Confirm."] = totalPrice > 500 ? "Y" : "";

  // Z1 always uses third-party billing
  if (row["DShipper ID"] === "W7292") {
    row["Ship From"] = "Y";
    row["Ship Acct"] = "Y";
  }
  // TDOT only uses third-party billing for Canada
  else if (row["DShipper ID"] === "W7290" && row["Ship Country"] === "CA") {
    row["Ship From"] = "Y";
    row["Ship Acct"] = "Y";
  } else {
    row["Ship From"] = "";
    row["Ship Acct"] = "";
  }

  if (!items.length) {
    console.warn("Generic parser returned no items:", order);
  }
  console.log("Final row:");
  console.table(row);
  return [row];
}

function setPriceSource(row, index, source) {
  if (!row._priceSources) {
    Object.defineProperty(row, "_priceSources", {
      value: {},
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  row._priceSources[index] = source;
}

function getPriceSource(row, index) {
  return row._priceSources?.[index] || "priceTable";
}

function extractItemsGeneric(text) {
  text = normalizeBrokenLines(text);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const pelicanItems = [];

  for (const line of lines) {
    const match = line.match(
      /^#?\s*\d+\)?\s+(\d+)\s+\$?([\d,.]+)\s+\$?([\d,.]+)\s+([A-Z0-9][A-Z0-9._-]{5,})(?:\s*\(([^)]+)\))?/i
    );

    if (!match) {
      continue;
    }

    const qty = Number(match[1]);
    const price = Number(match[2].replace(/,/g, ""));
    const extCost = Number(match[3].replace(/,/g, ""));
    const sku = normalizeSKU(match[4]);
    const vendorSku = match[5] ? normalizeSKU(match[5]) : "";

    if (!isLikelySKU(sku)) {
      continue;
    }

    pelicanItems.push({
      sku,
      itemId: sku,
      vendorSku,
      qty,
      price,
      extCost
    });
  }

  if (pelicanItems.length) {
    return pelicanItems.slice(0, 5);
  }

  // EXISTING GENERIC LOGIC
  // Priority: Mfg SKU
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Mfg SKU$/i.test(lines[i])) {
      const sku = normalizeSKU(lines[i + 1]);

      if (isLikelySKU(sku)) {
        return [
          {
            sku,
            qty: 1
          }
        ];
      }
    }
  }

  const items = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // skip noise
    if (/phone|email|invoice|tracking|account/i.test(line)) continue;

    // ---- strong patterns first ----
    let match =
      line.match(/QTY[:\s]*(\d+)\s*[-:]\s*([A-Z0-9-]+)/i) ||
      line.match(/([A-Z0-9-]{6,})\s+(\d+)\s+\$/i);

    if (match) {
      const sku = normalizeSKU(match[2] || match[1]);
      const qty = Number(match[1] || match[2]);

      if (isLikelySKU(sku)) {
        items.push({ sku, qty });
        continue;
      }
    }

    // ---- SKU on one line, qty on next ----
    if (isLikelySKU(line) && lines[i + 1]) {
      const qtyMatch = lines[i + 1].match(/^(\d+)\b/);

      if (qtyMatch) {
        items.push({
          sku: normalizeSKU(line),
          qty: Number(qtyMatch[1])
        });

        i++;
        continue;
      }
    }

    // ---- fallback: find SKU only ----
    const matches = line.match(/[A-Z0-9-]{6,}/g) || [];

    if (matches.length) {
      const scored = matches
        .map((m) => ({
          raw: m,
          score: scoreSKUWithContext(m, lines[i - 1], lines[i + 1])
        }))
        .filter((m) => !isUPC(m.raw))
        .filter((m) => !/^\d{5}(-\d{4})?$/.test(m.raw));

      if (scored.length) {
        const best = scored.sort((a, b) => b.score - a.score)[0];

        const candidateSKU = normalizeSKU(best.raw);

        if (best.score >= 0.65 && isLikelySKU(candidateSKU)) {
          items.push({
            sku: candidateSKU,
            qty: 1
          });
        }
      }
    }
  }

  // remove duplicates
  const unique = Array.from(new Map(items.map((i) => [i.sku, i])).values());

  const cleaned = removeSubstrings(unique);

  return cleaned.slice(0, 5);
}

function extractLabeledSKU(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const preferredLabels = [
    "mfg sku",
    "manufacturer sku",
    "vendor sku",
    "part no",
    "part number"
  ];

  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i].toLowerCase().replace(".", "");

    if (preferredLabels.includes(label)) {
      const candidate = normalizeSKU(lines[i + 1]);

      if (isLikelySKU(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

function extractAddressGeneric(text) {
  const block = extractBlock(
    text,
    GENERIC_RULES.addressStart,
    GENERIC_RULES.addressEnd
  );

  if (!block) return {};

  let lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  lines = lines.filter((l) => !/customer information/i.test(l));

  if (lines[0] && /deliver to/i.test(lines[0])) {
    lines.shift();
  }

  console.log("===== GENERIC ADDRESS DEBUG =====");
  console.log("GENERIC ADDRESS BLOCK:", block);
  console.log("GENERIC ADDRESS LINES:", lines);

  let name = lines[0] || "";
  let addr1 = "";
  let addr2 = "";
  let city = "";
  let state = "";
  let zip = "";

  // Find city/state/zip first
  let cityIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCityStateZip(lines[i]);

    if (parsed.city) {
      city = parsed.city;
      state = parsed.state;
      zip = parsed.zip;
      cityIndex = i;
      break;
    }
  }

  // Find street address
  const addr1Index = lines.findIndex((l, index) => {
    const t = l.trim();

    // Don't consider the name as an address
    if (index === 0) return false;

    // Reject obvious non-address lines
    if (/ship to|bill to|customer information|phone|po\s*#|thanks/i.test(t)) {
      return false;
    }

    // Don't mistake city/state/zip for addr1
    if (parseCityStateZip(t).city) {
      return false;
    }

    // Normal street address:
    if (/^\d+\s+[A-Za-z]/.test(t)) {
      return true;
    }

    if (
      /^(?:unit|apt|apartment|suite)\s*#?\s*\d+\s*[-,]?\s*\d+\s+[A-Za-z]/i.test(
        t
      )
    ) {
      return true;
    }

    // #11 22935 Lougheed Hwy
    if (/^#\d+\s*[-,]?\s*\d+\s+[A-Za-z]/i.test(t)) {
      return true;
    }

    return false;
  });

  console.log("GENERIC ADDR1 INDEX:", addr1Index);
  console.log("GENERIC CITY INDEX:", cityIndex);

  // Extract addr1 / addr2
  if (addr1Index !== -1) {
    addr1 = lines[addr1Index];

    // Anything between addr1 and city/state/zip
    // is treated as addr2.
    if (cityIndex > addr1Index + 1) {
      addr2 = lines.slice(addr1Index + 1, cityIndex).join(", ");
    }
  }

  // Phone
  const phoneMatch =
    matchFirst(text, GENERIC_RULES.phone) ||
    text.match(
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
    )?.[0] ||
    "";

  const phone = phoneMatch.replace(/\D/g, "");

  // Normalize Canadian province/state
  const originalState = (state || "").trim();
  const stateKey = originalState.toLowerCase();

  const mappedState = PROVINCE_MAP[stateKey];

  if (mappedState) {
    state = mappedState;
  }

  // Detect country
  let country = "US";

  if (mappedState) {
    country = "CA";
  }

  if (lines.some((line) => /^canada$/i.test(line.trim()))) {
    country = "CA";
  }

  console.log("ADDRESS STATE NORMALIZATION:", {
    originalState,
    stateKey,
    mappedState,
    finalState: state,
    country
  });

  return {
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    country,
    phone
  };
}

function getItemSection(text) {
  const start = text.search(/Item\s+Vendor\s+SKU/i);
  if (start === -1) return text;

  const end = text.search(/total|subtotal|receive by/i);
  return end > start ? text.slice(start, end) : text.slice(start);
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

  const checklist = generateDealerChecklist(raw);

  metaEl.textContent = `
🧪 TEST MODE RESULTS

--- Dealer Setup Checklist ---

${checklist.detected.join("\n")}
${checklist.missing.length ? "\nNeeds Attention:\n" : ""}
${checklist.missing.join("\n")}

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

function suggestDetectionKeyword(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates = lines.filter(
    (line) =>
      !/ship|address|phone|purchase|order|quantity|product|part|price/i.test(
        line
      )
  );

  return candidates[0] || "";
}
