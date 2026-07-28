// -------- INIT --------
window.onload = function () {
	updateUnknownTable();
	document.getElementById("app").style.display = "block";

	// restore price table
	const savedPrice = localStorage.getItem("priceRows");
	if (savedPrice) {
		allPriceRows = JSON.parse(savedPrice);
		buildPriceTable();
	}

	// restore saved orders
	const saved = localStorage.getItem("savedOrders");
	if (saved) {
		const parsed = JSON.parse(saved);
		savedOrders = Array.isArray(parsed) ? parsed : [];
		updateSavedTable();
	}

	updatePriceStatus();
};

// -------- GLOBAL --------
let previewOrders = [];
let savedOrders = [];
let priceTable = {};
let allPriceRows = [];
let lastDetection = null;
let unknownOrders = [];
let selectedUnknownOrder = null;
let testParserFn = null;
let testParserName = "";

const PARSER_PLUGINS = {
	redline360: {
		parse: parseRedlineWrapper,
		confidence: 0.95
	},
	aag: {
		parse: parseAAGWrapper,
		confidence: 0.95
	},
	tdot: {
		parse: parseTDOTWrapper,
		confidence: 0.9
	},
	z1: {
		parse: parseZ1Wrapper,
		confidence: 0.9
	},
	ntxglow: {
		parse: parseNTXGlowWrapper,
		confidence: 0.95
	},
	generic: {
		parse: parseGeneric,
		confidence: 0.5
	}
};

const GENERIC_RULES = {
	po: [
		/Purchase Order\s*(?:\r?\n)\s*([A-Za-z0-9-]+)/i,
		/PO#\s*:\s*([A-Za-z0-9-]+)/i,
		/PO\s*#\s*:\s*([A-Za-z0-9-]+)/i,
		/Purchase Order\s*(?:Number|No\.?)?\s*:\s*([A-Za-z0-9-]+)/i,
		/\bPO\s+([A-Za-z0-9-]{5,})\b/i,
		/Order\s*#\s*([A-Za-z0-9-]+)/i,
		/#\s*PO[-\s]*([A-Za-z0-9-]+)/i
	],
	phone: [
		/Phone:\s*([0-9().\-\s]+)/i,
		/\bT:\s*([0-9().\-\s]+)/i,
		/\bTel:\s*([0-9().\-\s]+)/i
	],
	email: [/Email:\s*(\S+@\S+)/i],
	addressStart: [
		/Shipping Address:/i,
		/Ship To:/i,
		/Customer Information:/i,
		/Deliver To/i
	],
	addressEnd: [/Phone:/i, /Email:/i]
};
