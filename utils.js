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

function parseCityStateZip(line) {
  if (!line) return {};

  // --- US: City, State ZIP (State can be full name) ---
  let m = line.match(/^(.*?)\s+([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);
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

