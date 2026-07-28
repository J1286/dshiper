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
