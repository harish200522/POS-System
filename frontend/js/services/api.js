import { API_BASE_URL } from "../config.js";

let accessToken = localStorage.getItem("pos_access_token") || "";

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
  const headers = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers,
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
    if (
      response.status === 401 &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/bootstrap-admin")
    ) {
      setAccessToken("");
      window.dispatchEvent(new CustomEvent("pos:unauthorized"));
    }

    const apiError = new Error(payload.message || `Request failed with status ${response.status}`);
    apiError.status = response.status;
    apiError.details = payload.details;
    throw apiError;
  }

  return payload;
}

export function setAccessToken(token) {
  accessToken = String(token || "").trim();

  if (accessToken) {
    localStorage.setItem("pos_access_token", accessToken);
  } else {
    localStorage.removeItem("pos_access_token");
  }
}

export function getAccessToken() {
  return accessToken;
}

export const api = {
  bootstrapAdmin: (body) => request("/auth/bootstrap-admin", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  getCurrentUser: () => request("/auth/me"),
  getUsers: () => request("/auth/users"),
  createUser: (body) => request("/auth/users", { method: "POST", body }),
  changePassword: (body) => request("/auth/change-password", { method: "PATCH", body }),
  resetUserPassword: (id, body) => request(`/auth/users/${encodeURIComponent(id)}/password`, {
    method: "PATCH",
    body,
  }),
  updateUserStatus: (id, body) => request(`/auth/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body,
  }),
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
