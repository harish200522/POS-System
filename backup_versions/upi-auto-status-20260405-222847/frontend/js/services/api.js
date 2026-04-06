import { API_BASE_URL } from "../config.js";

function buildUrl(path, query) {
  const url = new URL(`${API_BASE_URL}${path}`);

  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }

  return url.toString();
}

async function request(path, { method = "GET", body, query } = {}) {
  const endpoint = buildUrl(path, query);

  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const networkError = new Error("Unable to reach server. Working in offline mode.");
    networkError.isNetworkError = true;
    throw networkError;
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok || payload.success === false) {
    const apiError = new Error(payload.message || `Request failed with status ${response.status}`);
    apiError.status = response.status;
    apiError.details = payload.details;
    throw apiError;
  }

  return payload;
}

export const api = {
  getProducts: (query) => request("/products", { query }),
  getProductByBarcode: (barcode) => request(`/products/barcode/${encodeURIComponent(barcode)}`),
  addProduct: (body) => request("/products", { method: "POST", body }),
  updateProduct: (id, body) => request(`/products/${id}`, { method: "PUT", body }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
  updateStock: (id, body) => request(`/products/${id}/stock`, { method: "PATCH", body }),
  processBilling: (body) => request("/billing/process", { method: "POST", body }),
  createUpiSession: (body) => request("/payments/upi/session", { method: "POST", body }),
  getUpiSessionStatus: (sessionId) =>
    request(`/payments/upi/session/${encodeURIComponent(sessionId)}/status`),
  completeUpiSession: (sessionId, body) =>
    request(`/payments/upi/session/${encodeURIComponent(sessionId)}/complete`, {
      method: "POST",
      body,
    }),
  getSalesHistory: (query) => request("/sales", { query }),
  getSalesSummary: (query) => request("/sales/summary", { query }),
  getLowStockProducts: (query) => request("/inventory/low-stock", { query }),
  getInventoryOverview: (query) => request("/inventory/overview", { query }),
  getInventoryLogs: (query) => request("/inventory/logs", { query }),
};
