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
let editingRow = -1;
let selectedOrders = new Set();

const blockedItemIDs = new Set([
  "HOLD",
  "NO ETA DISCONTINUED",
  "WAIT TO RECEIVE",
  "WH3",
  "ETA",
  "LAST",
  "BLOCKED",
  "ETA 6-8 WEEKS"
]);

const manualCheckDShippers = new Set([
    "W0640",
    "W5111"
]);

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
  omac: {
    parse: parseOMACWrapper,
    confidence: 0.9
  },
  procivic: {
    parse: parseGeneric,
    confidence: 0.9
  },
  ecs: {
    parse: parseGeneric,
    confidence: 0.9
  },
  pelican: {
    parse: parseGeneric,
    confidence: 0.9
  },
};

const GENERIC_RULES = {
  po: [
    /^\s*PO\s+Number\s*:\s*([A-Za-z0-9-]+)\s*$/im,
    /#\s*(PO-[A-Za-z0-9-]+)/i,
    /\b(PO-[A-Za-z0-9-]{5,})\b/i,
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

const DEALER_CONFIG = {
  redline360: {
    dshipper: "W7232",
    email: "tracking@redline360.com"
  },

  aag: {
    dshipper: "W5511",
    email: "tracking@autoaccessoriesgarage.com"
  },

  tdot: {
    dshipper: "W7290",
    email: "support@tdotperformance.ca",
    thirdParty: true,
    us: {
      email: "support@automotivestuff.com",
      thirdParty: false
    }
  },

  z1: {
    dshipper: "W7292",
    email: "Purchasing@z1motorsports.com",
    thirdParty: true
  },

  ntxglow: {
    dshipper: "W7266",
    email: "ntxglow@gmail.com",
    thirdParty: false
  },

  omac: {
    dshipper: "W7500",
    email: "info@omacshop.com",
    thirdParty: false
  },

  procivic: {
    dshipper: "W0640",
    email: "purchasing@procivic.com",
    thirdParty: false
  },
  ecs: {
    dshipper: "W6938",
    email: "jmajstruck@ecstuning.com",
    thirdParty: true
  },
  pelican: {
    dshipper: "W7505",
    email: "tgould@pelicanparts.com",
    thirdParty: false
  }
};

const DSHIPPER_TO_DEALER = {
  W7232: "redline360",
  W5511: "aag",
  W7290: "tdot",
  W7292: "z1",
  W7266: "ntxglow",
  W7500: "omac",
  W0640: "procivic",
  W6938: "ecs",
  W7505: "pelican"
};

const STATE_MAP = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};

const PROVINCE_MAP = {
  ontario: "ON",
  quebec: "QC",
  québec: "QC",
  "british columbia": "BC",
  alberta: "AB",
  manitoba: "MB",
  saskatchewan: "SK",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "prince edward island": "PE",
  "northwest territories": "NT",
  nunavut: "NU",
  yukon: "YT",
  "yukon territory": "YT"
};
