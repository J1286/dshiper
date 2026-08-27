const DEBUG = true;
const DEBUG_VERBOSE = false;

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function debugVerbose(...args) {
  if (DEBUG && DEBUG_VERBOSE) console.log(...args);
}

function debugTable(label, data) {
  if (DEBUG) {
    console.log(label);
    console.table(data);
  }
}

// --- SKU ---
const SKU_RULES = [
  {
    prefixes: [
      "2LHP-",
      "LH-",
      "LT-",
      "RMX-",
      "SPL-",
      "2LH-",
      "LF-",
      "LPF-",
      "HG-",
      "RMV-",
      "2LCLH-",
      "FDF-",
      "4LHP-",
      "2LB-",
      "LHP-",
      "MFCAT2-",
      "2LC-",
      "LPS-",
      "2LHE-",
      "LSM-",
      "2LBLH-",
      "RAD3-",
      "LHE-",
      "2LBCLH-",
      "MAT-",
      "MFCAT3-",
      "2LBLHP-",
      "2LHES-",
      "4LH-",
      "4LHE-"
    ],
    suffixes: [
      "-RS",
      "-TM",
      "-ABM",
      "-SQ-RS",
      "-HZ",
      "-SQ-TM",
      "-GO",
      "-DL",
      "-PQ",
      "-V2-LD",
      "-FS",
      "-AK",
      "-G2-TM",
      "-G3-GO",
      "-G3-RS",
      "-V2-TM",
      "-V2-RS",
      "-APC",
      "-RO",
      "-VS",
      "-FS-R",
      "-FS-L",
      "-GL",
      "-MP",
      "-PK-MP",
      "-M-FS",
      "-SQ-VS",
      "-JB",
      "-R-RO",
      "-JL",
      "-JD",
      "-SY"
    ],
    allowMissingSeparator: true
  }
];

function matchSKUStructure(sku) {
  if (!sku) return null;

  const value = sku.trim().toUpperCase();

  for (const rule of SKU_RULES) {
    // IMPORTANT:
    // Check longest prefixes first so LHP- wins over LH-,
    // 2LHP- wins over LHP-, etc.
    const prefixes = [...(rule.prefixes || [])].sort(
      (a, b) => b.length - a.length
    );

    for (const prefix of prefixes) {
      const normalizedPrefix = prefix.toUpperCase();
      const prefixWithoutSeparator = normalizedPrefix.replace(/[-_]+$/, "");

      let prefixMatched = false;
      let missingSeparator = false;

      // Exact prefix
      if (value.startsWith(normalizedPrefix)) {
        prefixMatched = true;
      }

      // PDF may have removed the separator
      else if (
        rule.allowMissingSeparator &&
        value.startsWith(prefixWithoutSeparator)
      ) {
        prefixMatched = true;
        missingSeparator = true;
      }

      if (!prefixMatched) continue;

      // If the separator was missing, put it back
      let normalized = missingSeparator
        ? normalizedPrefix + value.slice(prefixWithoutSeparator.length)
        : value;

      let matchedSuffix = "";
      let missingSuffixSeparator = false;

      // IMPORTANT:
      // Check longest suffixes first.
      const suffixes = [...(rule.suffixes || [])].sort(
        (a, b) => b.length - a.length
      );

      for (const suffix of suffixes) {
        const normalizedSuffix = suffix.toUpperCase();
        const suffixWithoutSeparator = normalizedSuffix.replace(/^[-_]+/, "");

        // Normal suffix: -RS
        if (normalized.endsWith(normalizedSuffix)) {
          matchedSuffix = normalizedSuffix;
          break;
        }

        // PDF may have removed the separator: RS
        if (
          rule.allowMissingSeparator &&
          normalized.endsWith(suffixWithoutSeparator)
        ) {
          matchedSuffix = normalizedSuffix;
          missingSuffixSeparator = true;
          break;
        }
      }

      // Restore missing suffix separator
      if (missingSuffixSeparator && matchedSuffix) {
        const suffixWithoutSeparator = matchedSuffix.replace(/^[-_]+/, "");

        normalized =
          normalized.slice(0, -suffixWithoutSeparator.length) + matchedSuffix;
      }

      return {
        matched: true,
        normalized,
        prefix: normalizedPrefix,
        suffix: matchedSuffix,
        missingSeparator,
        missingSuffixSeparator
      };
    }
  }

  return null;
}

function findBestSKUInText(text) {
  if (!text) return null;

  const candidates = text.match(/[A-Z0-9._/-]{6,}/gi) || [];

  return getBestSKU(candidates);
}

function scoreSKU(str) {
  if (!str) return 0;

  let score = 0;

  const structure = matchSKUStructure(str);

  if (structure?.matched) {
    // Known prefix
    score += 1.5;

    // Known suffix
    if (structure.suffix) {
      score += 1.5;
    }

    // Known prefix + known suffix = extremely strong
    if (structure.prefix && structure.suffix) {
      score += 2.0;
    }
  }

  // --- core signals ---
  if (/[A-Z]/i.test(str)) score += 0.2;
  if (/\d/.test(str)) score += 0.2;
  if (/[-_]/.test(str)) score += 0.2;

  // --- structure ---
  if (str.length >= 6 && str.length <= 25) score += 0.2;
  if (/^[A-Z0-9._\/-]+$/i.test(str)) score += 0.2;

  // --- strong SKU patterns ---
  if (/^[A-Z]{2,}-\d{2,}/i.test(str)) score += 0.3;
  if (/^[A-Z0-9]+-[A-Z0-9-]+$/i.test(str)) score += 0.3;

  // --- penalties ---
  // Tracking, pure number, UPC/EAN, small numbers
  if (/^\d{10,}$/.test(str)) score -= 0.6;
  if (/^\d+$/.test(str)) score -= 0.4;
  if (/^\d{12,14}$/.test(str)) score -= 0.8;
  if (/^\d{1,5}$/.test(str)) score -= 0.5;
  if (/invoice|order|tracking|phone/i.test(str)) score -= 0.5;

  return score;
}

function getBestSKU(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const seen = new Set();

  const scoredCandidates = candidates
    .map((rawSKU) => {
      const normalizedSKU = normalizeSKU(rawSKU);

      if (!normalizedSKU) {
        return null;
      }

      if (seen.has(normalizedSKU)) {
        return null;
      }

      seen.add(normalizedSKU);

      const score = scoreSKU(normalizedSKU);
      const structure = matchSKUStructure(normalizedSKU);

      return {
        sku: normalizedSKU,
        score,
        structure
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  debugTable("GENERIC SCORED SKU CANDIDATES:", scoredCandidates);

  const best = scoredCandidates[0];

  if (!best || best.score < 2) {
    return null;
  }

  // Detect ambiguous / low-confidence matches
  const second = scoredCandidates[1];

  if (second && best.score - second.score < 0.5) {
    debugLog("AMBIGUOUS SKU MATCH:", {
      best,
      second,
      candidates: scoredCandidates
    });

    return null;
  }

  return best;
}

function isLikelySKU(str) {
  if (!str) return false;

  const value = str.trim();

  // Phone number
  if (/^\+?1?[-.\s()]?\d{3}[-.\s()]?\d{3}[-.\s]?\d{4}$/.test(value)) {
    return false;
  }

  // Vehicle/application year range, e.g. 2013-18
  if (/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  if (!/\d/.test(value)) {
    return false;
  }

  if (!/^[A-Z0-9._\/-]+$/i.test(value)) {
    return false;
  }

  return scoreSKU(value) >= 0.5;
}

function isInvalidItemSKU(sku) {
  if (!sku) return true;

  const value = sku.trim();

  // Phone number
  if (/^\+?1?[-.\s()]?\d{3}[-.\s()]?\d{3}[-.\s]?\d{4}$/.test(value)) {
    return true;
  }

  // Year/application ranges like 2013-18
  if (/^\d{4}-\d{2}$/.test(value)) {
    return true;
  }

  return false;
}

function scoreSKUWithContext(line, prevLine = "", nextLine = "") {
  let score = scoreSKU(line);

  const prev = prevLine.toLowerCase();
  const next = nextLine.toLowerCase();

  const context = `${prev} ${next}`;

  // Strong SKU/header signals
  if (/part\s*number|item\s*(id|number)?|sku|model/.test(prev)) {
    score += 0.4;
  }

  // SKU followed by description
  if (/[a-z]{3,}/i.test(next) && !/qty|quantity|rate|amount|price/.test(next)) {
    score += 0.15;
  }

  // Quantity / pricing nearby
  if (/qty|quantity|rate|amount|price/.test(context)) {
    score += 0.2;
  }

  // Price on next line
  if (/\$?\d+\.\d{2}/.test(nextLine)) {
    score += 0.15;
  }

  // Address / shipping area penalty
  if (/ship|address|phone|city|state|zip/.test(context)) {
    score -= 0.3;
  }

  return score;
}

function normalizeSKU(sku) {
  if (!sku) return "";

  let clean = sku
    .replace(/\u00A0/g, " ")
    .replace(/\u00AD/g, "")
    .trim()
    .toUpperCase();

  clean = clean.replace(/^SPECDTUNING[-_]?/i, "");

  const structure = matchSKUStructure(clean);

  if (structure?.matched) {
    clean = structure.normalized;
  }

  return clean;
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

function normalizeBrokenLines(text) {
  return text.replace(/-\s*\n\s*/g, "-");
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

  // ---- Case 2: short SKU continuation ----
  if (/^[A-Z0-9-]{6,}$/i.test(current) && /^[A-Z0-9-]{1,4}$/i.test(next)) {
    return current + next;
  }

  return null;
}

function isUPC(str) {
  return /^\d{12}$/.test(str); // standard UPC
}

// --- ADDRESS ---
function normalizeState(state) {
  if (!state) return "";

  const s = state.trim().toLowerCase();
  if (s.length === 2) return s.toUpperCase();

  // US states first
  if (STATE_MAP[s]) return STATE_MAP[s];

  // Canadian provinces
  if (PROVINCE_MAP[s]) return PROVINCE_MAP[s];

  return state; // fallback
}

function normalizeCountry(addr) {
  if (!addr.country) {
    if (Object.values(PROVINCE_MAP).includes(addr.state)) {
      addr.country = "CA";
    } else {
      addr.country = "US";
    }
  }
  return addr;
}

function parseCityStateZip(line) {
  if (!line) return {};

  // --- US: City, Full State ZIP, Country ---
  let m = line.match(
    /^(.*?),\s*([A-Za-z\s]+),?\s+(\d{5}(?:-\d{4})?),\s*(?:United States|USA|US)$/i
  );

  if (m) {
    return {
      city: m[1].trim(),
      state: normalizeState(m[2]),
      zip: m[3]
    };
  }

  // --- US: City, State ZIP ---
  m = line.match(/^(.*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);

  if (m) {
    const rawState = m[2].trim().toLowerCase();

    return {
      city: m[1].trim(),
      state: normalizeState(rawState),
      zip: m[3]
    };
  }

  // --- Canada: City, Province Postal ---
  m = line.match(/^(.*?),\s*([A-Za-z\s]+),?\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);

  if (m) {
    const rawState = m[2].trim().toLowerCase();

    return {
      city: m[1].trim(),
      state: normalizeState(rawState),
      zip: m[3].toUpperCase()
    };
  }

  // --- US: City, Full State, ZIP ---
  m = line.match(/^(.*?),\s*([A-Za-z\s]+),?\s+(\d{5}(?:-\d{4})?)$/i);

  if (m) {
    return {
      city: m[1].trim(),
      state: normalizeState(m[2]),
      zip: m[3]
    };
  }

  return {};
}

function detectCountry(addr) {
  const rawCountry = (addr.country || "").trim().toLowerCase();
  const zip = (addr.zip || "").replace(/\s+/g, "").toUpperCase();

  if (rawCountry.includes("canada") || rawCountry === "ca") return "CA";
  if (["us", "usa", "united states"].includes(rawCountry)) return "US";

  const canadaPostalRegex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
  const usZipRegex = /^\d{5}(-\d{4})?$/;

  if (canadaPostalRegex.test(zip)) return "CA";
  if (usZipRegex.test(zip)) return "US";

  return "US";
}

function testSKURegression() {
  const tests = [
    {
      input: "LH12345TM",
      expected: "LH-12345-TM"
    },
    {
      input: "LH-12345-TM",
      expected: "LH-12345-TM"
    },
    {
      input: "LTRAM1925BKLDSQ-RS",
      expected: "LT-RAM1925BKLD-SQ-RS"
    },
    {
      input: "RMXSIV99G3GLEDH-P-FS",
      expected: "RMX-SIV99G3GLEDH-P-FS"
    },
    {
      input: "2LH-SIV1915JMR-RO",
      expected: "2LH-SIV1915JM-R-RO"
    },
    {
      input: "LHP-MST10BK-V2-TM",
      expected: "LHP-MST10BK-V2-TM"
    }
  ];

  const lines = [
    "LT-G35032SMLED-S",
    "Q-RS"
  ];

  let passed = 0;

  console.group("SKU REGRESSION TESTS");

  for (const test of tests) {
    const actual = normalizeSKU(test.input);
    const ok = actual === test.expected;

    console.log(
      ok ? "✅ PASS" : "❌ FAIL",
      test.input,
      "→",
      actual,
      "| expected:",
      test.expected
    );

    if (ok) passed++;
  }

  console.log(`SKU TESTS: ${passed}/${tests.length} passed`);

  console.groupEnd();

  return passed === tests.length;
}
