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
    updateDashboard();
  }

  updatePriceStatus();
};

function downloadExcel() {
  if (!savedOrders.length) {
    console.log("No orders to download");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(savedOrders);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SavedOrders");

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
    alert("No orders selected");
    return;
  }

  const selected = [...selectedOrders].map((index) => savedOrders[index]);

  const ws = XLSX.utils.json_to_sheet(selected);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "SelectedOrders");

  XLSX.writeFile(wb, "Selected_Orders.xlsx");
}

function copyAllOrders() {
  if (!savedOrders.length) {
    alert("No saved orders to copy");
    return;
  }

  const headers = Object.keys(savedOrders[0]);

  const text = savedOrders
    .map((row) => headers.map((h) => row[h] || "").join("\t"))
    .join("\n");

  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert(`Copied ${savedOrders.length} orders`);
    })
    .catch((err) => {
      console.error("Copy failed:", err);
      alert("Copy failed");
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

function updateDetectionUI() {
  const el = document.getElementById("detectionInfo");

  if (!lastDetection) {
    el.textContent = "No order analyzed yet";
    return;
  }

  const lines = [];

  lines.push(`Best Match: ${lastDetection.dealer}`);
  lines.push(`Confidence: ${lastDetection.confidence.toFixed(2)}`);
  lines.push("");
  lines.push("Ranking:");

  lastDetection.ranked.forEach((r) => {
    lines.push(`- ${r.dealer}: ${r.score.toFixed(2)}`);
  });

  el.textContent = lines.join("\n");
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

function setDashCount(id, value) {
  const el = document.getElementById(id);

  el.textContent = value;

  if (value > 0) {
    el.classList.add("active");
  } else {
    el.classList.remove("active");
  }
}

function updateDashboard() {
  const dealerCount = {
    redline360: 0,
    aag: 0,
    tdot: 0,
    z1: 0,
    ntxglow: 0
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
    }
  });

  setDashCount("dashRedline", dealerCount.redline360);
  setDashCount("dashAAG", dealerCount.aag);
  setDashCount("dashTDOT", dealerCount.tdot);
  setDashCount("dashZ1", dealerCount.z1);
  setDashCount("dashNTX", dealerCount.ntxglow);
}

async function copyQuickPaste() {
    const text = document.getElementById("quickPaste").value;

    if (!text) {
        alert("Please choose an option first.");
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        console.log("Copied:", text);
    } catch (err) {
        alert("Clipboard access failed.");
    }
}
