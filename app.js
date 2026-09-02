// -------- INIT --------
window.onload = function () {
  updateUnknownTable();
  document.getElementById("app").style.display = "block";

  // Initialize price source
  const savedPriceSource = localStorage.getItem("priceSource") || "api";

  const priceApiToggle = document.getElementById("priceApiToggle");

  if (priceApiToggle) {
    priceApiToggle.checked = savedPriceSource === "api";
  }

  handlePriceSourceToggle();

  // restore saved orders
  const saved = localStorage.getItem("savedOrders");

  if (saved) {
    const parsed = JSON.parse(saved);
    savedOrders = Array.isArray(parsed) ? parsed : [];

    // Refresh prices from the current price table
    savedOrders.forEach((row) => {});

    // Save refreshed prices back to localStorage
    localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

    updateSavedTable();
  }

  // restore temporary dealers
  window.temporaryDealerConfig = JSON.parse(
    localStorage.getItem("temporaryDealerConfig") || "{}"
  );

  updateTemporaryDealersDisplay();

  updateDashboard();
  updatePriceStatus();
};

function openBackOrder() {
  window.open("https://j1286.github.io/backorder/", "_blank");
}

function downloadExcel() {
  if (!savedOrders.length) {
    showToast("No orders to download");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(savedOrders);

  // Generate file as blob instead of direct download
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  // Get today's date
  const today = new Date();
  const month = today.getMonth() + 1; // Months are 0-based
  const day = today.getDate();
  const year = today.getFullYear();

  const fileName = `${month}-${day}-${year} FC Batch1.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${month}-${day}-${year} FC Batch1.csv`;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadSelectedOrders() {
  if (selectedOrders.size === 0) {
    showToast("No orders selected");
    return;
  }

  const selected = [...selectedOrders].map((index) => savedOrders[index]);

  const ws = XLSX.utils.json_to_sheet(selected);

  // Convert to CSV
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  // Get today's date
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();

  // Same naming format as regular download
  const fileName = `${month}-${day}-${year} FC Batch1.csv`;

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function copyAllOrders() {
  if (!savedOrders.length) {
    showToast("No saved orders to copy");
    return;
  }

  const headers = Object.keys(savedOrders[0]);

  const text = savedOrders
    .map((row) => headers.map((h) => row[h] || "").join("\t"))
    .join("\n");

  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast(`Copied ${savedOrders.length} orders`);
    })
    .catch((err) => {
      console.error("Copy failed:", err);
      showToast("Copy failed");
    });
}

function clearAllOrders() {
  const confirmed = confirm("Delete ALL saved orders?");
  if (!confirmed) return;

  savedOrders = [];
  localStorage.setItem("savedOrders", JSON.stringify(savedOrders));
  updateSavedTable();
  updateDashboard();
}

function updateUnknownTable() {
  const head = document.getElementById("unknownHeader");
  const body = document.getElementById("unknownBody");
  const status = document.getElementById("unknownStatus");

  head.innerHTML = "";
  body.innerHTML = "";

  status.textContent = `Unknown Orders: ${unknownOrders.length}`;

  if (!unknownOrders.length) return;

  const headers = ["Dealer Guess", "Confidence", "Raw Preview"];

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  unknownOrders.forEach((o, index) => {
    const tr = document.createElement("tr");

    tr.style.cursor = "pointer";
    tr.onclick = () => openRawViewer(index);

    const preview = o.raw.slice(0, 120).replace(/\n/g, " ");

    const cells = [o.detectedDealer, o.confidence.toFixed(2), preview];

    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
  updateDashboard();
}

function openRawViewer(index) {
  selectedUnknownOrder = unknownOrders[index];

  const viewer = document.getElementById("rawViewer");
  const textEl = document.getElementById("rawViewerText");
  const metaEl = document.getElementById("rawViewerMeta");

  textEl.textContent = selectedUnknownOrder.raw;

  metaEl.textContent = `
Dealer Guess: ${selectedUnknownOrder.detectedDealer || "unknown"}
Confidence: ${(selectedUnknownOrder.confidence ?? 0).toFixed(2)}
`.trim();

  viewer.style.display = "block";
}

function closeRawViewer() {
  document.getElementById("rawViewer").style.display = "none";
  selectedUnknownOrder = null;
}

function setDashCount(id, count) {
  const el = document.getElementById(id);

  if (!el) return;

  const stat = el.closest(".stat");

  if (!stat) return;

  if (count > 0) {
    stat.style.display = "flex";
    el.textContent = count;
  } else {
    stat.style.display = "none";
    el.textContent = "";
  }
}

function updateDashboard() {
  const dealerCount = {
    redline360: 0,
    aag: 0,
    tdot: 0,
    z1: 0,
    ntxglow: 0,
    omac: 0,
    procivic: 0,
    pelican: 0,
    obsession: 0
  };

  savedOrders.forEach((order) => {
    switch (order["DShipper ID"]) {
      case "W7232":
        dealerCount.redline360++;
        break;

      case "W5511":
        dealerCount.aag++;
        break;

      case "W7290":
        dealerCount.tdot++;
        break;

      case "W7292":
        dealerCount.z1++;
        break;

      case "W7266":
        dealerCount.ntxglow++;
        break;

      case "W7500":
        dealerCount.omac++;
        break;

      case "W0640":
        dealerCount.procivic++;
        break;
      case "W7505":
        dealerCount.pelican++;
        break;
      case "W7513":
        dealerCount.obsession++;
        break;
    }
  });

  setDashCount("dashRedline", dealerCount.redline360);
  setDashCount("dashAAG", dealerCount.aag);
  setDashCount("dashTDOT", dealerCount.tdot);
  setDashCount("dashZ1", dealerCount.z1);
  setDashCount("dashNTX", dealerCount.ntxglow);
  setDashCount("dashOMAC", dealerCount.omac);
  setDashCount("dashPROCIVIC", dealerCount.procivic);
  setDashCount("dashPELICAN", dealerCount.pelican);
  setDashCount("dashOBSESSION", dealerCount.obsession);
}

async function copyQuickPaste() {
  const text = document.getElementById("quickPaste").value;

  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    console.log("Copied:", text);
  } catch (err) {
    showToast("Clipboard access failed.");
  }
}

function filterSavedOrders() {
  const search = document.getElementById("savedSearch").value.toLowerCase();

  const rows = document.querySelectorAll("#savedBody tr");

  rows.forEach((row) => {
    const text = row.innerText.toLowerCase();

    row.style.display = text.includes(search) ? "" : "none";
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const quickPasteFloat = document.getElementById("quickPasteFloat");

  if (!quickPasteFloat) return;

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  // Restore saved position
  const savedPosition = localStorage.getItem("quickPastePosition");

  if (savedPosition) {
    try {
      const position = JSON.parse(savedPosition);

      quickPasteFloat.style.right = "auto";
      quickPasteFloat.style.left = position.left;
      quickPasteFloat.style.top = position.top;
    } catch (e) {
      console.log("Could not restore Quick Paste position");
    }
  }

  // Start dragging
  quickPasteFloat.addEventListener("mousedown", function (e) {
    // Don't drag when clicking the dropdown
    if (e.target.closest("select")) {
      return;
    }

    e.preventDefault();

    isDragging = true;

    const rect = quickPasteFloat.getBoundingClientRect();

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Convert current position to left/top
    quickPasteFloat.style.right = "auto";
    quickPasteFloat.style.left = rect.left + "px";
    quickPasteFloat.style.top = rect.top + "px";

    quickPasteFloat.style.cursor = "grabbing";
  });

  // Move
  document.addEventListener("mousemove", function (e) {
    if (!isDragging) return;

    e.preventDefault();

    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    // Keep it inside the browser window
    const maxLeft = window.innerWidth - quickPasteFloat.offsetWidth;
    const maxTop = window.innerHeight - quickPasteFloat.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    quickPasteFloat.style.left = newLeft + "px";
    quickPasteFloat.style.top = newTop + "px";
  });

  // Stop dragging
  document.addEventListener("mouseup", function () {
    if (!isDragging) return;

    isDragging = false;

    quickPasteFloat.style.cursor = "grab";

    // Save position
    localStorage.setItem(
      "quickPastePosition",
      JSON.stringify({
        left: quickPasteFloat.style.left,
        top: quickPasteFloat.style.top
      })
    );
  });
});