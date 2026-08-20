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
  updateUnknownTable();
}

function updateNewOrdersCount() {
  const el = document.getElementById("newOrdersCount");

  if (!el) return;

  el.textContent = previewOrders.length;
}

function updatePreview() {
  const head = document.getElementById("previewHeader"),
    body = document.getElementById("previewBody");

  head.innerHTML = "";
  body.innerHTML = "";

  document.getElementById("newOrdersCount").textContent = previewOrders.length;

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
}

function clearPreview() {
  previewOrders = [];
  updatePreview();
  updateDashboard();

  lastDetection = null;

  unknownOrders = [];
  selectedUnknownOrder = null;
  updateUnknownTable();

  const input = document.getElementById("input");
  if (input) input.value = "";
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

  lastDetection = null;

  updatePreview();
  updateDashboard();
  updateSavedTable();
}

function showToast(message, duration = 2500) {
  const oldToast = document.getElementById("appToast");

  if (oldToast) {
    oldToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "appToast";
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#333",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    zIndex: "99999",
    opacity: "0",
    transition: "opacity 0.2s ease"
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";

    setTimeout(() => {
      toast.remove();
    }, 200);
  }, duration);
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
      .filter(Boolean)
      .filter((sku) => !blockedItemIDs.has(sku));

    const counts = {};

    values.forEach((sku) => {
      counts[sku] = (counts[sku] || 0) + 1;
    });

    duplicateItemColumns[field] = new Set(
      Object.keys(counts).filter((sku) => counts[sku] > 1)
    );
  }

  // ---- headers ----
  const headers = Object.keys(savedOrders[0]).filter((h) => h !== "_notes");

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

  // notes column
  const notesTh = document.createElement("th");
  notesTh.textContent = "Notes";
  head.appendChild(notesTh);

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
          savedOrders[index][h] = cells[i + 4].textContent;
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

    const backorderBtn = document.createElement("button");

    backorderBtn.textContent = "🚚";
    backorderBtn.className = "action-btn";
    backorderBtn.title = "Send to Backorder";

    backorderBtn.onclick = async () => {
      const orderNo = r["Tr.Orig.No."] || "this order";
      const notes = r._notes || "";

      const confirmed = confirm(`Send ${orderNo} to Backorder?`);

      if (!confirmed) return;

      backorderBtn.disabled = true;
      backorderBtn.textContent = "⏳";

      try {
        const backorderData = { ...r };

        // Format all item prices to exactly 2 decimal places
        for (let i = 1; i <= 5; i++) {
          const field = `Price ${i}`;

          if (backorderData[field] !== "") {
            const price = Number(backorderData[field]);

            if (Number.isFinite(price)) {
              backorderData[field] = price.toFixed(2);
            }
          }
        }

        const response = await fetch(
          "https://adcjrkudofddvmcpmdzw.supabase.co/functions/v1/send-backorder",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(backorderData)
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.error("Backorder failed:", result);
          throw new Error(result.error || "Backorder failed");
        }

        console.log("Backorder created:", result.order);
        console.log("Notes:", notes);

        backorderBtn.textContent = "✅";
        backorderBtn.title = "Sent to Backorder";
        backorderBtn.disabled = true;

        showToast("🚚 Order sent to Backorder!");
      } catch (error) {
        console.error("Backorder error:", error);

        backorderBtn.disabled = false;
        backorderBtn.textContent = "🚚";

        showToast("❌ Failed to send order");
      }
    };

    const actionTd = document.createElement("td");

    actionTd.className = "action-cell";

    actionTd.appendChild(editBtn);
    actionTd.appendChild(copyBtn);
    actionTd.appendChild(deleteBtn);
    actionTd.appendChild(backorderBtn);

    tr.appendChild(actionTd);

    // NOTES
    const notesTd = document.createElement("td");
    notesTd.className = "notes-cell";

    const notesInput = document.createElement("textarea");

    notesInput.placeholder = "Add note...";
    notesInput.rows = 2;
    notesInput.value = r._notes || "";

    notesInput.style.width = "100px";
    notesInput.style.resize = "vertical";

    notesInput.disabled = editingRow !== index;

    notesInput.oninput = () => {
      savedOrders[index]._notes = notesInput.value;

      localStorage.setItem("savedOrders", JSON.stringify(savedOrders));
    };

    notesTd.appendChild(notesInput);
    tr.appendChild(notesTd);

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
          !blockedItemIDs.has(normalizedSKU) &&
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

          // Mark this cell as copied
          td.classList.add("copied-item");

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
