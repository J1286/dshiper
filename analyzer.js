function analyzeOrder(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const itemSection = detectItemSection(lines);
  const itemCandidates = detectItemsFromSection(itemSection);

  const shipToSection = detectShipToSection(lines);

  const addressCandidate = detectAddressFromSection(shipToSection, lines);

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
    const best = findBestSKUInText(line);

    if (!best) return;

    const prevLine = itemSection.lines[index - 1] || "";
    const nextLine = itemSection.lines[index + 1] || "";

    const score = scoreSKUWithContext(best.sku, prevLine, nextLine);

    skuCandidates.push({
      value: best.sku,
      line: itemSection.startLine + index,
      raw: line,
      score,
      isUPC: isUPC(best.sku)
    });
  });

  skuCandidates.sort((a, b) => b.score - a.score);

  debugTable("ANALYZER SKU CANDIDATES:", skuCandidates);

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
      /^(part number|part description|item vendor sku|item sku|sku|product|model)/i.test(
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

  // SPEC-D / AUTO OBSESSION FORMAT
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const match = line.match(/^(SPL-[A-Z0-9-]+)\s+(.+)$/i);

    if (!match) continue;

    const itemId = match[1].toUpperCase();
    const description = match[2].trim();

    let upc = "";

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const candidate = lines[j].trim();

      if (/^\d{10,14}$/.test(candidate)) {
        upc = candidate;
        break;
      }
    }

    items.push({
      itemId,
      vendorSku: "",
      qty: 1,
      upc,
      price: 0,
      description
    });

    // We found the actual product.
    // Don't let the generic parser interpret
    // phone numbers/application years as more items.
    return items;
  }

  // EXISTING GENERIC LOGIC
  let currentSKUs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const cleanedLine = normalizeSKU(line);

    if (isLikelySKU(cleanedLine)) {
      currentSKUs.push(cleanedLine.toUpperCase());
    }

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

function detectAddressFromSection(shipToSection, allLines) {
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
  const phoneMatches = [];

  for (const line of allLines) {
    const match = line.match(
      /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/
    );

    if (match) {
      phoneMatches.push({
        raw: match[0],
        phone: match[0].replace(/\D/g, ""),
        line
      });
    }
  }

  if (phoneMatches.length >= 2) {
    phone = phoneMatches[1].phone;
  } else if (phoneMatches.length === 1) {
    phone = phoneMatches[0].phone;
  }

  // Country
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

  // City / State / ZIP
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

  // Street address + name/company
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
      const beforeAddress = lines
        .slice(0, addrStartIndex)
        .map((line) => line.trim())
        .filter(Boolean);

      // Find the closest meaningful line before address
      let previousLine = "";
      let previousPreviousLine = "";

      for (let i = beforeAddress.length - 1; i >= 0; i--) {
        const candidate = beforeAddress[i];

        if (
          /^(ship\s*to|deliver\s*to|shipping\s*address)\s*:?\s*$/i.test(
            candidate
          )
        ) {
          continue;
        }

        if (/^drop-ship these parts/i.test(candidate)) {
          continue;
        }

        if (/^(vendor|customer|phone|phone\s*#)$/i.test(candidate)) {
          continue;
        }

        if (/united states|canada|^us$/i.test(candidate)) {
          continue;
        }

        if (/phone|purchase order|po\s*#/i.test(candidate)) {
          continue;
        }

        if (/^[-=*#]+$/.test(candidate)) {
          continue;
        }

        if (!previousLine) {
          previousLine = candidate;
          continue;
        }

        previousPreviousLine = candidate;
        break;
      }

      // Actual street address lines
      const streetLines = lines.slice(addrStartIndex, cityLineIndex);

      function looksLikePersonName(value) {
        if (!value) return false;

        const words = value.trim().split(/\s+/);

        // Usually 2-4 words
        if (words.length < 2 || words.length > 4) {
          return false;
        }

        // Only normal name characters
        if (!/^[A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)+$/.test(value)) {
          return false;
        }

        // Reject obvious company / instruction text
        if (
          /electric|company|corp|corporation|inc|llc|ltd|parts|warehouse|shop|store|dealer|supply|group|address|drop|ship/i.test(
            value
          )
        ) {
          return false;
        }

        return true;
      }

      // Remove SPEC-D Tuning vendor prefix from shipping name
      if (/^SPEC[-\s]?D\s+Tuning\s+/i.test(previousLine)) {
        previousLine = previousLine
          .replace(/^SPEC[-\s]?D\s+Tuning\s+/i, "")
          .trim();
      }

      if (/^SPEC[-\s]?D\s+Tuning\s+/i.test(previousPreviousLine)) {
        previousPreviousLine = previousPreviousLine
          .replace(/^SPEC[-\s]?D\s+Tuning\s+/i, "")
          .trim();
      }

      // Assign Name / Addr1 / Addr2
      if (looksLikePersonName(previousPreviousLine)) {
        name = previousPreviousLine;
        addr1 = previousLine;
        addr2 = streetLines.join(" ");
      } else if (looksLikePersonName(previousLine)) {
        name = previousLine;
        addr1 = streetLines.join(" ");
      } else {
        // Street only
        addr1 = streetLines.join(" ");
      }
    }
  }

  debugLog("ANALYZER ADDRESS:", {
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
  if (!item) return "";

  const candidates = [item.sku, item.itemId, item.vendorSku].filter(Boolean);

  // Prefer a candidate that matches our configured SKU structure
  for (const candidate of candidates) {
    const normalized = normalizeSKU(candidate);
    const structure = matchSKUStructure(normalized);

    if (structure?.matched) {
      return normalized;
    }
  }

  // Fallback to existing priority
  if (item.sku) return normalizeSKU(item.sku);
  if (item.itemId) return normalizeSKU(item.itemId);
  if (item.vendorSku) return normalizeSKU(item.vendorSku);

  return "";
}
