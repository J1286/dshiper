// -------- PROCESS & PREVIEW --------
function processData() {
  const raw = document.getElementById("input").value;
  const orders = raw.includes("Subject:") ? raw.split(/(?=Subject:)/g) : [raw];
  let result = [];
  orders.forEach((o) => (result = result.concat(safeParseOrder(o))));
  return result;
}

function addOrders() {
  const newOrders = processData();
  previewOrders = previewOrders.concat(newOrders);
  const input = document.getElementById("input");
  if (input) input.value = "";

  updatePreview();
  updateDetectionUI();
  updateUnknownTable();
}

function updatePreview() {
  const head = document.getElementById("previewHeader"),
    body = document.getElementById("previewBody");
  head.innerHTML = "";
  body.innerHTML = "";
  document.getElementById(
    "output"
  ).textContent = `Orders: ${previewOrders.length}`;

  if (!previewOrders.length) return;
  const headers = Object.keys(previewOrders[0]);
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  previewOrders.forEach((r) => {
    const tr = document.createElement("tr");
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.contentEditable = true;
      td.textContent = r[h] || "";

      if (
        h === "DShipper ID" &&
        manualCheckDShippers.has(String(r[h]).toUpperCase())
      ) {
        td.classList.add("manual-check");
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
  document.getElementById(
    "output"
  ).textContent = `Orders: ${previewOrders.length}`;
}

function clearPreview() {
  previewOrders = [];
  updatePreview();
  updateDashboard();

  lastDetection = null;
  updateDetectionUI();

  unknownOrders = [];
  selectedUnknownOrder = null;
  updateUnknownTable();

  const input = document.getElementById("input");
  if (input) input.value = "";

  document.getElementById("output").textContent = "Orders: 0";
}

function syncPreviewToOrders() {
  const head = document.getElementById("previewHeader"),
    body = document.getElementById("previewBody");
  const headers = Array.from(head.querySelectorAll("th")).map(
    (th) => th.textContent
  );
  const updatedOrders = [];
  Array.from(body.querySelectorAll("tr")).forEach((tr) => {
    const row = {};
    Array.from(tr.querySelectorAll("td")).forEach((td, i) => {
      row[headers[i]] = td.textContent;
    });
    updatedOrders.push(row);
  });

  previewOrders = updatedOrders;
}

function recalculateShipConfirm(row) {
  let total = 0;

  for (let i = 1; i <= 5; i++) {
    const price = parseFloat(row[`Price ${i}`]) || 0;
    const qty = parseFloat(row[`Qty ${i}`]) || 0;

    total += price * qty;
  }

  row["Ship Confirm."] = total > 500 ? "Y" : "";
}

function saveOrders() {
  syncPreviewToOrders();
  previewOrders.forEach(recalculateShipConfirm);

  savedOrders = savedOrders.concat(previewOrders);

  localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

  previewOrders = [];

  lastDetection = null; // clear detection UI
  updateDetectionUI();

  updatePreview();
  updateDashboard();
  updateSavedTable();
}

function updateSavedTable() {
  const head = document.getElementById("savedHeader");
  const body = document.getElementById("savedBody");

  head.innerHTML = "";
  body.innerHTML = "";

  if (!savedOrders.length) return;

  // Find duplicate SKUs within each Item ID column
  const duplicateItemColumns = {};

  for (let i = 1; i <= 5; i++) {
    const field = `Item ID ${i}`;

    const values = savedOrders
      .map((row) => (row[field] || "").trim().toUpperCase())
      .filter(Boolean);

    const counts = {};

    values.forEach((sku) => {
      counts[sku] = (counts[sku] || 0) + 1;
    });

    duplicateItemColumns[field] = new Set(
      Object.keys(counts).filter((sku) => counts[sku] > 1)
    );
  }

  // ---- headers ----
  const headers = Object.keys(savedOrders[0]);

  // # column
  const numTh = document.createElement("th");
  numTh.textContent = "#";
  head.appendChild(numTh);

  const selectTh = document.createElement("th");
  selectTh.textContent = "✓";
  head.appendChild(selectTh);

  // actions column
  const actionTh = document.createElement("th");
  actionTh.textContent = "Actions";
  head.appendChild(actionTh);

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  // ---- rows ----
  savedOrders.forEach((r, index) => {
    const tr = document.createElement("tr");

    // # cell
    const numTd = document.createElement("td");
    numTd.textContent = index + 1;
    tr.appendChild(numTd);

    const selectTd = document.createElement("td");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";

    checkbox.checked = selectedOrders.has(index);

    checkbox.onchange = () => {
      if (checkbox.checked) {
        selectedOrders.add(index);
      } else {
        selectedOrders.delete(index);
      }
    };

    selectTd.appendChild(checkbox);
    tr.appendChild(selectTd);

    // ACTION BUTTONS
    const editBtn = document.createElement("button");
    editBtn.className = "action-btn";
    editBtn.textContent = editingRow === index ? "💾" : "✏️";

    editBtn.onclick = () => {
      if (editingRow === index) {
        // Save the edited row
        const cells = tr.querySelectorAll("td");

        headers.forEach((h, i) => {
          savedOrders[index][h] = cells[i + 3].textContent;
        });

        const dealer = getDealerFromRow(savedOrders[index]);

        for (let i = 1; i <= 5; i++) {
          const skuField = `Item ID ${i}`;
          const priceField = `Price ${i}`;

          const newSku = savedOrders[index][skuField];
          const oldSku = r[skuField];

          if (newSku !== oldSku) {
            savedOrders[index][priceField] = getPrice(dealer, newSku);
          }
        }

        recalculateShipConfirm(savedOrders[index]);

        localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

        editingRow = -1;
      } else {
        editingRow = index;
      }

      updateSavedTable();
    };

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋";

    copyBtn.onclick = () => {
      const rowText = headers.map((h) => r[h] || "").join("\t");

      navigator.clipboard.writeText(rowText);

      copyBtn.textContent = "✅";

      setTimeout(() => {
        copyBtn.textContent = "📋";
      }, 800);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";

    deleteBtn.onclick = () => {
      const confirmed = confirm("Delete this order?");
      if (!confirmed) return;

      savedOrders.splice(index, 1);

      localStorage.setItem("savedOrders", JSON.stringify(savedOrders));

      updateSavedTable();
    };

    const actionTd = document.createElement("td");

    actionTd.className = "action-cell";
    copyBtn.className = "action-btn";
    deleteBtn.className = "action-btn";

    actionTd.appendChild(editBtn);
    actionTd.appendChild(copyBtn);
    actionTd.appendChild(deleteBtn);

    tr.appendChild(actionTd);

    // NORMAL CELLS
    headers.forEach((h) => {
      const td = document.createElement("td");

      if (h.startsWith("Price ") && r[h] !== "") {
        td.textContent = Number(r[h]).toFixed(2);
      } else {
        td.textContent = r[h] || "";
      }

      // HIGHLIGHT DUPLICATE ITEM IDS
      if (h.startsWith("Item ID") && r[h]) {
        const normalizedSKU = r[h].trim().toUpperCase();

        // Highlight duplicate SKU in this column
        if (
          duplicateItemColumns[h] &&
          duplicateItemColumns[h].has(normalizedSKU)
        ) {
          td.classList.add("duplicate-item");
          td.title = "Duplicate SKU in this column";
        }

        // Only Item ID cells are clickable/copiable
        td.style.cursor = "pointer";

        td.onclick = () => {
          if (editingRow === index) return;

          navigator.clipboard.writeText(r[h]);

          const old = td.textContent;
          td.textContent = "✅ Copied!";

          setTimeout(() => {
            td.textContent = old;
          }, 800);
        };
      }

      td.contentEditable = editingRow === index;

      if (editingRow === index) {
        td.style.background = "#fff8c5";
      }

      td.onblur = () => {
        savedOrders[index][h] = td.textContent;

        if (h.startsWith("Qty") || h.startsWith("Price")) {
          recalculateShipConfirm(savedOrders[index]);
        }

        localStorage.setItem("savedOrders", JSON.stringify(savedOrders));
      };

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}
