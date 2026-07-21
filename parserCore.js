function parseOrder(order) {
  const detection = detectBestDealer(order);
  const dealer = detection.dealer;

  lastDetection = detection;

  const plugin = PARSER_PLUGINS[dealer] || PARSER_PLUGINS.generic;

  const result = plugin.parse(order);

  return result;
}

function buildRow(order, dealer, items, addr) {
  const config = DEALER_CONFIG[dealer] || DEALER_CONFIG["redline360"];

  const paymentSection = getSection(
    order,
    "Payment/Shipping",
    "Deliver To|Products|$"
  );

  let po =
    matchFirst(paymentSection, GENERIC_RULES.po) ||
    matchFirst(order, GENERIC_RULES.po) ||
    "";

  const row = {
    "DShipper ID": config.dshipper,
    "Tr.Orig.No.": po,
    "Cust. PO No.": po
  };

  const MAX_ITEMS = 5;

  for (let i = 0; i < MAX_ITEMS; i++) {
    const item = items[i] || {};
    const sku = item.sku || "";

    row[`Item ID ${i + 1}`] = sku;
    row[`Qty ${i + 1}`] = item.qty || "";
    row[`Price ${i + 1}`] = getPrice(dealer, sku);
  }

  row["Ship Name"] = addr.name || "";
  row["Ship Addr1"] = addr.addr1 || "";
  row["Ship Addr2"] = addr.addr2 || "";
  row["Ship City"] = addr.city || "";
  row["Ship State"] = addr.state || "";
  row["Ship Zip"] = addr.zip || "";
  row["Ship Country"] = detectCountry(addr);
  row["Ship Phone"] = addr.phone || "";
  row["Ship Email"] = config.email;
  row["Ship Service"] = "GND";

  const totalPrice = items.reduce((sum, item) => {
    const price = Number(getPrice(dealer, item.sku)) || 0;
    const qty = Number(item.qty) || 0;

    return sum + price * qty;
  }, 0);

  row["Ship Ins."] = "";
  row["Ship COD"] = "";
  row["Ship Confirm."] = totalPrice > 500 ? "Y" : "";

  row["Ship From"] = config.thirdParty ? "Y" : "";
  row["Ship Acct"] = config.thirdParty ? "Y" : "";

  return [row];
}

function matchFirst(text, patterns) {
  for (let p of patterns) {
    const m = text.match(p);
    if (m) return (m[2] || m[1])?.trim();
  }
  return "";
}

function extractBlock(text, startPatterns, endPatterns) {
  let startIndex = -1;

  for (let p of startPatterns) {
    const m = text.search(p);
    if (m !== -1) {
      startIndex = m;
      break;
    }
  }

  if (startIndex === -1) return "";

  const afterStart = text.slice(startIndex);

  for (let p of endPatterns) {
    const m = afterStart.search(p);
    if (m !== -1) {
      return afterStart.slice(0, m);
    }
  }

  return afterStart;
}

function getSection(text, startLabel, endLabel) {
  const start = text.search(new RegExp(startLabel, "i"));
  if (start === -1) return "";

  const slice = text.slice(start);

  if (!endLabel) return slice;

  const end = slice.search(new RegExp(endLabel, "i"));
  return end === -1 ? slice : slice.slice(0, end);
}
