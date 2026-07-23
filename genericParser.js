function parseGeneric(order) {
  const items = extractItemsGeneric(order);
  const addr = extractAddressGeneric(order);

  const subject = order.match(/Subject:\s*(.*)/i)?.[1] || "";
  const paymentSection = getSection(
    order,
    "Payment/Shipping",
    "Deliver To|Products|$"
  );

  let po =
    matchFirst(paymentSection, GENERIC_RULES.po) ||
    matchFirst(order, GENERIC_RULES.po) ||
    "";

  if (!po) {
    const fallback = order.match(/\b(PO|ORDER)?[-\s#]*([A-Z0-9-]{6,})\b/i);
    if (fallback) po = fallback[2];
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
  const country = (addr.country || "").toUpperCase();
  row["Ship Service"] =
    country === "CA" || country === "CANADA"
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

  if (!items.length) {
    console.warn("Generic parser returned no items:", order);
  }

  return [row];
}

  function extractItemsGeneric(text) {
  text = normalizeBrokenLines(text);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

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
        .filter((m) => !isUPC(m.raw));

      if (scored.length) {
        const best = scored.sort((a, b) => b.score - a.score)[0];

        if (best.score >= 0.65) {
          items.push({
            sku: normalizeSKU(best.raw),
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

  let name = lines[0] || "";
  let addr1 = "",
    addr2 = "",
    city = "",
    state = "",
    zip = "";

  const addr1Index = lines.findIndex((l) => {
    const t = l.toLowerCase().trim();

    // must start with number
    if (!/^\d+/.test(t)) return false;

    // must contain letters (street name)
    if (!/[a-z]/i.test(t)) return false;

    // reject obvious non-address lines
    if (/ship to|bill to|customer information|phone|po#/i.test(t)) return false;

    return true;
  });

  if (addr1Index !== -1) {
    addr1 = lines[addr1Index];

    if (lines[addr1Index + 1] && !/,/.test(lines[addr1Index + 1])) {
      addr2 = lines[addr1Index + 1];
    }
  }

  // find city/state/zip
  for (let l of lines) {
    const parsed = parseCityStateZip(l);
    if (parsed.city) {
      city = parsed.city;
      state = parsed.state;
      zip = parsed.zip;
      break;
    }
  }

  const phoneMatch =
    matchFirst(text, GENERIC_RULES.phone) ||
    text.match(
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
    )?.[0] ||
    "";

  const phone = phoneMatch.replace(/\D/g, "");

  return {
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    country: "",
    phone
  };
}

function extractPhone(text) {
    const match =
      text.match(
        /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
      )?.[0] || "";

    return match.replace(/\D/g, "");
  }

function scoreSKU(str) {
  if (!str) return 0;

  let score = 0;

  // --- core signals ---
  if (/[A-Z]/i.test(str)) score += 0.2; // has letters
  if (/\d/.test(str)) score += 0.2; // has numbers
  if (/[-_]/.test(str)) score += 0.2; // has separator (very common in SKUs)

  // --- structure ---
  if (str.length >= 6 && str.length <= 25) score += 0.2;
  if (/^[A-Z0-9-_]+$/i.test(str)) score += 0.2; // clean format

  // --- strong SKU patterns ---
  if (/^[A-Z]{2,}-\d{2,}/i.test(str)) score += 0.3; // ABC-123
  if (/^[A-Z0-9]+-[A-Z0-9-]+$/i.test(str)) score += 0.3;

  // --- penalties (VERY important) ---
  if (/^\d{10,}$/.test(str)) score -= 0.6; // tracking number
  if (/^\d+$/.test(str)) score -= 0.4; // pure number
  if (/^\d{12,14}$/.test(str)) score -= 0.8; // UPC/EAN strong reject
  if (/^\d{1,5}$/.test(str)) score -= 0.5; // small numbers
  if (/invoice|order|tracking|phone/i.test(str)) score -= 0.5;

  return score;
}

function isLikelySKU(str) {
  return scoreSKU(str) >= 0.5;
}

function scoreSKUWithContext(line, prevLine = "", nextLine = "") {
  let score = scoreSKU(line);

  const context = (prevLine + " " + nextLine).toLowerCase();

  if (/qty|quantity|item|sku/.test(context)) score += 0.2;
  if (/\$\d+/.test(nextLine)) score += 0.1; // price nearby
  if (/ship|address|phone/.test(context)) score -= 0.2;
  return score;
}

function normalizeBrokenLines(text) {
  return text.replace(/-\s*\n\s*/g, "-");
}

function removeSubstrings(items) {
  return items.filter(
    (a) =>
      !items.some(
        (b) =>
          b !== a && b.sku.includes(a.sku) && b.sku.length - a.sku.length > 3
      )
  );
}

function stitchNextLineSKU(lines, index) {
  const current = lines[index];
  const next = lines[index + 1];

  if (!current || !next) return null;

  // ---- Case 1: broken with leading dash ----
  if (
    /[A-Z0-9]{4,}-[A-Z0-9]{2,}$/i.test(current) &&
    /^-[A-Z0-9]{1,}$/i.test(next)
  ) {
    return current + next;
  }

  // ---- Case 2: trailing single fragment ----
  if (/^[A-Z0-9-]{6,}$/i.test(current) && /^[A-Z0-9]{1,3}$/i.test(next)) {
    return current + next;
  }

  return null;
}

function getItemSection(text) {
  const start = text.search(/Item\s+Vendor\s+SKU/i);
  if (start === -1) return text;

  const end = text.search(/total|subtotal|receive by/i);
  return end > start ? text.slice(start, end) : text.slice(start);
}

function isUPC(str) {
  return /^\d{12}$/.test(str); // standard UPC
}

function generatePluginSuggestion(text) {
  return {
    itemPattern: "[A-Z0-9-]{6,}",
    addressHint: text.includes("Ship To"),
    poHint: /PO|Order/i.test(text),
    confidenceBoost: 0.3
  };
}

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
