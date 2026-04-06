const KEYS = {
  products: "pos_cached_products_v1",
  pendingSales: "pos_pending_sales_v1",
  lastSync: "pos_last_sync_v1",
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
