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
  console.log("TDOT ADDRESS FROM GENERIC:", addr);
  return buildRow(order, "tdot", items, addr);
}

function parseZ1Wrapper(order) {
  const items = extractItemsZ1(order);
  const addr = extractAddressZ1(order);
  return buildRow(order, "z1", items, addr);
}

function parseNTXGlowWrapper(order) {
  const items = extractItemsNTXGlow(order);
  const addr = extractAddressNTXGlow(order);
  return buildRow(order, "ntxglow", items, addr);
}

function parseOMACWrapper(order) {
  const items = extractItemsOMAC(order);
  const addr = extractAddressOMAC(order);
  return buildRow(order, "omac", items, addr);
}

// -------- ITEM PARSERS --------
function extractItemsRedline(text) {
  const items = [];
  const blocks = text.split("SKU:");
  blocks.shift();

  blocks.forEach((block) => {
    const skuMatch = block.match(/^([^\n]+)/);
    const qtyMatch = block.match(/Quantity:\s*(\d+)/);

    if (skuMatch && qtyMatch) {
      items.push({
        sku: skuMatch[1].trim().toUpperCase(),
        qty: Number(qtyMatch[1]) || 0
      });
    }
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

  for (const line of lines) {
    if (/^qty|^brand/i.test(line)) continue;

    const parts = line.split(/\s+/);

    const qty = Number(parts[0]);
    if (!qty || qty > 100) continue; // sanity check

    // Let the centralized SKU detector find the best candidate.
    const best = findBestSKUInText(line);

    if (!best) continue;

    items.push({
      sku: best.sku,
      qty
    });
  }

  return items;
}

function extractItemsTDOT(text) {
  const items = [];

  const regex = /QTY:\s*(\d+)\s*-\s*SpecDTuning-([A-Z0-9-]+)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const qty = Number(match[1]);

    const bestSKU = findBestSKUInText(match[2]);

    if (!bestSKU) continue;

    items.push({
      qty,
      sku: bestSKU.sku
    });
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

    // only skip long lines if they are NOT product rows
    const hasProductData = /\s\d+\s+\$\d+\.\d+/.test(line);

    if (!hasProductData && (line.length > 40 || /\s{2,}/.test(line))) {
      continue;
    }

    // --- stitch SKU ---
    let stitched = stitchNextLineSKU(lines, i);
    if (stitched) {
      line = stitched;
      i++;
    }

    // ---- inline SKU + qty ----
    const inlineMatch = line.match(
      /([A-Z]{2,5}-[A-Z0-9-]{4,})\s+(\d+)\s+\$\d+\.\d{2}/i
    );

    if (inlineMatch) {
      const best = findBestSKUInText(inlineMatch[1]);

      if (best) {
        items.push({
          sku: best.sku,
          qty: Number(inlineMatch[2])
        });
      }

      continue;
    }

    // ---- standalone SKU ----
    const best = findBestSKUInText(line);

    if (best) {
      const nextLine = lines[i + 1] || "";
      const qtyMatch = nextLine.match(/^(\d+)/);

      const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

      if (qtyMatch) i++;

      items.push({
        sku: best.sku,
        qty
      });

      continue;
    }
  }

  return items.slice(0, 5);
}

function extractItemsNTXGlow(text) {
  text = cleanNTXGlowText(text);

  const items = [];

  const skuMatch = text.match(/SKU\s*\/\s*Part\s*#:\s*([A-Z0-9-]+)/i);
  const qtyMatch = text.match(/Quantity:\s*(\d+)/i);

  if (skuMatch) {
    items.push({
      sku: normalizeSKU(skuMatch[1]),
      qty: qtyMatch ? Number(qtyMatch[1]) : 1
    });
  }

  return items;
}

function extractItemsOMAC(text) {
  const items = [];

  const headerMatch = text.match(
    /Item\s+Vendor\s+SKU\s+Item\s+Description\s+Quantity\s+UPC-EAN\s+Rate\s+Amount/i
  );

  if (!headerMatch) {
    console.warn("OMAC: item header not found");
    return items;
  }

  let section = text.slice(headerMatch.index + headerMatch[0].length);

  const receiveByMatch = section.search(/Receive\s+By:/i);

  if (receiveByMatch !== -1) {
    section = section.slice(0, receiveByMatch);
  }

  section = section.trim();

  if (!section) {
    console.warn("OMAC: empty item section");
    return items;
  }

  const detailMatch = section.match(
    /\b(\d+)\s+(\d{10,14})\s+\$([\d,.]+)\s+\$([\d,.]+)\b/
  );

  if (!detailMatch) {
    console.warn("OMAC: quantity/UPC/price block not found", section);
    return items;
  }

  const qty = Number(detailMatch[1]) || 1;
  const upc = detailMatch[2];

  const rate = Number(detailMatch[3].replace(/,/g, "")) || 0;

  const amount = Number(detailMatch[4].replace(/,/g, "")) || 0;

  // Everything before Quantity is the product portion.
  const productText = section.slice(0, detailMatch.index).trim();

  const skuCandidates = [];

  const productLines = productText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < productLines.length; i++) {
    const current = productLines[i];
    const next = productLines[i + 1] || "";

    if (/^[A-Z0-9]+$/i.test(current) && /^[A-Z0-9-]+$/i.test(next)) {
      const combined = current + next;

      const normalized = normalizeSKU(combined);

      if (normalized && !isUPC(normalized)) {
        skuCandidates.push(normalized);
        i++;
        continue;
      }
    }

    const matches = current.match(/\b[A-Z0-9]+-[A-Z0-9-]+\b/gi) || [];

    for (const raw of matches) {
      const sku = normalizeSKU(raw);

      if (!sku) continue;
      if (isUPC(sku)) continue;

      skuCandidates.push(sku);
    }
  }

  debugLog("OMAC SKU CANDIDATES:", skuCandidates);

  if (!skuCandidates.length) {
    console.warn("OMAC: no SKU candidates found", productText);
    return items;
  }

  const bestCandidate = getBestSKU(skuCandidates);

  debugLog("OMAC BEST SKU:", bestCandidate);

  const sku = bestCandidate?.sku || "";

  items.push({
    sku,
    qty,
    price: rate,
    upc,
    amount
  });

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

function extractAddressNTXGlow(text) {
  const match = text.match(
    /Ship to:\s*(.*?)\s+(\d+\s+.+?)\s*\n\s*(.+?),\s*([A-Za-z\s]+)\s+([A-Z0-9\s-]+)\s+(United States|Canada)/i
  );

  if (!match) {
    console.log("NTXGlow address failed:", text);
    return {};
  }

  const country = match[6].trim();

  return {
    name: match[1].trim(),
    addr1: match[2].trim(),
    addr2: "",
    city: match[3].trim(),
    state: normalizeState(match[4].trim()),
    zip: match[5].trim().toUpperCase(),
    country: country === "Canada" ? "CA" : "US",
    phone: "000-000-0000"
  };

  // Canada format
  match = text.match(
    /Ship to:\s*(.*?)\s+(\d+\s+.+?)\s+([A-Z\s]+),\s*([A-Za-z\s]+)\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s+Canada/i
  );

  if (match) {
    return {
      name: match[1].trim(),
      addr1: match[2].trim(),
      addr2: "",
      city: match[3].trim(),
      state: normalizeState(match[4].trim()),
      zip: match[5].trim().toUpperCase(),
      country: "CA",
      phone: "000-000-0000"
    };
  }

  console.log("NTXGlow address failed:", text);
  return {};
}

function cleanNTXGlowText(text) {
  return text.replace(/Ship to:[\s\S]*?United States/i, "");
}

function extractAddressOMAC(text) {
  const shipMatch = text.match(/Ship\s+To\b/i);

  if (!shipMatch) {
    console.warn("OMAC: Ship To section not found");
    return {};
  }

  const afterShipTo = text.slice(shipMatch.index + shipMatch[0].length);

  const lines = afterShipTo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const countryIndexes = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^United States$/i.test(lines[i])) {
      countryIndexes.push(i);

      if (countryIndexes.length === 2) {
        break;
      }
    }
  }

  if (countryIndexes.length < 2) {
    console.warn(
      "OMAC: Could not find vendor/customer country boundaries",
      countryIndexes
    );
    return {};
  }

  const vendorCountryIndex = countryIndexes[0];
  const customerCountryIndex = countryIndexes[1];

  const customerLines = lines
    .slice(vendorCountryIndex + 1, customerCountryIndex)
    .map((l) => l.trim())
    .filter(Boolean);

  let phone = "";

  const afterCustomerCountry = lines.slice(customerCountryIndex + 1);

  for (const line of afterCustomerCountry) {
    const phoneMatch = line.match(
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
    );

    if (phoneMatch) {
      phone = phoneMatch[0].replace(/\D/g, "");
      break;
    }

    if (/^\$[\d,.]+/.test(line) || /^Receive\s+By/i.test(line)) {
      break;
    }
  }

  let city = "";
  let state = "";
  let zip = "";
  let cityIndex = -1;

  for (let i = 0; i < customerLines.length; i++) {
    const parsed = parseCityStateZip(customerLines[i]);

    if (parsed && parsed.city) {
      city = parsed.city.trim();
      state = normalizeState(parsed.state || "");
      zip = parsed.zip || "";
      cityIndex = i;
      break;
    }

    // OMAC fallback:
    // City State ZIP
    const match = customerLines[i].match(
      /^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
    );

    if (match) {
      city = match[1].trim();
      state = normalizeState(match[2]);
      zip = match[3].trim();
      cityIndex = i;
      break;
    }
  }

  const addrIndex = customerLines.findIndex((line) =>
    /^\d+\s+[A-Za-z]/.test(line)
  );

  if (addrIndex === -1) {
    console.warn("OMAC: Street address not found:", customerLines);

    return {
      name: customerLines[0] || "",
      addr1: "",
      addr2: "",
      city,
      state,
      zip,
      country: "US",
      phone
    };
  }

  const name = addrIndex > 0 ? customerLines[addrIndex - 1] : "";

  let addressLines = [];

  if (cityIndex > addrIndex) {
    addressLines = customerLines.slice(addrIndex, cityIndex);
  } else {
    addressLines = customerLines.slice(addrIndex);
  }

  const addr1 = addressLines[0] || "";

  const addr2 = addressLines.length > 1 ? addressLines.slice(1).join(" ") : "";

  const result = {
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    country: "US",
    phone
  };

  return result;
}