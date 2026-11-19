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

  // Ignore PO DATE and similar non-PO labels
  if (/^\s*PO\s+DATE\s*$/i.test(line)) {
    continue;
  }

  // PO number on the same line
  const inlineMatch = line.match(
    /\b(?:purchase\s+order|po)\s*(?:number|no\.?|#)?\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i
  );

  if (inlineMatch) {
    result.poCandidates.push({
      value: inlineMatch[1].toUpperCase(),
      line: i,
      raw: line,
      score: 1
    });

    continue;
  }

  // PO number on the following line
  if (
    /^\s*(?:purchase\s+order|po(?:\s*(?:number|no\.?|#))?)\s*:?\s*$/i.test(line)
  ) {
    const nextLine = lines[i + 1] || "";

    if (/^[A-Z0-9][A-Z0-9-]{3,}$/i.test(nextLine)) {
      result.poCandidates.push({
        value: nextLine.toUpperCase(),
        line: i + 1,
        raw: nextLine,
        score: 1
      });
    }
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
    const raw = searchLines[i];

    // Normalize the line and remove phone numbers before address analysis
    let line = raw
      .replace(/\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Detect country, even when attached to other text
    const countryMatch = line.match(
      /\b(united states of america|united states|u\.s\.a\.|usa|canada)\b/i
    );

    if (countryMatch) {
      const countryKey = normalizeSemanticTextV2(countryMatch[1]);

      candidates.push({
        type: "country",
        value: GENERIC_CONFIG_V2.countryMap[countryKey],
        raw: countryMatch[1],
        line: i,
        score: 1
      });

      line = line.replace(countryMatch[0], "").trim();
    }

    // Detect US city, state and ZIP
    const zipMatch = line.match(
      /(\d{5}(?:-\d{4})?)\s*$/
    );

    if (zipMatch) {
      const beforeZip = line.slice(0, zipMatch.index).trim();

      // Handle concatenated street direction + city:
      // Cartwright Loop NWWilliston ND 58801
      const compactCityMatch = beforeZip.match(
        /(?:NW|NE|SW|SE|N|S|E|W)([A-Z][a-z]+(?:[ .'-]+[A-Z][a-z]+)*)\s+([A-Z]{2})$/ 
      );

      // Handle normally separated city and state:
      // Williston ND 58801
      const normalCityMatch = beforeZip.match(
        /([A-Z][a-z]+(?:[ .'-]+[A-Z][a-z]+)*)\s+([A-Z]{2})$/ 
      );

      const cityMatch = compactCityMatch || normalCityMatch;

      if (cityMatch) {
        const city = cityMatch[1];
        const state = cityMatch[2];
        const cityStateZip = `${city} ${state} ${zipMatch[1]}`;

        candidates.push({
          type: "cityStateZip",
          value: cityStateZip,
          city,
          state,
          zip: zipMatch[1],
          line: i,
          score: 0.95
        });

        let streetAndName = beforeZip.slice(
          0,
          cityMatch.index
        );

        // Restore the directional suffix removed from the street
        if (compactCityMatch) {
          const direction = beforeZip.match(
            /(NW|NE|SW|SE|N|S|E|W)(?=[A-Z][a-z])/ 
          );

          if (direction) {
            streetAndName += direction[1];
          }
        }

        // Find the beginning of the street address
        const streetStart = streetAndName.search(
          /\b\d{1,6}\s+/
        );

        if (streetStart >= 0) {
          const recipient = streetAndName
            .slice(0, streetStart)
            .trim();

          const street = streetAndName
            .slice(streetStart)
            .trim();

          if (recipient) {
            candidates.push({
              type: "recipient",
              value: recipient,
              line: i,
              score: 0.8
            });
          }

          if (street) {
            candidates.push({
              type: "street",
              value: street,
              line: i,
              score: 0.9
            });
          }
        }
      }
    }

    // Canadian postal code
    const postalMatch = line.match(
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i
    );

    if (postalMatch) {
      candidates.push({
        type: "postalCode",
        value: postalMatch[0].toUpperCase(),
        line: i,
        score: 0.9
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
