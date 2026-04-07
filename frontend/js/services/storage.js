const KEYS = {
  products: "pos_cached_products_v1",
  pendingSales: "pos_pending_sales_v1",
  lastSync: "pos_last_sync_v1",
  invoices: "pos_invoices_v1",
  customerPhones: "pos_customer_phones_v1",
  lastCustomerPhone: "pos_last_customer_phone_v1",
};

function readJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCachedProducts() {
  return readJson(KEYS.products, []);
}

export function setCachedProducts(products) {
  writeJson(KEYS.products, products);
}

export function getPendingSales() {
  return readJson(KEYS.pendingSales, []);
}

export function queuePendingSale(payload) {
  const pendingSales = getPendingSales();
  const pendingSale = {
    id: `OFF-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    payload,
    createdAt: new Date().toISOString(),
  };
  pendingSales.push(pendingSale);
  writeJson(KEYS.pendingSales, pendingSales);
  return pendingSale;
}

export function removePendingSale(id) {
  const pendingSales = getPendingSales().filter((item) => item.id !== id);
  writeJson(KEYS.pendingSales, pendingSales);
}

export function setLastSyncTimestamp(timestamp = new Date().toISOString()) {
  localStorage.setItem(KEYS.lastSync, timestamp);
}

export function getLastSyncTimestamp() {
  return localStorage.getItem(KEYS.lastSync);
}

export function getInvoiceRecords() {
  return readJson(KEYS.invoices, []);
}

export function getInvoiceRecordById(invoiceId) {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    return null;
  }

  const invoices = getInvoiceRecords();
  return invoices.find((entry) => String(entry?.invoiceId || "") === normalizedInvoiceId) || null;
}

export function saveInvoiceRecord(record = {}) {
  const normalizedInvoiceId = String(record.invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    return null;
  }

  const invoices = getInvoiceRecords();
  const nowIso = new Date().toISOString();
  const existingIndex = invoices.findIndex((entry) => String(entry?.invoiceId || "") === normalizedInvoiceId);
  const existingRecord = existingIndex >= 0 ? invoices[existingIndex] : null;

  const normalizedRecord = {
    ...existingRecord,
    ...record,
    invoiceId: normalizedInvoiceId,
    updatedAt: nowIso,
    createdAt: String(record.createdAt || existingRecord?.createdAt || nowIso),
  };

  if (existingIndex >= 0) {
    invoices[existingIndex] = normalizedRecord;
  } else {
    invoices.unshift(normalizedRecord);
  }

  writeJson(KEYS.invoices, invoices.slice(0, 300));
  return normalizedRecord;
}

export function markInvoiceWhatsappSent(invoiceId, payload = {}) {
  const existingInvoice = getInvoiceRecordById(invoiceId);
  if (!existingInvoice) {
    return null;
  }

  return saveInvoiceRecord({
    ...existingInvoice,
    sentViaWhatsapp: true,
    sentAt: String(payload.sentAt || new Date().toISOString()),
    customerPhone: String(payload.customerPhone || existingInvoice.customerPhone || "").trim(),
  });
}

export function getSavedCustomerPhones() {
  const phones = readJson(KEYS.customerPhones, []);
  if (!Array.isArray(phones)) {
    return [];
  }

  return phones
    .map((phone) => String(phone || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function getLastCustomerPhone() {
  return String(localStorage.getItem(KEYS.lastCustomerPhone) || "").trim();
}

export function rememberCustomerPhone(phoneNumber) {
  const normalizedPhone = String(phoneNumber || "").trim();
  if (!normalizedPhone) {
    return;
  }

  localStorage.setItem(KEYS.lastCustomerPhone, normalizedPhone);

  const existingPhones = getSavedCustomerPhones();
  const mergedPhones = [normalizedPhone, ...existingPhones.filter((phone) => phone !== normalizedPhone)];
  writeJson(KEYS.customerPhones, mergedPhones.slice(0, 20));
}
