const KEYS = {
  products: "pos_cached_products_v1",
  pendingSales: "pos_pending_sales_v1",
  lastSync: "pos_last_sync_v1",
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

