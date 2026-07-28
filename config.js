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
