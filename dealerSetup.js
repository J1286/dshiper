function generateDealerChecklist(text) {
  const analysis = analyzeOrder(text);

  const dealer = detectBestDealer(text).dealer;

  const config = DEALER_CONFIG[dealer];

  const checklist = {
    dealer,
    detected: [],
    missing: []
  };

  // ---- Analyzer checks ----
  if (analysis.poCandidates?.length) {
    checklist.detected.push(`✅ PO found: ${analysis.poCandidates[0].value}`);
  } else {
    checklist.missing.push("❌ PO detection needs improvement");
  }

  if (analysis.itemCandidates?.length) {
    checklist.detected.push(
      `✅ Items found: ${analysis.itemCandidates.length}`
    );
  } else {
    checklist.missing.push("❌ Item extraction needs improvement");
  }

  if (analysis.addressCandidate?.addr1) {
    checklist.detected.push("✅ Shipping address found");
  } else {
    checklist.missing.push("❌ Shipping address detection needs improvement");
  }

  // ---- Dealer config checks ----
  if (config?.dshipper) {
    checklist.detected.push(`✅ DShipper ID: ${config.dshipper}`);
  } else {
    checklist.missing.push("⚠ DShipper ID not configured");
  }

  if (config?.email) {
    checklist.detected.push(`✅ Email: ${config.email}`);
  } else {
    checklist.missing.push("⚠ Dealer email not configured");
  }

  return checklist;
}

function generateConfigStub(dealerName, dshipper = "", email = "", thirdParty = false, keyword = "") {
  const safeName = dealerName
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

  return `
// ===== ADD TO DEALER_CONFIG =====

${safeName}: {
  dshipper: "${dshipper}",
  email: "${email}",
  thirdParty: ${thirdParty}
},

// ===== ADD TO DSHIPPER_TO_DEALER =====

${dshipper}: "${safeName}",

// ===== DETECTION KEYWORD =====

"${keyword}"
`;
}

function openDealerSetup() {
  if (!selectedUnknownOrder) {
    alert("Select an unknown order first.");
    return;
  }

  const text = selectedUnknownOrder.raw;
  const analysis = analyzeOrder(text);

  const detected = detectBestDealer(text);
  const suggestedDealer = detected?.dealer || "";

  // Try to find a useful detection keyword
  const suggestedKeyword = suggestDetectionKeyword(text);

  const win = window.open("", "_blank", "width=600,height=700");

  if (!win) {
    alert("Popup blocked. Please allow popups for this site.");
    return;
  }

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Dealer Setup</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      padding: 25px;
      color: #222;
    }

    .card {
      max-width: 520px;
      margin: auto;
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,.15);
    }

    h2 {
      margin-top: 0;
    }

    label {
      display: block;
      font-weight: bold;
      margin-top: 16px;
      margin-bottom: 5px;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 9px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 14px;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 18px;
    }

    .check input {
      width: auto;
    }

    .info {
      background: #f0f7ff;
      border: 1px solid #c9e2ff;
      padding: 12px;
      border-radius: 8px;
      margin: 15px 0;
      font-size: 13px;
    }

    button {
      margin-top: 20px;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    }

    #generateBtn {
      background: #1976d2;
      color: white;
    }

    #copyBtn {
      background: #2e7d32;
      color: white;
      display: none;
    }

    textarea {
      width: 100%;
      height: 220px;
      box-sizing: border-box;
      margin-top: 15px;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      display: none;
    }
  </style>
</head>

<body>

<div class="card">

  <h2>⚙️ Add New Dealer</h2>

  <div class="info">
    Analyzer found:
    <br>
    PO: ${
      analysis.poCandidates?.[0]?.value || "Not detected"
    }
    <br>
    Items: ${
      analysis.itemCandidates?.length || 0
    }
    <br>
    Address:
    ${
      analysis.addressCandidate?.addr1
        ? "✅ Found"
        : "⚠ Not found"
    }
  </div>

  <label>Dealer Name</label>
  <input
    id="dealerName"
    value="${escapeDealerSetupValue(suggestedDealer)}"
    placeholder="e.g. newdealer"
  >

  <label>DShipper ID</label>
  <input
    id="dshipper"
    placeholder="e.g. W7555"
  >

  <label>Dealer Email</label>
  <input
    id="email"
    placeholder="orders@example.com"
  >

  <label>Detection Keyword</label>
  <input
    id="keyword"
    value="${escapeDealerSetupValue(suggestedKeyword)}"
    placeholder="Unique text identifying this dealer"
  >

  <label class="check">
    <input type="checkbox" id="thirdParty">
    Third-party billing
  </label>

  <button id="generateBtn">
    Generate Config
  </button>

  <button id="copyBtn">
    📋 Copy Config
  </button>

  <textarea id="output" readonly></textarea>

</div>

<script>

document.getElementById("generateBtn").onclick = function() {

  const dealerName =
    document.getElementById("dealerName").value.trim();

  const dshipper =
    document.getElementById("dshipper").value.trim().toUpperCase();

  const email =
    document.getElementById("email").value.trim();

  const keyword =
    document.getElementById("keyword").value.trim();

  const thirdParty =
    document.getElementById("thirdParty").checked;

  if (!dealerName) {
    alert("Enter a dealer name.");
    return;
  }

  if (!dshipper) {
    alert("Enter a DShipper ID.");
    return;
  }

  if (!email) {
    alert("Enter a dealer email.");
    return;
  }

  const safeName = dealerName
    .replace(/\\s+/g, "_")
    .toLowerCase();

  const output = \`
// ===== ADD TO DEALER_CONFIG =====

\${safeName}: {
  dshipper: "\${dshipper}",
  email: "\${email}",
  thirdParty: \${thirdParty}
},

// ===== ADD TO DSHIPPER_TO_DEALER =====

\${dshipper}: "\${safeName}",

// ===== DETECTION KEYWORD =====

"\${keyword}"
\`;

  const textarea =
    document.getElementById("output");

  textarea.value = output;
  textarea.style.display = "block";

  document.getElementById("copyBtn").style.display =
    "inline-block";
};

document.getElementById("copyBtn").onclick = async function() {

  const textarea =
    document.getElementById("output");

  try {

    await navigator.clipboard.writeText(
      textarea.value
    );

    this.textContent = "✅ Copied!";

    setTimeout(() => {
      this.textContent = "📋 Copy Config";
    }, 1200);

  } catch (err) {

    textarea.select();
    document.execCommand("copy");

    this.textContent = "✅ Copied!";

    setTimeout(() => {
      this.textContent = "📋 Copy Config";
    }, 1200);
  }
};

</script>

</body>
</html>
  `);

  win.document.close();
}

function escapeDealerSetupValue(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function saveTemporaryDealer() {
  const nameInput = document.getElementById("dealerSetupName");
  const dshipperInput = document.getElementById("dealerSetupDshipper");
  const emailInput = document.getElementById("dealerSetupEmail");
  const thirdPartyInput = document.getElementById("dealerSetupThirdParty");
  const keywordInput = document.getElementById("dealerSetupKeyword");
  const status = document.getElementById("dealerSetupStatus");

  const dealerName = nameInput.value.trim();
  const dshipper = dshipperInput.value.trim().toUpperCase();
  const email = emailInput.value.trim();
  const thirdParty = thirdPartyInput.checked;
  const keyword = keywordInput.value.trim();

  if (!dealerName) {
    status.textContent = "❌ Dealer name is required";
    status.style.color = "red";
    return;
  }

  if (!dshipper) {
    status.textContent = "❌ DShipper ID is required";
    status.style.color = "red";
    return;
  }

  const safeName = dealerName
    .replace(/\s+/g, "_")
    .toLowerCase();

  window.temporaryDealerConfig =
  window.temporaryDealerConfig || {};

window.temporaryDealerConfig[safeName] = {
  dealer: safeName,
  dshipper,
  email,
  thirdParty,
  keyword
};

localStorage.setItem(
  "temporaryDealerConfig",
  JSON.stringify(window.temporaryDealerConfig)
);

  status.textContent = `✅ ${safeName} saved`;
  status.style.color = "green";

  updateTemporaryDealersDisplay();
  updateTemporaryDealerManager();
}

function updateTemporaryDealersDisplay() {
  const output = document.getElementById("temporaryDealersOutput");

  if (!output) return;

  const dealers = Object.entries(
    window.temporaryDealerConfig || {}
  );

  if (!dealers.length) {
    output.innerHTML = `
      <div class="no-temporary-dealers">
        No temporary dealers added.
      </div>
    `;
    return;
  }

  output.innerHTML = dealers
    .map(([name, config]) => {
      return `
        <div class="temporary-dealer-card">

          <div class="temporary-dealer-header">
            <strong>${escapeHtml(name)}</strong>
          </div>

          <div class="temporary-dealer-info">

            <div>
              <strong>DShipper:</strong>
              ${escapeHtml(config.dshipper || "(none)")}
            </div>

            <div>
              <strong>Email:</strong>
              ${escapeHtml(config.email || "(none)")}
            </div>

            <div>
              <strong>Third Party:</strong>
              ${config.thirdParty ? "YES" : "NO"}
            </div>

            <div>
              <strong>Keyword:</strong>
              ${escapeHtml(config.keyword || "(none)")}
            </div>
          </div>

          <div class="temporary-dealer-buttons">
            <button
              onclick="editTemporaryDealer('${escapeJsString(name)}')"
            >
              ✏️ Edit
            </button>
            <button
              onclick="testTemporaryDealer('${escapeJsString(name)}')"
            >
              🔎 Test
            </button>

            <button
              onclick="generateTemporaryDealerConfig('${escapeJsString(name)}')"
            >
              📋 Config
            </button>
            <button
              onclick="deleteTemporaryDealer('${escapeJsString(name)}')"
              class="delete-dealer-button"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function editTemporaryDealer(dealerName) {
  const dealer =
    window.temporaryDealerConfig?.[dealerName];

  if (!dealer) {
    alert("Temporary dealer not found.");
    return;
  }

  // Open the existing dealer setup area
  const rawViewer =
    document.getElementById("rawViewer");

  if (rawViewer) {
    rawViewer.style.display = "flex";
  }

  document.getElementById("dealerSetupName").value =
    dealerName;

  document.getElementById("dealerSetupDshipper").value =
    dealer.dshipper || "";

  document.getElementById("dealerSetupEmail").value =
    dealer.email || "";

  document.getElementById("dealerSetupThirdParty").checked =
    !!dealer.thirdParty;

  document.getElementById("dealerSetupKeyword").value =
    dealer.keyword || "";

  const status =
    document.getElementById("dealerSetupStatus");

  if (status) {
    status.textContent =
      `✏️ Editing ${dealerName}`;

    status.style.color = "#1976d2";
  }

  document
    .getElementById("dealerSetupName")
    ?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
}

function deleteTemporaryDealer(dealerName) {
  const dealer =
    window.temporaryDealerConfig?.[dealerName];

  if (!dealer) return;

  const confirmed = confirm(
    `Delete temporary dealer "${dealerName}"?`
  );

  if (!confirmed) return;

  delete window.temporaryDealerConfig[dealerName];

  localStorage.setItem(
    "temporaryDealerConfig",
    JSON.stringify(window.temporaryDealerConfig)
  );

  updateTemporaryDealersDisplay();
  updateTemporaryDealerManager();
}

function generateTemporaryDealerConfig(dealerName) {
  const dealer =
    window.temporaryDealerConfig?.[dealerName];

  if (!dealer) {
    alert("Temporary dealer not found.");
    return;
  }

  const configText = generateConfigStub(
    dealerName,
    dealer.dshipper || "",
    dealer.email || "",
    !!dealer.thirdParty,
    dealer.keyword || ""
  );

  const win = window.open("", "_blank");

  if (!win) {
    alert(
      "Popup blocked. Please allow popups for this site."
    );
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dealer Config - ${escapeHtml(dealerName)}</title>
      </head>

      <body style="
        font-family: Arial, sans-serif;
        padding: 25px;
      ">

        <h2>
          Dealer Config: ${escapeHtml(dealerName)}
        </h2>

        <pre style="
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          overflow-x: auto;
        ">${escapeHtml(configText)}</pre>

      </body>
    </html>
  `);

  win.document.close();
}

function escapeJsString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function generateDealerConfigFromForm() {
  const dealerName = document
    .getElementById("dealerSetupName")
    .value
    .trim();

  const dshipper = document
    .getElementById("dealerSetupDshipper")
    .value
    .trim()
    .toUpperCase();

  const email = document
    .getElementById("dealerSetupEmail")
    .value
    .trim();

  const thirdParty = document
    .getElementById("dealerSetupThirdParty")
    .checked;

  const keyword = document
    .getElementById("dealerSetupKeyword")
    .value
    .trim();

  if (!dealerName || !dshipper) {
    alert("Dealer name and DShipper ID are required.");
    return;
  }

  const configText = generateConfigStub(
    dealerName,
    dshipper,
    email,
    thirdParty,
    keyword
  );

  const win = window.open("", "_blank");

  if (!win) {
    alert("Popup blocked. Please allow popups for this site.");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Dealer Config</title>
      </head>
      <body>
        <h2>Dealer Config</h2>
        <pre>${escapeHtml(configText)}</pre>
      </body>
    </html>
  `);

  win.document.close();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getTemporaryDealer(dealerName) {
  if (!dealerName) return null;

  const normalized = dealerName.trim().toLowerCase();

  return (
    temporaryDealerConfig[normalized] || null
  );
}

function detectTemporaryDealer(text) {
  const lowerText = String(text || "").toLowerCase();

  const dealers = window.temporaryDealerConfig || {};

  for (const [name, dealer] of Object.entries(dealers)) {
    if (!dealer) continue;

    const keywords = String(dealer.keyword || "")
      .split(",")
      .map(keyword => keyword.trim().toLowerCase())
      .filter(Boolean);

    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return {
          dealer: name,
          dshipper: dealer.dshipper || "",
          email: dealer.email || "",
          thirdParty: !!dealer.thirdParty,
          keyword: dealer.keyword || ""
        };
      }
    }
  }

  return null;
}

function openTemporaryDealerManager() {
  const manager =
    document.getElementById("temporaryDealerManager");

  if (!manager) return;

  updateTemporaryDealerManager();

  manager.style.display = "flex";
}

function closeTemporaryDealerManager() {
  const manager =
    document.getElementById("temporaryDealerManager");

  if (!manager) return;

  manager.style.display = "none";
}

function updateTemporaryDealerManager() {
  const output =
    document.getElementById("temporaryDealerManagerOutput");

  if (!output) return;

  const dealers = Object.entries(
    window.temporaryDealerConfig || {}
  );

  if (!dealers.length) {
    output.innerHTML = `
      <div class="no-temporary-dealers">
        No temporary dealers added.
      </div>
    `;
    return;
  }

  output.innerHTML = dealers
    .map(([name, config]) => {

      return `
        <div class="temporary-dealer-card">

          <div class="temporary-dealer-header">
            <strong>${escapeHtml(name)}</strong>
          </div>

          <div class="temporary-dealer-info">

            <div>
              <strong>DShipper:</strong>
              ${escapeHtml(config.dshipper || "(none)")}
            </div>

            <div>
              <strong>Email:</strong>
              ${escapeHtml(config.email || "(none)")}
            </div>

            <div>
              <strong>Third Party:</strong>
              ${config.thirdParty ? "YES" : "NO"}
            </div>

            <div>
              <strong>Keyword:</strong>
              ${escapeHtml(config.keyword || "(none)")}
            </div>

          </div>

          <div class="temporary-dealer-buttons">

            <button
              onclick="editTemporaryDealer('${escapeJsString(name)}')"
            >
              ✏️ Edit
            </button>

            <button
              onclick="testTemporaryDealer('${escapeJsString(name)}')"
            >
              🔎 Test
            </button>

            <button
              onclick="generateTemporaryDealerConfig('${escapeJsString(name)}')"
            >
              📋 Config
            </button>

            <button
              onclick="deleteTemporaryDealer('${escapeJsString(name)}')"
              class="delete-dealer-button"
            >
              🗑️ Delete
            </button>

          </div>

        </div>
      `;

    })
    .join("");
}