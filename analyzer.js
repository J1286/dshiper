function analyzeOrder(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const itemSection = detectItemSection(lines);
  const itemCandidates = detectItemsFromSection(itemSection);

  const shipToSection = detectShipToSection(lines);
  console.log("ALL LINES:");
  console.table(lines);
  console.log("SHIP TO RAW:");
  console.table(shipToSection.lines);

  const addressCandidate = detectAddressFromSection(shipToSection);

  const phoneCandidates = [];
  const skuCandidates = [];
  const poCandidates = [];

  lines.forEach((line, index) => {
    const match = line.match(
  /\b(?:PURCHASE\s+ORDER|P\.?O\.?)\b\s*(?:#|NUMBER|NO\.?)?\s*:?\s*([A-Z0-9-]{4,})/i
);

    if (match) {
      poCandidates.push({
        value: match[1].toUpperCase(),
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
    const matches = line.match(/^(?=.*[A-Z])(?=.*\d)[A-Z0-9-]{8,20}$/i) || [];

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
    if (
      /^(part number|item vendor sku|item sku|sku|product|model)/i.test(
        lines[i]
      )
    ) {
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
    if (
      /subtotal|total|tax|shipping|grand total|ship to|purchase order|po date/i.test(
        lines[i]
      )
    ) {
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const skuMatches =
      line.match(/^(?=.*[A-Z])(?=.*\d)[A-Z0-9-]{8,20}$/i) || [];

    skuMatches.forEach((sku) => {
      sku = sku.toUpperCase();
      const digitCount = (sku.match(/\d/g) || []).length;
      if (digitCount < 2) {
        return;
      }
      // reject phone numbers
      if (/^\d{3}[-.\s]\d{3}[-.\s]\d{4}$/.test(sku)) {
        return;
      }

      // reject address fragments
      if (/^[A-Z]-\d{2}-\d{4}$/i.test(sku)) {
        return;
      }

      // reject UPC
      if (/^\d{10,14}$/.test(sku)) {
        return;
      }

      // Handle split SKU
      if (sku.endsWith("-") && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();

        if (/^[A-Z0-9-]+$/i.test(nextLine)) {
          sku += nextLine.toUpperCase();
        }
      }

      // Ignore obvious words
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

      // Ignore UPC
      if (/^\d{10,14}$/.test(sku)) {
        return;
      }

      currentSKUs.push(sku);
    });

    // Quantity + UPC + price line
    const detailMatch = line.match(/(\d+)\s+([\d.]+)\s+([\d.]+)/);

    if (detailMatch && currentSKUs.length) {
      items.push({
        itemId: currentSKUs[0] || "",
        vendorSku: currentSKUs[1] || "",
        qty: Number(detailMatch[1]),
        upc: /^\d{10,14}$/.test(detailMatch[2]) ? detailMatch[2] : "",
        price: Number(detailMatch[3])
      });

      currentSKUs = [];
    }
  }

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

  // -------------------------
  // Phone
  // -------------------------
  for (const line of lines) {
    const match = line.match(
      /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/
    );

    if (match) {
      phone = match[0].replace(/\D/g, "");
      break;
    }
  }

  // -------------------------
  // Country
  // -------------------------
  for (const line of lines) {
    if (/united states/i.test(line)) {
      country = "US";
      break;
    }

    if (/canada/i.test(line)) {
      country = "CA";
      break;
    }
  }

  // -------------------------
  // City / State / ZIP
  // -------------------------
  let cityLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCityStateZip(lines[i]);

    if (parsed.city) {
      city = parsed.city;
      state = parsed.state;
      zip = parsed.zip;
      cityLineIndex = i;
      break;
    }
  }

  // -------------------------
  // Street address + name
  // -------------------------
  if (cityLineIndex > 0) {
    let addrStartIndex = -1;

    // Find street address
    for (let i = cityLineIndex - 1; i >= 0; i--) {
      if (/^\d+/.test(lines[i]) && /[A-Za-z]/.test(lines[i])) {
        addrStartIndex = i;
        break;
      }
    }

    if (addrStartIndex !== -1) {
      // Find customer name immediately before address
      for (let i = addrStartIndex - 1; i >= 0; i--) {
        const candidate = lines[i].trim();

        if (!candidate) {
          continue;
        }

        if (/^(ship\s*to|deliver\s*to|shipping\s*address)$/i.test(candidate)) {
          continue;
        }

        if (/^(vendor|customer|phone|phone\s*#)$/i.test(candidate)) {
          continue;
        }

        if (/united states|canada/i.test(candidate)) {
          continue;
        }

        if (/^\d+/.test(candidate)) {
          continue;
        }

        if (/phone|purchase order|po\s*#/i.test(candidate)) {
          continue;
        }

        name = candidate;
        break;
      }

      // Get address lines
      const addressLines = lines.slice(addrStartIndex, cityLineIndex);

      // Find Apt / Unit / Suite
      const unitIndex = addressLines.findIndex((line) =>
        /^(apt|apartment|unit|suite|ste|#)\b/i.test(line)
      );

      if (unitIndex !== -1) {
        addr2 = addressLines[unitIndex];
        addressLines.splice(unitIndex, 1);
      }

      // Handle numeric/unit-only second address line
      if (!addr2 && addressLines.length > 1) {
        const lastLine = addressLines[addressLines.length - 1];

        if (/^(?:[A-Z]?\d+[A-Z]?|[A-Z]\d+)$/i.test(lastLine)) {
          addr2 = lastLine;
          addressLines.pop();
        }
      }

      addr1 = addressLines.join(" ");
    }
  }

  console.log("ADDRESS PARSED:", {
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    country,
    phone
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

function detectShipToSection(lines) {
  let start = -1;
  let end = lines.length;

  // Find Ship To heading
  for (let i = 0; i < lines.length; i++) {
    if (/ship\s*to|deliver\s*to|shipping address/i.test(lines[i])) {
      start = i;
      break;
    }
  }

  // Fallback: find city/state/ZIP and look a few lines above it
  if (start === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (parseCityStateZip(lines[i]).city) {
        start = Math.max(0, i - 4);
        break;
      }
    }
  }

  if (start === -1) {
    return {
      startLine: -1,
      endLine: -1,
      lines: []
    };
  }

  // Find end of Ship To section
  for (let i = start + 1; i < lines.length; i++) {
    if (
      /^(bill\s*to|payment|item\s+vendor|item\s+sku|subtotal|grand total|total$|products|quantity\s+products)/i.test(
        lines[i]
      )
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
    case "pelican":
    case "specd": {
      const sku =
        item.itemId ||
        item.sku ||
        item.vendorSku ||
        "";

      return sku.replace(/^SPECD?-/i, "");
    }

    case "dealerX":
      return item.itemId || item.vendorSku || item.sku || "";

    default:
      return item.sku || item.vendorSku || item.itemId || "";
  }
}
