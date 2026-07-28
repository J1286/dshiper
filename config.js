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
	}
};

const DSHIPPER_TO_DEALER = {
	W7232: "redline360",
	W5511: "aag",
	W7290: "tdot",
  W7292: "z1",
  W7266: "ntxglow
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
