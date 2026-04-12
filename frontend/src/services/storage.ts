const KEYS = {
  products: "pos_cached_products_v1",
  pendingSales: "pos_pending_sales_v1",
  lastSync: "pos_last_sync_v1",
  invoices: "pos_invoices_v1",
  customerPhones: "pos_customer_phones_v1",
  lastCustomerPhone: "pos_last_customer_phone_v1",
};

function readJson<T>(key: string, fallbackValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw) as T;
  } catch {
    return fallbackValue;
  }
}

function writeJson(key: string, value: any): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCachedProducts(): any[] {
  return readJson(KEYS.products, []);
}

export function setCachedProducts(products: any[]): void {
  writeJson(KEYS.products, products);
}

export function getPendingSales(): any[] {
  return readJson(KEYS.pendingSales, []);
}

export function queuePendingSale(payload: any) {
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

export function removePendingSale(id: string): void {
  const pendingSales = getPendingSales().filter((item) => item.id !== id);
  writeJson(KEYS.pendingSales, pendingSales);
}

export function setLastSyncTimestamp(timestamp = new Date().toISOString()): void {
  localStorage.setItem(KEYS.lastSync, timestamp);
}

export function getLastSyncTimestamp(): string | null {
  return localStorage.getItem(KEYS.lastSync);
}

export function getInvoiceRecords(): any[] {
  return readJson(KEYS.invoices, []);
}

export function getInvoiceRecordById(invoiceId: string): any | null {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) return null;
  const invoices = getInvoiceRecords();
  return invoices.find((entry: any) => String(entry?.invoiceId || "") === normalizedInvoiceId) || null;
}

export function saveInvoiceRecord(record: any = {}): any | null {
  const normalizedInvoiceId = String(record.invoiceId || "").trim();
  if (!normalizedInvoiceId) return null;

  const invoices = getInvoiceRecords();
  const nowIso = new Date().toISOString();
  const existingIndex = invoices.findIndex(
    (entry: any) => String(entry?.invoiceId || "") === normalizedInvoiceId
  );
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
