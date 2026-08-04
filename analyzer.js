function analyzeOrder(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const itemSection = detectItemSection(lines);
  const itemCandidates = detectItemsFromSection(itemSection);

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
  console.table(skuCandidates);

  return {
    raw: text,

    lines,

    itemSection,

    itemCandidates,

    skuCandidates,

    poCandidates: uniquePO,

    phoneCandidates,

    emailCandidates: [],

    addressCandidates: [],

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
    const skuMatches = line.match(/[A-Z0-9-]{6,}/gi) || [];

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
        sku: currentSKUs[0],

        altSku: currentSKUs.length > 1 ? currentSKUs[1] : "",

        qty: Number(detailMatch[1]),

        upc: detailMatch[2],

        price: Number(detailMatch[3])
      });

      currentSKUs = [];
    }
  });

  return items;
}
