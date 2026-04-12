import { api } from "./services/api.js";
import {
  getInvoiceRecords,
  getSavedCustomerPhones,
  markInvoiceWhatsappSent,
  rememberCustomerPhone,
  saveInvoiceRecord,
} from "./services/storage.js";

const elements = {
  status: document.getElementById("invoice-page-status"),
  card: document.getElementById("invoice-card"),
  summary: document.getElementById("invoice-summary"),
  itemsBody: document.getElementById("invoice-items-body"),
  totals: document.getElementById("invoice-totals"),
  downloadPdf: document.getElementById("invoice-download-pdf"),
  whatsappAction: document.getElementById("invoice-whatsapp"),
  customerPhoneInput: document.getElementById("invoice-customer-phone"),
  phoneSuggestions: document.getElementById("invoice-phone-suggestions"),
};

const EXTERNAL_SCRIPT_URLS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  jspdfAutoTable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  qrcode: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
};

const externalScriptLoaders = new Map();
let activeInvoice = null;
const SHARE_ID_REGEX = /^[A-Za-z0-9_-]{24,128}$/;

function asNumber(value, fallback = 0) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function clearElementChildren(element) {
  if (!element) {
    return;
  }

  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function getRuntimeConfigValue(key) {
  return String(window.__APP_CONFIG__?.[key] || "").trim();
}

function formatCurrency(value) {
  const normalizedValue = asNumber(value, 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedValue);
}

function setStatus(message, tone = "neutral") {
  if (!elements.status) {
    return;
  }

  elements.status.textContent = String(message || "");
  delete elements.status.dataset.tone;

  if (tone && tone !== "neutral") {
    elements.status.dataset.tone = tone;
  }
}

function getShopProfileFallback() {
  return {
    name: getRuntimeConfigValue("SHOP_NAME") || "CounterCraft POS",
    address: getRuntimeConfigValue("SHOP_ADDRESS") || "",
    phone: getRuntimeConfigValue("SHOP_PHONE") || "",
    gstin: getRuntimeConfigValue("SHOP_GSTIN") || "",
  };
}

function buildInvoicePublicLink(shareId) {
  const configuredBase = getRuntimeConfigValue("BILL_PUBLIC_BASE_URL").replace(/\/$/, "");
  const normalizedShareId = String(shareId || "").trim();

  if (!normalizedShareId) {
    return "";
  }

  if (configuredBase) {
    return `${configuredBase}/${encodeURIComponent(normalizedShareId)}`;
  }

  const localBillUrl = new URL("./bill.html", window.location.href);
  localBillUrl.hash = `share/${encodeURIComponent(normalizedShareId)}`;
  return localBillUrl.toString();
}

function normalizeInvoiceItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      name: String(item?.name || "Item").trim() || "Item",
      quantity: Math.max(asNumber(item?.quantity), 0),
      unitPrice: Math.max(asNumber(item?.unitPrice), 0),
      lineTotal: Math.max(asNumber(item?.lineTotal), 0),
    }))
    .slice(0, 250);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
}

function getShareIdFromLocation() {
  const url = new URL(window.location.href);
  const hashValue = String(url.hash || "").replace(/^#/, "").trim();

  if (hashValue) {
    const hashParts = hashValue.split("/").filter(Boolean);
    const hashCandidate = safeDecodeURIComponent(hashParts[hashParts.length - 1] || "").trim();
    if (SHARE_ID_REGEX.test(hashCandidate)) {
      return hashCandidate;
    }
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPathSegment = safeDecodeURIComponent(pathParts[pathParts.length - 1] || "").trim();

  if (lastPathSegment && !/bill\.html$/i.test(lastPathSegment) && SHARE_ID_REGEX.test(lastPathSegment)) {
    return lastPathSegment;
  }

  return "";
}

function findCachedInvoiceByShareId(shareId) {
  const normalizedShareId = String(shareId || "").trim();
  if (!normalizedShareId) {
    return null;
  }

  const cachedInvoices = getInvoiceRecords();
  return (
    cachedInvoices.find((entry) => String(entry?.shareId || "").trim() === normalizedShareId) || null
  );
}

function normalizeInvoiceRecord(rawRecord = {}, fallbackShareId = "") {
  const invoiceId = String(rawRecord.invoiceId || "").trim();
  if (!invoiceId) {
    return null;
  }

  const shareId = String(rawRecord.shareId || fallbackShareId || "").trim();

  const createdAt = String(rawRecord.createdAt || new Date().toISOString());
  const items = normalizeInvoiceItems(rawRecord.items || []);

  const invoiceRecord = {
    invoiceId,
    billNumber: String(rawRecord.billNumber || invoiceId),
    createdAt,
    shop: {
      ...getShopProfileFallback(),
      ...(rawRecord.shop || {}),
    },
    items,
    subtotal: Math.max(asNumber(rawRecord.subtotal), 0),
    tax: Math.max(asNumber(rawRecord.tax), 0),
    discount: Math.max(asNumber(rawRecord.discount), 0),
    total: Math.max(asNumber(rawRecord.total), 0),
    paymentMethod: String(rawRecord.paymentMethod || "cash").toLowerCase(),
    paidAmount: Math.max(asNumber(rawRecord.paidAmount), 0),
    changeDue: Math.max(asNumber(rawRecord.changeDue), 0),
    cashier: String(rawRecord.cashier || "Default Cashier"),
    customerPhone: String(rawRecord.customerPhone || "").trim(),
    sentViaWhatsapp: Boolean(rawRecord.sentViaWhatsapp),
    sentAt: String(rawRecord.sentAt || "").trim(),
    source: String(rawRecord.source || "shared-link"),
    isOffline: Boolean(rawRecord.isOffline),
    shareId,
    shareIdExpiresAt: String(rawRecord.shareIdExpiresAt || rawRecord.expiresAt || "").trim(),
  };

  if (!invoiceRecord.total && items.length) {
    invoiceRecord.total = items.reduce((sum, item) => sum + Math.max(asNumber(item.lineTotal), 0), 0);
  }

  if (!invoiceRecord.subtotal) {
    invoiceRecord.subtotal = Math.max(invoiceRecord.total - invoiceRecord.tax + invoiceRecord.discount, 0);
  }

  if (!invoiceRecord.paidAmount) {
    invoiceRecord.paidAmount = invoiceRecord.total;
  }

  invoiceRecord.invoiceLink =
    String(rawRecord.invoiceLink || "").trim() ||
    buildInvoicePublicLink(invoiceRecord.shareId);

  return invoiceRecord;
}

async function fetchPublicInvoiceRecordByShareId(shareId) {
  const normalizedShareId = String(shareId || "").trim();
  if (!normalizedShareId) {
    return null;
  }

  try {
    const response = await api.getPublicInvoiceByShareId(normalizedShareId);
    const normalizedRecord = normalizeInvoiceRecord(
      {
        ...(response?.data || {}),
        shareId: normalizedShareId,
      },
      normalizedShareId
    );

    if (!normalizedRecord) {
      return null;
    }

    return saveInvoiceRecord(normalizedRecord) || normalizedRecord;
  } catch (error) {
    return null;
  }
}

async function hydrateInvoiceRecord() {
  const shareId = getShareIdFromLocation();
  if (!shareId) {
    return {
      invoiceRecord: null,
      missingMessage: "Invalid invoice link. Please request a new bill link.",
    };
  }

  const publicInvoiceRecord = await fetchPublicInvoiceRecordByShareId(shareId);
  if (publicInvoiceRecord) {
    return {
      invoiceRecord: publicInvoiceRecord,
      missingMessage: "",
    };
  }

  const cachedRecord = findCachedInvoiceByShareId(shareId);
  const normalizedRecord = normalizeInvoiceRecord(cachedRecord || {}, shareId);

  if (!normalizedRecord) {
    return {
      invoiceRecord: null,
      missingMessage: "Invoice link is invalid, expired, or unavailable. Please request a new bill link.",
    };
  }

  return {
    invoiceRecord: saveInvoiceRecord(normalizedRecord) || normalizedRecord,
    missingMessage: "",
  };
}

function appendSummaryCard(label, value) {
  const card = document.createElement("article");
  card.className = "invoice-summary-card";

  const title = document.createElement("p");
  title.textContent = label;

  const content = document.createElement("strong");
  content.textContent = value;

  card.appendChild(title);
  card.appendChild(content);
  elements.summary.appendChild(card);
}

function renderInvoiceSummary(invoiceRecord) {
  if (!elements.summary) {
    return;
  }

  clearElementChildren(elements.summary);

  const createdAt = new Date(invoiceRecord.createdAt || Date.now());
  appendSummaryCard("Invoice", String(invoiceRecord.billNumber || invoiceRecord.invoiceId));
  appendSummaryCard("Date", createdAt.toLocaleString());
  appendSummaryCard("Payment", String(invoiceRecord.paymentMethod || "cash").toUpperCase());
  appendSummaryCard("Cashier", String(invoiceRecord.cashier || "Default Cashier"));
  appendSummaryCard("Store", String(invoiceRecord.shop?.name || "CounterCraft POS"));
  appendSummaryCard("WhatsApp Status", invoiceRecord.sentViaWhatsapp ? "Sent" : "Not Sent");
}

function renderInvoiceItems(invoiceRecord) {
  if (!elements.itemsBody) {
    return;
  }

  clearElementChildren(elements.itemsBody);

  if (!invoiceRecord.items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No line items were found for this invoice.";
    row.appendChild(cell);
    elements.itemsBody.appendChild(row);
    return;
  }

  invoiceRecord.items.forEach((item) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const qtyCell = document.createElement("td");
    const priceCell = document.createElement("td");
    const totalCell = document.createElement("td");

    nameCell.textContent = String(item.name || "Item");
    qtyCell.textContent = String(item.quantity || 0);
    priceCell.textContent = formatCurrency(item.unitPrice || 0);
    totalCell.textContent = formatCurrency(item.lineTotal || 0);

    row.appendChild(nameCell);
    row.appendChild(qtyCell);
    row.appendChild(priceCell);
    row.appendChild(totalCell);
    elements.itemsBody.appendChild(row);
  });
}

function appendTotalRow(label, value, isGrand = false) {
  const row = document.createElement("div");
  row.className = `invoice-total-row${isGrand ? " grand" : ""}`;

  const labelNode = document.createElement("span");
  labelNode.textContent = label;

  const valueNode = document.createElement(isGrand ? "strong" : "span");
  valueNode.textContent = value;

  row.appendChild(labelNode);
  row.appendChild(valueNode);
  elements.totals.appendChild(row);
}

function renderInvoiceTotals(invoiceRecord) {
  if (!elements.totals) {
    return;
  }

  clearElementChildren(elements.totals);
  appendTotalRow("Subtotal", formatCurrency(invoiceRecord.subtotal || 0));
  appendTotalRow("Tax", formatCurrency(invoiceRecord.tax || 0));
  appendTotalRow("Discount", formatCurrency(invoiceRecord.discount || 0));
  appendTotalRow("Paid", formatCurrency(invoiceRecord.paidAmount || 0));
  appendTotalRow("Change", formatCurrency(invoiceRecord.changeDue || 0));
  appendTotalRow("Grand Total", formatCurrency(invoiceRecord.total || 0), true);
}

function normalizeCustomerPhone(value) {
  return String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

function resolveWhatsappPhoneNumber(value) {
  const normalizedInput = normalizeCustomerPhone(value);
  const digitsOnly = normalizedInput.replace(/\D/g, "");
  const defaultCountryCode = getRuntimeConfigValue("WHATSAPP_DEFAULT_COUNTRY_CODE").replace(/\D/g, "") || "91";

  if (normalizedInput.startsWith("+")) {
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      return digitsOnly;
    }
    return "";
  }

  if (digitsOnly.length === 10) {
    return `${defaultCountryCode}${digitsOnly}`;
  }

  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return digitsOnly;
  }

  return "";
}

function buildBillWhatsappMessage(invoiceRecord) {
  const createdAt = new Date(invoiceRecord.createdAt || Date.now());
  const lines = [
    `Hello! Thank you for your purchase from ${invoiceRecord.shop?.name || "CounterCraft POS"}.`,
    `Bill No: ${invoiceRecord.billNumber || invoiceRecord.invoiceId || "-"}`,
    `Date: ${createdAt.toLocaleString()}`,
    `Payment: ${String(invoiceRecord.paymentMethod || "cash").toUpperCase()}`,
    "",
    "Bill summary:",
  ];

  invoiceRecord.items.slice(0, 10).forEach((item) => {
    lines.push(`- ${item.name || "Item"} x${item.quantity || 0} = ${formatCurrency(item.lineTotal || 0)}`);
  });

  if (invoiceRecord.items.length > 10) {
    lines.push(`...and ${invoiceRecord.items.length - 10} more item(s)`);
  }

  lines.push("");
  lines.push(`Total: ${formatCurrency(invoiceRecord.total || 0)}`);
  lines.push(`Paid: ${formatCurrency(invoiceRecord.paidAmount || 0)}`);
  lines.push(`Change: ${formatCurrency(invoiceRecord.changeDue || 0)}`);

  if (invoiceRecord.invoiceLink) {
    lines.push("");
    lines.push(`You can download your bill here: ${invoiceRecord.invoiceLink}`);
  }

  return lines.join("\n");
}

function renderPhoneSuggestions() {
  if (!elements.phoneSuggestions) {
    return;
  }

  const phones = getSavedCustomerPhones();
  clearElementChildren(elements.phoneSuggestions);

  phones.forEach((phone) => {
    const optionElement = document.createElement("option");
    optionElement.value = String(phone || "").trim();
    elements.phoneSuggestions.appendChild(optionElement);
  });
}

function setInvoice(record, { missingMessage = "" } = {}) {
  activeInvoice = record;

  if (!activeInvoice) {
    setStatus(
      String(missingMessage || "Invoice was not found. Please request a new bill link."),
      "error"
    );
    elements.card?.classList.add("hidden");
    return;
  }

  if (elements.customerPhoneInput) {
    elements.customerPhoneInput.value = String(activeInvoice.customerPhone || "").trim();
  }

  renderInvoiceSummary(activeInvoice);
  renderInvoiceItems(activeInvoice);
  renderInvoiceTotals(activeInvoice);
  renderPhoneSuggestions();

  const sentInfo = activeInvoice.sentViaWhatsapp && activeInvoice.sentAt
    ? ` Sent at ${new Date(activeInvoice.sentAt).toLocaleString()}.`
    : "";

  setStatus(`Invoice loaded successfully.${sentInfo}`, "success");
  elements.card?.classList.remove("hidden");
}

function loadExternalScript(url, globalName) {
  if (globalName && window[globalName]) {
    return Promise.resolve(window[globalName]);
  }

  const existingPromise = externalScriptLoaders.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  const scriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-external-src="${url}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalName ? window[globalName] : true), {
        once: true,
      });
      existingScript.addEventListener("error", () => reject(new Error(`Unable to load script: ${url}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.defer = true;
    script.dataset.externalSrc = url;

    script.addEventListener("load", () => resolve(globalName ? window[globalName] : true), { once: true });
    script.addEventListener(
      "error",
      () => {
        externalScriptLoaders.delete(url);
        reject(new Error(`Unable to load script: ${url}`));
      },
      { once: true }
    );

    document.head.appendChild(script);
  });

  externalScriptLoaders.set(url, scriptPromise);
  return scriptPromise;
}

async function ensurePdfLibrary() {
  const jsPdfNamespace = await loadExternalScript(EXTERNAL_SCRIPT_URLS.jspdf, "jspdf");
  try {
    await loadExternalScript(EXTERNAL_SCRIPT_URLS.jspdfAutoTable);
  } catch (error) {
    // Keep PDF download functional with fallback rendering.
  }

  const jsPDF = jsPdfNamespace?.jsPDF;

  if (typeof jsPDF !== "function") {
    throw new Error("Unable to load PDF export library");
  }

  return jsPDF;
}

function getAutoTableInvoker(doc) {
  const autoTableBridge = window.jspdfAutoTable;

  if (typeof doc.autoTable === "function") {
    return (options) => doc.autoTable(options);
  }

  if (typeof autoTableBridge === "function") {
    return (options) => autoTableBridge(doc, options);
  }

  if (typeof autoTableBridge?.default === "function") {
    return (options) => autoTableBridge.default(doc, options);
  }

  if (typeof autoTableBridge?.autoTable === "function") {
    return (options) => autoTableBridge.autoTable(doc, options);
  }

  return null;
}

function renderFallbackPdfTable(doc, { startY = 168, headers = [], rows = [] } = {}) {
  let currentY = startY;

  if (headers.length) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(headers.map((value) => String(value)).join(" | "), 40, currentY);
    currentY += 14;
  }

  doc.setTextColor(15, 23, 42);
  rows.forEach((row) => {
    const line = (Array.isArray(row) ? row : [row]).map((value) => String(value ?? "-")).join(" | ");
    const wrappedLine = typeof doc.splitTextToSize === "function" ? doc.splitTextToSize(line, 515) : [line];
    const lineHeight = wrappedLine.length * 11 + 4;

    if (currentY + lineHeight > 780) {
      doc.addPage();
      currentY = 40;
    }

    doc.text(wrappedLine, 40, currentY);
    currentY += lineHeight;
  });

  return currentY;
}

async function ensureQRCodeLoaded() {
  try {
    return await loadExternalScript(EXTERNAL_SCRIPT_URLS.qrcode, "QRCode");
  } catch (error) {
    return null;
  }
}

async function generateInvoiceQrDataUrl(invoiceLink) {
  const normalizedLink = String(invoiceLink || "").trim();
  if (!normalizedLink) {
    return "";
  }

  const QRCode = await ensureQRCodeLoaded();
  if (!QRCode) {
    return "";
  }

  const renderHost = document.createElement("div");
  renderHost.style.position = "fixed";
  renderHost.style.left = "-10000px";
  renderHost.style.top = "-10000px";
  renderHost.style.width = "1px";
  renderHost.style.height = "1px";
  document.body.appendChild(renderHost);

  try {
    new QRCode(renderHost, {
      text: normalizedLink,
      width: 120,
      height: 120,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 40);
    });

    const imageElement = renderHost.querySelector("img");
    if (imageElement?.src) {
      return imageElement.src;
    }

    const canvasElement = renderHost.querySelector("canvas");
    if (canvasElement && typeof canvasElement.toDataURL === "function") {
      return canvasElement.toDataURL("image/png");
    }

    return "";
  } finally {
    renderHost.remove();
  }
}

async function downloadInvoicePdf(invoiceRecord) {
  const jsPDF = await ensurePdfLibrary();
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const createdAt = new Date(invoiceRecord.createdAt || Date.now());
  const rows = invoiceRecord.items.map((item) => [
    String(item.name || "-"),
    String(item.quantity ?? 0),
    formatCurrency(item.unitPrice || 0),
    formatCurrency(item.lineTotal || 0),
  ]);

  const qrDataUrl = await generateInvoiceQrDataUrl(invoiceRecord.invoiceLink);

  doc.setFillColor(240, 253, 250);
  doc.roundedRect(32, 24, 531, 110, 10, 10, "F");

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.text(String(invoiceRecord.shop?.name || "CounterCraft POS"), 42, 48);

  doc.setFontSize(10);
  let shopLineY = 64;
  [
    invoiceRecord.shop?.address,
    invoiceRecord.shop?.phone ? `Phone: ${invoiceRecord.shop.phone}` : "",
    invoiceRecord.shop?.gstin ? `GSTIN: ${invoiceRecord.shop.gstin}` : "",
  ]
    .filter(Boolean)
    .forEach((line) => {
      doc.text(String(line), 42, shopLineY);
      shopLineY += 13;
    });

  doc.setFontSize(11);
  doc.text(`Invoice No: ${invoiceRecord.billNumber || invoiceRecord.invoiceId || "-"}`, 558, 44, {
    align: "right",
  });
  doc.text(`Date: ${createdAt.toLocaleString()}`, 558, 58, { align: "right" });
  doc.text(`Cashier: ${invoiceRecord.cashier || "Default Cashier"}`, 558, 72, { align: "right" });
  doc.text(`Payment: ${String(invoiceRecord.paymentMethod || "cash").toUpperCase()}`, 558, 86, {
    align: "right",
  });

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", 448, 88, 92, 92);
    doc.setFontSize(8);
    doc.text("Scan for invoice link", 494, 188, { align: "center" });
  }

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Invoice Link: ${invoiceRecord.invoiceLink || "N/A"}`, 40, 154);
  doc.setTextColor(15, 23, 42);

  const autoTableInvoker = getAutoTableInvoker(doc);
  let footerY = 322;

  if (autoTableInvoker) {
    autoTableInvoker({
      startY: 168,
      head: [["Item", "Qty", "Price", "Total"]],
      body: rows,
      theme: "striped",
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
      },
      margin: {
        left: 40,
        right: 40,
      },
    });

    footerY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 22 : 322;
  } else {
    footerY =
      renderFallbackPdfTable(doc, {
        startY: 168,
        headers: ["Item", "Qty", "Price", "Total"],
        rows,
      }) + 18;
  }
  const footerRows = [
    ["Subtotal", formatCurrency(invoiceRecord.subtotal || 0)],
    ["Tax", formatCurrency(invoiceRecord.tax || 0)],
    ["Discount", formatCurrency(invoiceRecord.discount || 0)],
    ["Total", formatCurrency(invoiceRecord.total || 0)],
    ["Paid Amount", formatCurrency(invoiceRecord.paidAmount || 0)],
    ["Change Due", formatCurrency(invoiceRecord.changeDue || 0)],
  ];

  doc.setFontSize(11);
  footerRows.forEach(([label, value]) => {
    doc.text(String(label), 40, footerY);
    doc.text(String(value), 320, footerY, { align: "right" });
    footerY += 16;
  });

  const safeBillNo = String(invoiceRecord.billNumber || invoiceRecord.invoiceId || "bill").replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );
  doc.save(`invoice_${safeBillNo}.pdf`);
}

async function handlePdfDownloadClick() {
  if (!activeInvoice || !elements.downloadPdf) {
    return;
  }

  const button = elements.downloadPdf;
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Generating PDF...";

  try {
    await downloadInvoicePdf(activeInvoice);
    const updatedInvoice = saveInvoiceRecord({
      ...activeInvoice,
      pdfGeneratedAt: new Date().toISOString(),
    });

    if (updatedInvoice) {
      setInvoice(updatedInvoice);
    }

    setStatus("Invoice PDF downloaded.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to download invoice PDF.", "error");
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

function handleWhatsappClick(event) {
  event.preventDefault();

  if (!activeInvoice) {
    setStatus("Invoice was not found. Please request a new bill link.", "error");
    return;
  }

  const rawPhone = String(elements.customerPhoneInput?.value || "").trim();
  const normalizedPhone = normalizeCustomerPhone(rawPhone);
  const resolvedPhone = resolveWhatsappPhoneNumber(rawPhone);

  if (!resolvedPhone) {
    setStatus("Enter a valid WhatsApp phone number.", "error");
    elements.customerPhoneInput?.focus();
    return;
  }

  if (elements.customerPhoneInput) {
    elements.customerPhoneInput.value = normalizedPhone;
  }

  rememberCustomerPhone(normalizedPhone);

  const shareId = String(activeInvoice.shareId || "").trim();
  const invoiceLink = String(activeInvoice.invoiceLink || "").trim() || buildInvoicePublicLink(shareId);
  if (!invoiceLink) {
    setStatus("Secure invoice link is unavailable. Request a new bill link.", "error");
    return;
  }

  let updatedInvoice = saveInvoiceRecord({
    ...activeInvoice,
    customerPhone: normalizedPhone,
    invoiceLink,
  });

  if (!updatedInvoice) {
    updatedInvoice = {
      ...activeInvoice,
      customerPhone: normalizedPhone,
      invoiceLink,
    };
  }

  const message = buildBillWhatsappMessage(updatedInvoice);
  const whatsappUrl = `https://wa.me/${resolvedPhone}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");

  const sentInvoice = markInvoiceWhatsappSent(updatedInvoice.invoiceId, {
    customerPhone: normalizedPhone,
  });

  setInvoice(sentInvoice || updatedInvoice);
  setStatus("Opening WhatsApp with your invoice message.", "success");
}

async function bootstrap() {
  const hydratedState = await hydrateInvoiceRecord();
  setInvoice(hydratedState.invoiceRecord, {
    missingMessage: hydratedState.missingMessage,
  });

  elements.downloadPdf?.addEventListener("click", handlePdfDownloadClick);
  elements.whatsappAction?.addEventListener("click", handleWhatsappClick);
}

void bootstrap();
