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
    checklist.detected.push(
      `✅ PO found: ${analysis.poCandidates[0].value}`
    );
  } else {
    checklist.missing.push(
      "❌ PO detection needs improvement"
    );
  }

  if (analysis.itemCandidates?.length) {
    checklist.detected.push(
      `✅ Items found: ${analysis.itemCandidates.length}`
    );
  } else {
    checklist.missing.push(
      "❌ Item extraction needs improvement"
    );
  }

  if (analysis.addressCandidate?.addr1) {
    checklist.detected.push(
      "✅ Shipping address found"
    );
  } else {
    checklist.missing.push(
      "❌ Shipping address detection needs improvement"
    );
  }

  // ---- Dealer config checks ----
  if (config?.dshipper) {
    checklist.detected.push(
      `✅ DShipper ID: ${config.dshipper}`
    );
  } else {
    checklist.missing.push(
      "⚠ Add DShipper ID to config.js"
    );
  }

  if (config?.email) {
    checklist.detected.push(
      `✅ Email: ${config.email}`
    );
  } else {
    checklist.missing.push(
      "⚠ Add dealer email to config.js"
    );
  }

  return checklist;
}

function generateConfigStub(dealerName) {

return `
${dealerName}: {
    dshipper: "",
    email: ""
}
`;

}
