console.log("dealerParsers start"); 
// -------- MAIN PARSER --------
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

    // STRICT SKU RULE (Z1 specific)
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
let city = "";
let state = "";
let zip = "";
let cityIndex = -1;

for (let i = 0; i < block.length; i++) {

  let parsed = parseCityStateZip(block[i]);

  if (parsed.city && parsed.zip) {
    city = parsed.city;
    state = parsed.state;
    zip = parsed.zip;
    cityIndex = i;
    break;
  }

  const cityState = block[i].match(
    /^(.*?),\s*([A-Za-z]{2})$/i
  );

    if (cityState && block[i + 1]?.match(/^\d{5}/)) {
    city = cityState[1].trim();
    state = normalizeState(cityState[2]);
    zip = block[i + 1].trim();
    cityIndex = i;
    break;
  }
}

const addrIndex = cityIndex - 1;

let name = block[0] || "";
let addr1 = "";
let addr2 = "";

if (addrIndex >= 1) {
  // Street is always immediately after the name
  addr1 = block[1];

  // Everything between street and city becomes Addr2
  if (addrIndex > 1) {
    addr2 = block.slice(2, cityIndex).join(" ");
  }
}

name = block[0] || "";

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
  let name = "";

  if (addrIndex >= 0) {
    addr1 = usableLines[addrIndex];
  }

  const beforeAddress = usableLines.slice(0, addrIndex);

  if (beforeAddress.length) {
    name = beforeAddress[beforeAddress.length - 1];

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
