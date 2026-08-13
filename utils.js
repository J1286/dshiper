// --- SKU ---
function scoreSKU(str) {
  if (!str) return 0;

  let score = 0;

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

function isLikelySKU(str) {
  if (!str) return false;

  const value = str.trim();

  // Most real product SKUs contain numbers.
  // Prevents normal description text from becoming a SKU.
  if (!/\d/.test(value)) {
    return false;
  }

  // Reject punctuation/text that doesn't look like SKU data.
  if (!/^[A-Z0-9._\/-]+$/i.test(value)) {
    return false;
  }

  return scoreSKU(value) >= 0.5;
}

function isLikelySKU(str) {
  if (!str) return false;

  const value = str.trim();

  if (!/\d/.test(value)) {
    return false;
  }

  // Reject anything containing characters that are not SKU
  if (!/^[A-Z0-9._\/-]+$/i.test(value)) {
    return false;
  }

  return scoreSKU(value) >= 0.5;
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
    .trim()
    .toUpperCase();

  clean = clean.replace(/^SPECDTUNING[-_]?/i, "");

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

  // ---- Case 2: trailing single fragment ----
  if (/^[A-Z0-9-]{6,}$/i.test(current) && /^[A-Z0-9]{1,3}$/i.test(next)) {
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

  // --- US: City, State ZIP (State can be full name) ---
  let m = line.match(/^(.*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (m) {
    const rawState = m[2].trim().toLowerCase();

    return {
      city: m[1].trim(),
      state: normalizeState(rawState),
      zip: m[3]
    };
  }

  m = line.match(/^(.*?),\s*([A-Za-z\s]+),?\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);

  if (m) {
    return {
      city: m[1].trim(),
      state: normalizeState(m[2]),
      zip: m[3]
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
