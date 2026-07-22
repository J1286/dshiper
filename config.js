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

const PARSER_PLUGINS = {};

  PARSER_PLUGINS.redline360 = {
    parse: parseRedlineWrapper,
    confidence: 0.95
  };
  PARSER_PLUGINS.aag = {
    parse: parseAAGWrapper,
    confidence: 0.95
  };
  PARSER_PLUGINS.tdot = {
    parse: parseTDOTWrapper,
    confidence: 0.9
  };
  PARSER_PLUGINS.z1 = {
    parse: parseZ1Wrapper,
    confidence: 0.9
  };
  PARSER_PLUGINS.newdealer = {
    parse: parseNewDealerWrapper,
    confidence: 0.9
  };
  PARSER_PLUGINS.generic = {
    parse: parseGeneric,
    confidence: 0.5
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
  yukon: "YT"
};

const DEALER_CONFIG = {
  redline360: { dshipper: "W7232", email: "tracking@redline360.com" },
  aag: { dshipper: "W5511", email: "tracking@autoaccessoriesgarage.com" },

  tdot: {
    dshipper: "W7290",
    email: "support@tdotperformance.ca",
    thirdParty: true
  },

  z1: {
    dshipper: "W7292",
    email: "Purchasing@z1motorsports.com",
    thirdParty: true
  },

  newdealer: { dshipper: "WXXXX", email: "tracking@email.com" },
  newdealer2: {
    dshipper: "WXXXX",
    email: "whatever@email.com"
  }
};

const DSHIPPER_TO_DEALER = {
  W7232: "redline360",
  W5511: "aag",
  W7290: "tdot"
};
