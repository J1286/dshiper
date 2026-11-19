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

  result.address = buildStructuredAddressV2(result);

  debugLog("===== ANALYZER 2.0 =====");
  debugLog("V2 KEYWORDS:", result.keywords);
  debugLog("V2 SECTIONS:", result.sections);
  debugLog("V2 PO:", result.poCandidates);
  debugLog("V2 PHONE:", result.phoneCandidates);
  debugLog("V2 EMAIL:", result.emailCandidates);
  debugLog("V2 ADDRESS:", result.addressCandidates);
  debugLog("V2 STRUCTURED ADDRESS:", result.address);

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

  const provinces = {
    "alberta": "AB",
    "british columbia": "BC",
    "manitoba": "MB",
    "new brunswick": "NB",
    "newfoundland and labrador": "NL",
    "newfoundland": "NL",
    "northwest territories": "NT",
    "nova scotia": "NS",
    "nunavut": "NU",
    "ontario": "ON",
    "prince edward island": "PE",
    "quebec": "QC",
    "saskatchewan": "SK",
    "yukon": "YT",
    "ab": "AB", "bc": "BC", "mb": "MB",
    "nb": "NB", "nl": "NL", "nt": "NT",
    "ns": "NS", "nu": "NU", "on": "ON",
    "pe": "PE", "qc": "QC", "sk": "SK",
    "yt": "YT"
  };

  // Remove phone numbers and normalize whitespace
  function cleanLineV2(value) {
    return String(value || "")
      .replace(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  for (let i = 0; i < searchLines.length; i++) {
    const raw = searchLines[i];
    const line = cleanLineV2(raw);

    if (!line) continue;

    // Country
    const countryMatch = line.match(
      /(united states of america|united states|u\.s\.a\.|usa|canada)\b/i
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
    }

    // Canadian postal code
    const postalMatch = line.match(
      /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i
    );

    if (postalMatch) {
      const postalCode =
        `${postalMatch[1]} ${postalMatch[2]}`.toUpperCase();

      candidates.push({
        type: "postalCode",
        value: postalCode,
        line: i,
        score: 0.95
      });

      // Remove postal code and parse the remaining city/province
      const beforePostal = line
        .slice(0, postalMatch.index)
        .replace(/[, ]+$/, "")
        .trim();

      const parts = beforePostal
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);

      if (parts.length >= 2) {
        const provinceKey =
          normalizeSemanticTextV2(parts[parts.length - 1]);

        const province = provinces[provinceKey];

        if (province) {
          const city = parts.slice(0, -1).join(", ");

          candidates.push({
            type: "city",
            value: city,
            line: i,
            score: 0.95
          });

          candidates.push({
            type: "province",
            value: province,
            raw: parts[parts.length - 1],
            line: i,
            score: 0.95
          });

          candidates.push({
            type: "cityProvincePostal",
            value: `${city}, ${province}, ${postalCode}`,
            city,
            province,
            postalCode,
            line: i,
            score: 1
          });
        }
      }
    }

    // Street address
    const streetMatch = line.match(
      /(?:^|\s)(\d{1,6}\s+.+)$/i
    );

    if (
      streetMatch &&
      GENERIC_CONFIG_V2.addressPatterns.street.some(pattern =>
        pattern.test(streetMatch[1])
      )
    ) {
      candidates.push({
        type: "street",
        value: streetMatch[1],
        line: i,
        score: 0.9
      });

      // Look for recipient immediately before the street
      for (let j = i - 1; j >= 0; j--) {
        const possibleName = cleanLineV2(searchLines[j]);

        if (
          possibleName &&
          !/^(customer information|ship to|shipping address)$/i.test(possibleName) &&
          !/\d{5}/.test(possibleName) &&
          !/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(possibleName)
        ) {
          candidates.push({
            type: "recipient",
            value: possibleName,
            line: j,
            score: 0.85
          });

          break;
        }
      }
    }

    // Postal box / PO Box
    if (
      /^(?:(?:P\.?\s*O\.?\s*)?Box\s+\d+[A-Z0-9-]*|Post Office Box\s+\d+[A-Z0-9-]*)$/i.test(line)
    ) {
      candidates.push({
        type: "box",
        value: line,
        line: i,
        score: 0.95
      });
    }

    // Standalone apartment / unit identifier, e.g. G1, Apt 3B, Suite 205
    if (
      /^(?:apt\.?|unit|suite|ste\.?)\s*#?\s*[A-Z0-9-]+$/i.test(line) ||
      /^[A-Z]\d[A-Z0-9-]*$/i.test(line)
    ) {
      candidates.push({
        type: "unit",
        value: line,
        line: i,
        score: 0.8
      });
    }

    // US city/state/ZIP
    const zipMatch = line.match(
      /(\d{5}(?:-\d{4})?)\s*$/
    );

    if (zipMatch) {
      const beforeZip = line.slice(0, zipMatch.index).trim();

      const compactCityMatch = beforeZip.match(
        /(?:NW|NE|SW|SE|N|S|E|W)([A-Z][a-z]+(?:[ .'-]+[A-Z][a-z]+)*)\s+([A-Z]{2})$/
      );

      const normalCityMatch = beforeZip.match(
        /([A-Z][a-z]+(?:[ .'-]+[A-Z][a-z]+)*)\s+([A-Z]{2})$/
      );

      const cityMatch = compactCityMatch || normalCityMatch;

      if (cityMatch) {
        const city = cityMatch[1];
        const state = cityMatch[2];

        candidates.push({
          type: "cityStateZip",
          value: `${city} ${state} ${zipMatch[1]}`,
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

        if (compactCityMatch) {
          const direction = beforeZip.match(
            /(NW|NE|SW|SE|N|S|E|W)(?=[A-Z][a-z])/
          );

          if (direction) {
            streetAndName += direction[1];
          }
        }

        const streetStart = streetAndName.search(
          /\d{1,6}\s+/
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
  }

  return candidates;
}


function buildStructuredAddressV2(result) {
  const section = result.sections.shipTo;
  const lines = section?.lines || [];
  const candidates = result.addressCandidates || [];

  function isNoise(line) {
    return (
      !line ||
      /^(customer information|ship to|shipping address|thanks[,!]?|best regards[,!]?)$/i.test(line) ||
      /^(?:po\s*(?:#|number|no\.?)?|purchase order)\s*[:#]/i.test(line) ||
      /^(?:t|tel|telephone|phone)\s*:/i.test(line) ||
      /@/.test(line) ||
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(line)
    );
  }

  const cleanLines = lines
    .map(line => String(line || "").trim())
    .filter(Boolean);

  const street = candidates.find(c => c.type === "street");
  const locality = candidates.find(
    c => c.type === "cityProvincePostal" ||
         c.type === "cityStateZip"
  );
  const country = candidates.find(c => c.type === "country");

  const address = {
    name: "",
    addr1: street?.value || "",
    addr2Lines: [],
    addr2: "",
    city: locality?.city || "",
    state: locality?.province || locality?.state || "",
    zip: locality?.postalCode || locality?.zip || "",
    country: country?.value || "",
    phone: ""
  };

  // --------------------------------
  // 1. Identify recipient
  // --------------------------------

  const recipientCandidate = candidates.find(
    c => c.type === "recipient"
  );

  // Joined address: recipient and street are on the same line.
  if (
    recipientCandidate &&
    street &&
    recipientCandidate.line === street.line
  ) {
    address.name = recipientCandidate.value;
  } else if (street) {
    // Multiline address: first meaningful line before street.
    const beforeStreet = cleanLines
      .slice(0, street.line)
      .filter(line => !isNoise(line));

    if (beforeStreet.length) {
      address.name = beforeStreet[0];

      // Any remaining lines are additional address information.
      address.addr2Lines.push(...beforeStreet.slice(1));
    }
  } else if (recipientCandidate) {
    address.name = recipientCandidate.value;
  }

  // --------------------------------
  // 2. Collect additional address lines
  // --------------------------------

  if (street && locality) {
    // Collect lines between street and city/postal information.
    if (locality.line > street.line) {
      const betweenLines = cleanLines
        .slice(street.line + 1, locality.line)
        .filter(line => !isNoise(line));

      address.addr2Lines.push(...betweenLines);
    }
  }

  // --------------------------------
  // 3. Remove duplicates and format addr2
  // --------------------------------

  address.addr2Lines = [
    ...new Set(address.addr2Lines)
  ];

  address.addr2 = address.addr2Lines.join(", ");

  // --------------------------------
  // 4. Extract phone from Ship To section
  // --------------------------------

  for (const line of cleanLines) {
    const phoneMatch = line.match(
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
    );

    if (phoneMatch) {
      address.phone = phoneMatch[0].replace(/\D/g, "");
      break;
    }
  }

  return address;
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
