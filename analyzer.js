function analyzeOrder(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const itemSection = detectItemSection(lines);
  const itemCandidates = detectItemsFromSection(itemSection);
  const shipToSection = detectShipToSection(lines);

  const addressCandidate = detectAddressFromSection(shipToSection);

  const phoneCandidates = [];
  const skuCandidates = [];
  const poCandidates = [];

  lines.forEach((line, index) => {
    const matches = line.match(/\b(?:#?PO[-\s:#]*[A-Z0-9-]+)\b/i);

    if (matches) {
      console.log("FOUND PO:", matches[0]);

      poCandidates.push({
        value: matches[0].replace(/^#/, "").trim(),

        line: index,

        raw: line,

        score: 1
      });
    }
  });

  const uniquePO = Array.from(
    new Map(poCandidates.map((p) => [p.value, p])).values()
  );

  itemSection.lines.forEach((line, index) => {
    const matches = line.match(/[A-Z0-9-]{6,}/gi) || [];

    const ignoreWords = [
      "DESCRIPTION",
      "QUANTITY",
      "VENDOR",
      "SKU",
      "UPC-EAN",
      "AMOUNT",
      "RATE",
      "ITEM",
      "PRODUCT",
      "MODEL",
      "MODELS",
      "TEXTURED",
      "EXCLUDES",
      "FENDER",
      "FLARES",
      "DUALLY"
    ];

    matches.forEach((match) => {
      match = match.toUpperCase();

      if (ignoreWords.includes(match)) {
        return;
      }

      let score = 0.5;

      // SKU appears near pricing
      if (/\$[\d,.]+/.test(line)) {
        score += 0.2;
      }

      // SKU looks like a product line
      if (match.length >= 8) {
        score += 0.1;
      }

      // Pure numbers are more likely UPCs
      if (/^\d+$/.test(match)) {
        score -= 0.2;
      }

      const isUPC = /^\d{10,14}$/.test(match);

      skuCandidates.push({
        value: match,
        line: itemSection.startLine + index,
        raw: line,
        score: isUPC ? score - 0.3 : score,
        isUPC
      });
    });
  });

  skuCandidates.sort((a, b) => b.score - a.score);

  return {
    raw: text,

    lines,

    itemSection,

    itemCandidates,

    skuCandidates,

    poCandidates: uniquePO,

    phoneCandidates,

    emailCandidates: [],

    addressCandidate,

    keywordCandidates: []
  };
}

function detectItemSection(lines) {
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (/item|sku|product|model|part/i.test(lines[i])) {
      start = i;
      break;
    }
  }

  if (start === -1) {
    return {
      startLine: 0,
      endLine: lines.length,
      lines
    };
  }

  for (let i = start + 1; i < lines.length; i++) {
    if (/subtotal|total|tax|shipping|grand total/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return {
    startLine: start,

    endLine: end,

    lines: lines.slice(start, end)
  };
}

function detectItemsFromSection(itemSection) {
  const items = [];

  const lines = itemSection.lines;

  let currentSKUs = [];

  lines.forEach((line) => {
    const skuMatches = line.match(/^(?=.*[A-Z])(?=.*\d)[A-Z0-9-]{6,}$/i) || [];

    skuMatches.forEach((sku) => {
      sku = sku.toUpperCase();
      // reject header fragments
      if (
        sku.includes("UPC") ||
        sku.includes("SKU") ||
        sku.includes("DESCRIPTION")
      ) {
        return;
      }

      // ignore obvious words
      if (
        [
          "DESCRIPTION",
          "QUANTITY",
          "VENDOR",
          "SKU",
          "UPC",
          "UPC-EAN",
          "AMOUNT",
          "RATE",
          "ITEM",
          "PRODUCT",
          "MODEL",
          "MODELS",
          "TEXTURED",
          "EXCLUDES",
          "DUALLY",
          "FLARES",
          "FENDER"
        ].includes(sku)
      ) {
        return;
      }

      // ignore UPC
      if (/^\d{10,14}$/.test(sku)) {
        return;
      }

      currentSKUs.push(sku);
    });

    // quantity + UPC + price line
    const detailMatch = line.match(/(\d+)\s+(\d{10,14})\s+\$([\d.]+)/);

    if (detailMatch && currentSKUs.length) {
      items.push({
        itemId: currentSKUs[0] || "",
        vendorSku: currentSKUs[1] || "",
        qty: Number(detailMatch[1]),
        upc: detailMatch[2],
        price: Number(detailMatch[3])
      });

      currentSKUs = [];
    }
  });

  return items;
}

function detectAddressFromSection(shipToSection) {
  const lines = shipToSection.lines;

  let name = "";
  let addr1 = "";
  let addr2 = "";
  let city = "";
  let state = "";
  let zip = "";
  let country = "";
  let phone = "";

  // Phone
  for (const line of lines) {
    const match = line.match(
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
    );

    if (match) {
      phone = match[0].replace(/\D/g, "");
      break;
    }
  }

  // Country
  for (const line of lines) {
    if (/united states/i.test(line)) {
      country = "US";
    }

    if (/canada/i.test(line)) {
      country = "CA";
    }
  }

  // City / State / Zip
  for (const line of lines) {
    const parsed = parseCityStateZip(line);

    if (parsed.city) {
      city = parsed.city;
      state = parsed.state;
      zip = parsed.zip;
    }
  }

  // Street address
  const addressIndexes = [];

  lines.forEach((line, i) => {
    if (/^\d+/.test(line) && /[A-Za-z]/.test(line)) {
      addressIndexes.push(i);
    }
  });

  const addrIndex = addressIndexes.length
    ? addressIndexes[addressIndexes.length - 1]
    : -1;

  if (addrIndex !== -1) {
    addr1 = lines[addrIndex];

    if (lines[addrIndex + 1] && !parseCityStateZip(lines[addrIndex + 1]).city) {
      addr2 = lines[addrIndex + 1];
    }

    // Usually customer's name is just above address
    if (addrIndex > 0) {
      name = lines[addrIndex - 1];
    }
  }

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

function detectShipToSection(lines) {
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (/ship\s*to|deliver\s*to|shipping address/i.test(lines[i])) {
      start = i;
      break;
    }
  }

  if (start === -1) {
    return {
      startLine: -1,
      endLine: -1,
      lines: []
    };
  }

  for (let i = start + 1; i < lines.length; i++) {
    if (
      /bill\s*to|payment|item|sku|product|vendor|subtotal|total/i.test(lines[i])
    ) {
      end = i;
      break;
    }
  }

  return {
    startLine: start,
    endLine: end,
    lines: lines.slice(start + 1, end)
  };
}

function getPrimarySKU(item, dealer) {
  switch (dealer) {
    case "specd":
      return item.vendorSku || item.itemId || item.sku || "";

    case "dealerX":
      return item.itemId || item.vendorSku || item.sku || "";

    default:
      return item.sku || item.vendorSku || item.itemId || "";
  }
}
