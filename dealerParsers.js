// -------- MAIN PARSER --------
function parseRedlineWrapper(order) {
	const items = extractItemsRedline(order);
	const addr = extractAddressRedline(order);
	return buildRow(order, "redline360", items, addr);
}

function parseAAGWrapper(order) {
	const items = extractItemsAAG(order);
	const addr = extractAddressAAG(order);
	return buildRow(order, "aag", items, addr);
}

function parseTDOTWrapper(order) {
	const items = extractItemsTDOT(order);
	const addr = extractAddressGeneric(order);
	return buildRow(order, "tdot", items, addr);
}

function parseZ1Wrapper(order) {
	const items = extractItemsZ1(order);
	const addr = extractAddressZ1(order);
	return buildRow(order, "z1", items, addr);
}

function parseNTXGlowWrapper(order) {
	const items = extractItemsNTXGlow(order);
	const addr = extractAddressNTXGlow(order);
	return buildRow(order, "ntxglow", items, addr);
}

// -------- ITEM PARSERS --------
function extractItemsRedline(text) {
	const items = [];
	const blocks = text.split("SKU:");
	blocks.shift();
	blocks.forEach((block) => {
		const skuMatch = block.match(/^([^\n]+)/);
		const qtyMatch = block.match(/Quantity:\s*(\d+)/);
		if (skuMatch && qtyMatch)
			items.push({
				sku: normalizeSKU(skuMatch[1]),
				qty: Number(qtyMatch[1]) || 0
			});
	});
	return items;
}

function extractItemsAAG(text) {
	const items = [];
	const section = text.split("Spec-D Tuning Items Purchased")[1];
	if (!section) return items;

	const lines = section
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	for (let line of lines) {
		if (/^qty|^brand/i.test(line)) continue;

		const parts = line.split(/\s+/);

		const qty = Number(parts[0]);
		if (!qty || qty > 100) continue; // sanity check

		// find best SKU candidate in line
		const candidates = line.match(/[A-Z0-9-]{6,}/gi) || [];

		const scored = candidates
			.map((c) => ({
				sku: normalizeSKU(c),
				score: scoreSKU(c)
			}))
			.filter((c) => c.score >= 0.6);

		if (!scored.length) continue;

		const best = scored.sort((a, b) => b.score - a.score)[0];

		items.push({
			sku: best.sku,
			qty
		});
	}

	return items;
}

function extractItemsTDOT(text) {
	const items = [];

	const regex = /QTY:\s*(\d+)\s*-\s*SpecDTuning-([A-Z0-9-]+)/gi;

	let match;

	while ((match = regex.exec(text)) !== null) {
		items.push({
			qty: Number(match[1]),
			sku: normalizeSKU(match[2])
		});
	}

	return items;
}

function extractItemsZ1(text) {
	const items = [];

	// --- isolate product section ---
	const start = text.search(/Products\s+Item\s+Number/i);
	if (start === -1) return items;

	const section = text.slice(start);

	const lines = section
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];

		// skip header row
		if (/products|item number|qty|price/i.test(line)) continue;

		// skip long descriptions
		if (line.length > 40 || /\s{2,}/.test(line)) continue;

		// --- stitch SKU ---
		let stitched = stitchNextLineSKU(lines, i);
		if (stitched) {
			line = stitched;
			i++;
		}

		line = normalizeSKU(line);

		// 🔒 STRICT SKU RULE (Z1 specific)
		// ---- extract inline SKU + qty ----
		const inlineMatch = line.match(/([A-Z0-9-]{8,})\s+(\d+)\s+\$\d/i);

		if (inlineMatch) {
			items.push({
				sku: normalizeSKU(inlineMatch[1]),
				qty: Number(inlineMatch[2])
			});

			continue;
		}

		// ---- standalone SKU ----
		if (/^[A-Z0-9-]{8,}$/i.test(line)) {
			const nextLine = lines[i + 1] || "";

			const qtyMatch = nextLine.match(/^(\d+)/);

			const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

			if (qtyMatch) i++;

			items.push({
				sku: normalizeSKU(line),
				qty
			});

			continue;
		}
	}

	return items.slice(0, 5);
}

function extractItemsNTXGlow(text) {
	text = cleanNTXGlowText(text);

	const items = [];

	const skuMatch = text.match(/SKU\s*\/\s*Part\s*#:\s*([A-Z0-9-]+)/i);
	const qtyMatch = text.match(/Quantity:\s*(\d+)/i);

	if (skuMatch) {
		items.push({
			sku: normalizeSKU(skuMatch[1]),
			qty: qtyMatch ? Number(qtyMatch[1]) : 1
		});
	}

	return items;
}

function extractItemsGeneric(text) {
	text = normalizeBrokenLines(text);
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	const items = [];

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];

		// skip noise
		if (/phone|email|invoice|tracking|account/i.test(line)) continue;

		// ---- strong patterns first ----
		let match =
			line.match(/QTY[:\s]*(\d+)\s*[-:]\s*([A-Z0-9-]+)/i) ||
			line.match(/([A-Z0-9-]{6,})\s+(\d+)\s+\$/i);

		if (match) {
			const sku = normalizeSKU(match[2] || match[1]);
			const qty = Number(match[1] || match[2]);

			if (isLikelySKU(sku)) {
				items.push({ sku, qty });
				continue;
			}
		}

		// ---- SKU on one line, qty on next ----
		if (isLikelySKU(line) && lines[i + 1]) {
			const qtyMatch = lines[i + 1].match(/^(\d+)\b/);

			if (qtyMatch) {
				items.push({
					sku: normalizeSKU(line),
					qty: Number(qtyMatch[1])
				});
				i++;
				continue;
			}
		}

		// ---- fallback: find SKU only ----
		const matches = line.match(/[A-Z0-9-]{6,}/g) || [];

		if (matches.length) {
			const scored = matches
				.map((m) => ({
					raw: m,
					score: scoreSKUWithContext(m, lines[i - 1], lines[i + 1])
				}))
				.filter((m) => !isUPC(m.raw))
				.filter((m) => !/^\d{5}(-\d{4})?$/.test(m.raw));

			if (scored.length) {
				const best = scored.sort((a, b) => b.score - a.score)[0];

				if (best.score >= 0.65) {
					items.push({
						sku: normalizeSKU(best.raw),
						qty: 1
					});
				}
			}
		}
	}

	// remove duplicates
	const unique = Array.from(new Map(items.map((i) => [i.sku, i])).values());

	const cleaned = removeSubstrings(unique);
	return cleaned.slice(0, 5);
}

// -------- ADDRESS PARSERS --------
function extractAddressRedline(order) {
	const phone =
		(order.match(/Phone:\s*(.*)/) || [])[1]?.replace(/\D/g, "") || "";
	const addrMatch = order.match(/Shipping Address:\s*([\s\S]*?)Phone:/);
	const lines = addrMatch
		? addrMatch[1]
				.trim()
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
		: [];
	let name = "",
		addr1 = "",
		addr2 = "",
		city = "",
		state = "",
		zip = "",
		country = "";
	if (lines.length >= 3) {
		name = lines[0];
		country = lines.at(-1);
		const cityLine = lines.at(-2);
		const street = lines.slice(1, -2);
		addr1 = street[0] || "";
		addr2 = street.slice(1).join(" ") || "";
		const m = cityLine.match(/^(.*?),\s*([A-Za-z\s]+)\s+([\d-]+)/);
		if (m) {
			city = m[1];
			state = normalizeState(m[2]);
			zip = m[3];
		}
	}
	return { name, addr1, addr2, city, state, zip, country, phone };
}

function extractAddressAAG(text) {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	let start = lines.findIndex((l) => l.toLowerCase() === "ship to");

	if (start === -1) return {};

	// stop before Bill To
	let end = lines.findIndex(
		(l, i) => i > start && l.toLowerCase() === "bill to"
	);

	if (end === -1) end = start + 10;

	const block = lines.slice(start + 1, end);

	// ---- phone ----
	const phoneLine =
		block.find((l) => /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(l)) || "";

	const phone = phoneLine.replace(/\D/g, "");

	// ---- city/state/zip ----
	let city = "",
		state = "",
		zip = "",
		cityIndex = -1;

	for (let i = 0; i < block.length; i++) {
		// combined line support
		const combined = `${block[i]} ${block[i + 1] || ""}`;

		let parsed = parseCityStateZip(combined);

		if (!parsed.city) {
			parsed = parseCityStateZip(block[i]);
		}

		if (parsed.city) {
			city = parsed.city;
			state = parsed.state;
			zip = parsed.zip;
			cityIndex = i;
			break;
		}

		// fallback:
		const m = block[i].match(/^(.*?),\s*([A-Za-z]{2})$/);

		if (m && block[i + 1]?.match(/^\d{5}/)) {
			city = m[1];
			state = normalizeState(m[2]);
			zip = block[i + 1];
			cityIndex = i;
			break;
		}
	}

	// ---- build address lines safely ----
	const addressLines = [];

	for (let i = 0; i < block.length; i++) {
		const line = block[i];

		// skip phone
		if (line === phoneLine) continue;

		if (i === cityIndex) continue;

		if (i === cityIndex + 1) continue;

		// skip labels
		if (/ship to|bill to/i.test(line)) continue;

		// remove duplicates
		if (addressLines[addressLines.length - 1] === line) continue;

		addressLines.push(line);
	}

	return {
		name: addressLines[0] || "",
		addr1: addressLines[1] || "",
		addr2: addressLines.slice(2).join(" "),
		city: city.replace(/,\s*$/, ""),
		state,
		zip,
		country: "",
		phone
	};
}

function extractAddressZ1(text) {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	const start = lines.findIndex((l) => /^Deliver To$/i.test(l));

	if (start === -1) return {};
	const block = lines.slice(start + 1, start + 10);

	const phone =
		block
			.find((l) => /^\d{10}$/.test(l.replace(/\D/g, "")))
			?.replace(/\D/g, "") || "";

	const countryIndex = block.findIndex((l) => /^United States$/i.test(l));

	const usableLines =
		countryIndex !== -1
			? block.slice(0, countryIndex)
			: block.filter((l) => l !== phone);

	let city = "";
	let state = "";
	let zip = "";
	let cityIndex = -1;

	// find city/state/zip line
	for (let i = 0; i < usableLines.length; i++) {
		const match = usableLines[i].match(/^(.*?),\s*(.+?)\s+(\d{5}(?:-\d{4})?)$/i);

		if (match) {
			city = match[1].trim();
			state = normalizeState(match[2].trim());
			zip = match[3].trim();
			cityIndex = i;
			break;
		}
	}

	const addrIndex = cityIndex - 1;

	let addr1 = "";
	let addr2 = "";

	if (addrIndex >= 0) {
		addr1 = usableLines[addrIndex];
	}

	const beforeAddress = usableLines.slice(0, addrIndex);

	let name = "";

	if (beforeAddress.length) {
		// last line before address = person's name
		name = beforeAddress[beforeAddress.length - 1];

		// everything before name = extra address info
		if (beforeAddress.length > 1) {
			addr2 = beforeAddress.slice(0, -1).join(" ");
		}
	}
	return {
		name,
		addr1,
		addr2,
		city,
		state,
		zip,
		country: "US",
		phone
	};
}

function extractAddressNTXGlow(text) {
	const match = text.match(
		/Ship to:\s*(.*?)\s+(\d+\s+.+?)\s*\n\s*(.+?),\s*([A-Za-z\s]+)\s+([A-Z0-9\s-]+)\s+(United States|Canada)/i
	);

	if (!match) {
		console.log("NTXGlow address failed:", text);
		return {};
	}

	const country = match[6].trim();

	return {
		name: match[1].trim(),
		addr1: match[2].trim(),
		addr2: "",
		city: match[3].trim(),
		state: normalizeState(match[4].trim()),
		zip: match[5].trim().toUpperCase(),
		country: country === "Canada" ? "CA" : "US",
		phone: "000-000-0000"
	};

	// Canada format
	match = text.match(
		/Ship to:\s*(.*?)\s+(\d+\s+.+?)\s+([A-Z\s]+),\s*([A-Za-z\s]+)\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s+Canada/i
	);

	if (match) {
		return {
			name: match[1].trim(),
			addr1: match[2].trim(),
			addr2: "",
			city: match[3].trim(),
			state: normalizeState(match[4].trim()),
			zip: match[5].trim().toUpperCase(),
			country: "CA",
			phone: "000-000-0000"
		};
	}

	console.log("NTXGlow address failed:", text);
	return {};
}

function cleanNTXGlowText(text) {
	return text.replace(/Ship to:[\s\S]*?United States/i, "");
}

function extractAddressGeneric(text) {
	const block = extractBlock(
		text,
		GENERIC_RULES.addressStart,
		GENERIC_RULES.addressEnd
	);

	if (!block) return {};

	let lines = block
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	lines = lines.filter((l) => !/customer information/i.test(l));

	if (lines[0] && /deliver to/i.test(lines[0])) {
		lines.shift();
	}

	let name = lines[0] || "";
	let addr1 = "",
		addr2 = "",
		city = "",
		state = "",
		zip = "";

	const addr1Index = lines.findIndex((l) => {
		const t = l.toLowerCase().trim();

		// must start with number
		if (!/^\d+/.test(t)) return false;

		// must contain letters (street name)
		if (!/[a-z]/i.test(t)) return false;

		// reject obvious non-address lines
		if (/ship to|bill to|customer information|phone|po#/i.test(t)) return false;

		return true;
	});

	if (addr1Index !== -1) {
		addr1 = lines[addr1Index];

		if (lines[addr1Index + 1] && !/,/.test(lines[addr1Index + 1])) {
			addr2 = lines[addr1Index + 1];
		}
	}

	// find city/state/zip
	for (let l of lines) {
		const parsed = parseCityStateZip(l);
		if (parsed.city) {
			city = parsed.city;
			state = parsed.state;
			zip = parsed.zip;
			break;
		}
	}

	const phoneMatch =
		matchFirst(text, GENERIC_RULES.phone) ||
		text.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0] ||
		"";

	const phone = phoneMatch.replace(/\D/g, "");

	let country = "US";

	if (Object.values(PROVINCE_MAP).includes(state)) {
		country = "CA";
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
