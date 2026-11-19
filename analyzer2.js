// -------- GENERIC ANALYZER 2.0 --------
// Experimental semantic analyzer.
// Does NOT replace analyzer.js.

function analyzeOrderV2(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const result = {
    raw: text,
    lines,

    keywords: {
      po: [],
      shipTo: [],
      billTo: [],
      item: [],
      quantity: [],
      price: [],
      phone: [],
      email: [],
      country: []
    },

    sections: {
      shipTo: null,
      billTo: null,
      items: null
    },

    poCandidates: [],
    phoneCandidates: [],
    emailCandidates: [],
    addressCandidates: []
  };

  // --------------------------------
  // 1. Detect semantic labels
  // --------------------------------

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const category of Object.keys(GENERIC_CONFIG_V2.labels)) {
      const labels = GENERIC_CONFIG_V2.labels[category];

      for (const label of labels) {
        const regex = new RegExp(
          `\\b${escapeRegexV2(label).replace(/\\ /g, "\\s+")}\\b`,
          "i"
        );

        if (regex.test(line)) {
          result.keywords[category].push({
            line: i,
            label,
            raw: line
          });

          break;
        }
      }
    }
  }

  // --------------------------------
  // 2. Detect PO candidates
  // --------------------------------

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const match =
      line.match(
        /\b(?:purchase\s+order|po)\s*(?:number|no\.?|#)?\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i
      ) ||
      line.match(
        /\b(?:order\s+(?:number|no\.?|#|id))\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i
      );

    if (match) {
      result.poCandidates.push({
        value: match[1].toUpperCase(),
        line: i,
        raw: line,
        score: 1
      });
    }
  }

  // --------------------------------
  // 3. Detect phone candidates
  // --------------------------------

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
    );

    if (match) {
      result.phoneCandidates.push({
        value: match[0].replace(/\D/g, ""),
        line: i,
        raw: lines[i],
        score: 1
      });
    }
  }

  // --------------------------------
  // 4. Detect email candidates
  // --------------------------------

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
    );

    if (match) {
      result.emailCandidates.push({
        value: match[0],
        line: i,
        raw: lines[i],
        score: 1
      });
    }
  }

  // --------------------------------
  // 5. Detect Ship To section
  // --------------------------------

  result.sections.shipTo = detectSectionV2(
    lines,
    result.keywords.shipTo,
    GENERIC_CONFIG_V2.sectionEndLabels.shipTo
  );

  // --------------------------------
  // 6. Detect Bill To section
  // --------------------------------

  result.sections.billTo = detectSectionV2(
    lines,
    result.keywords.billTo,
    GENERIC_CONFIG_V2.sectionEndLabels.shipTo
  );

  // --------------------------------
  // 7. Detect item section
  // --------------------------------

  result.sections.items = detectItemSectionV2(
    lines,
    result.keywords.item
  );

  // --------------------------------
  // 8. Analyze possible address blocks
  // --------------------------------

  result.addressCandidates = detectAddressCandidatesV2(
    lines,
    result.sections.shipTo
  );

  debugLog("===== ANALYZER 2.0 =====");
  debugLog("V2 KEYWORDS:", result.keywords);
  debugLog("V2 SECTIONS:", result.sections);
  debugLog("V2 PO:", result.poCandidates);
  debugLog("V2 PHONE:", result.phoneCandidates);
  debugLog("V2 EMAIL:", result.emailCandidates);
  debugLog("V2 ADDRESS:", result.addressCandidates);

  return result;
}


// --------------------------------
// Section detection
// --------------------------------

function detectSectionV2(lines, startKeywords, endLabels) {
  if (!startKeywords || !startKeywords.length) {
    return null;
  }

  const startLine = startKeywords[0].line;
  let endLine = lines.length;

  for (let i = startLine + 1; i < lines.length; i++) {
    const normalized = normalizeSemanticTextV2(lines[i]);

    if (
      endLabels.some(label =>
        normalized === normalizeSemanticTextV2(label)
      )
    ) {
      endLine = i;
      break;
    }
  }

  return {
    startLine,
    endLine,
    lines: lines.slice(startLine + 1, endLine)
  };
}


// --------------------------------
// Item section detection
// --------------------------------

function detectItemSectionV2(lines, itemKeywords) {
  if (!itemKeywords || !itemKeywords.length) {
    return null;
  }

  const startLine = Math.min(
    ...itemKeywords.map(item => item.line)
  );

  let endLine = lines.length;

  for (let i = startLine + 1; i < lines.length; i++) {
    const normalized = normalizeSemanticTextV2(lines[i]);

    if (
      GENERIC_CONFIG_V2.sectionEndLabels.items.some(label =>
        normalized === normalizeSemanticTextV2(label)
      )
    ) {
      endLine = i;
      break;
    }
  }

  return {
    startLine,
    endLine,
    lines: lines.slice(startLine, endLine)
  };
}


// --------------------------------
// Address candidate detection
// --------------------------------

function detectAddressCandidatesV2(lines, shipToSection) {
  const candidates = [];

  const searchLines =
    shipToSection && shipToSection.lines.length
      ? shipToSection.lines
      : lines;

  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];

    // Street address
    if (
      GENERIC_CONFIG_V2.addressPatterns.street.some(pattern =>
        pattern.test(line)
      )
    ) {
      candidates.push({
        type: "street",
        value: line,
        line: i,
        score: 0.9
      });

      continue;
    }

    // US city/state/ZIP
    if (
      GENERIC_CONFIG_V2.addressPatterns.usCityStateZip.some(pattern =>
        pattern.test(line)
      )
    ) {
      candidates.push({
        type: "cityStateZip",
        value: line,
        line: i,
        score: 0.95
      });

      continue;
    }

    // Canadian postal code
    if (
      GENERIC_CONFIG_V2.addressPatterns.canadianPostal.some(pattern =>
        pattern.test(line)
      )
    ) {
      candidates.push({
        type: "postalCode",
        value: line,
        line: i,
        score: 0.9
      });

      continue;
    }

    // Country
    const countryKey = normalizeSemanticTextV2(line);

    if (GENERIC_CONFIG_V2.countryMap[countryKey]) {
      candidates.push({
        type: "country",
        value: GENERIC_CONFIG_V2.countryMap[countryKey],
        raw: line,
        line: i,
        score: 1
      });
    }
  }

  return candidates;
}


// --------------------------------
// Helpers
// --------------------------------

function normalizeSemanticTextV2(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function escapeRegexV2(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
