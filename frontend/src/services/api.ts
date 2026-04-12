// API Configuration - reads from window.__APP_CONFIG__ set by app.config.js
function normalizeBaseUrl(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\/$/, "");
}

function getApiBaseUrl(): string {
  const runtimeConfigBase = normalizeBaseUrl((window as any).__APP_CONFIG__?.API_BASE_URL);
  const localOverrideBase = normalizeBaseUrl(localStorage.getItem("pos_api_base"));
  const sameOriginBase = normalizeBaseUrl(`${window.location.origin}/api`);
  return runtimeConfigBase || localOverrideBase || sameOriginBase;
}

export function getAppConfig() {
  return (window as any).__APP_CONFIG__ || {};
}

function buildUrl(path: string, query?: Record<string, any>): string {
  // If getApiBaseUrl() returns a relative URL like "/api", new URL() needs a base origin
  const baseUrl = getApiBaseUrl().startsWith("http") ? getApiBaseUrl() : `${window.location.origin}${getApiBaseUrl()}`;
  const url = new URL(`${baseUrl}${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

export interface ApiError extends Error {
  status?: number;
  details?: any;
  isNetworkError?: boolean;
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; query?: Record<string, any> } = {}
): Promise<T> {
  const { method = "GET", body, query } = options;
  const endpoint = buildUrl(path, query);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch (error) {
    const networkError = new Error("Unable to reach server. Working in offline mode.") as ApiError;
    networkError.isNetworkError = true;
    throw networkError;
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.success === false) {
    if (
      response.status === 401 &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/bootstrap-admin") &&
      !path.startsWith("/auth/register")
    ) {
      window.dispatchEvent(new CustomEvent("pos:unauthorized"));
    }

    const apiError = new Error(payload.message || `Request failed with status ${response.status}`) as ApiError;
    apiError.status = response.status;
    apiError.details = payload.details;
    throw apiError;
  }

  return payload;
}

// ── Auth ─────────────────────────────────────────────────
export const api = {
  bootstrapAdmin: (body: any) => request("/auth/bootstrap-admin", { method: "POST", body }),
  register: (body: any) => request("/auth/register", { method: "POST", body }),
  login: (body: any) => request("/auth/login", { method: "POST", body }),
  logout: () => request("/auth/logout", { method: "POST" }),
  getCurrentUser: () => request("/auth/me"),
  getUsers: () => request("/auth/users"),
  createUser: (body: any) => request("/auth/users", { method: "POST", body }),
  changePassword: (body: any) => request("/auth/change-password", { method: "PATCH", body }),
  resetUserPassword: (id: string, body: any) =>
    request(`/auth/users/${encodeURIComponent(id)}/password`, { method: "PATCH", body }),
  updateUserStatus: (id: string, body: any) =>
    request(`/auth/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body }),

  // ── Products ────────────────────────────────────────────
  getProducts: (query?: Record<string, any>) => request("/products", { query }),
  getProductByBarcode: (barcode: string) => request(`/products/barcode/${encodeURIComponent(barcode)}`),
  addProduct: (body: any) => request("/products", { method: "POST", body }),
  updateProduct: (id: string, body: any) => request(`/products/${id}`, { method: "PUT", body }),
  deleteProduct: (id: string) => request(`/products/${id}`, { method: "DELETE" }),
  updateStock: (id: string, body: any) => request(`/products/${id}/stock`, { method: "PATCH", body }),

  // ── Billing ─────────────────────────────────────────────
  processBilling: (body: any) => request("/billing/process", { method: "POST", body }),
  getInvoiceShareLink: (invoiceId: string) =>
    request(`/billing/invoices/${encodeURIComponent(invoiceId)}/share-link`),

  // ── Public Invoice ──────────────────────────────────────
  getPublicInvoiceByShareId: (shareId: string) =>
    request(`/public/invoice/${encodeURIComponent(shareId)}`),

  // ── UPI Payments ────────────────────────────────────────
  createUpiSession: (body: any) => request("/payments/upi/session", { method: "POST", body }),
  getUpiSessionStatus: (sessionId: string) =>
    request(`/payments/upi/session/${encodeURIComponent(sessionId)}/status`),
  completeUpiSession: (sessionId: string, body: any) =>
    request(`/payments/upi/session/${encodeURIComponent(sessionId)}/complete`, { method: "POST", body }),

  // ── Sales ───────────────────────────────────────────────
  getSalesHistory: (query?: Record<string, any>) => request("/sales", { query }),
  getSalesSummary: (query?: Record<string, any>) => request("/sales/summary", { query }),

  // ── Reports ─────────────────────────────────────────────
  getSalesReport: (query?: Record<string, any>) => request("/reports/sales", { query }),
  getTransactionsReport: (query?: Record<string, any>) => request("/reports/transactions", { query }),

  // ── Inventory ───────────────────────────────────────────
  getLowStockProducts: (query?: Record<string, any>) => request("/inventory/low-stock", { query }),
  getInventoryOverview: (query?: Record<string, any>) => request("/inventory/overview", { query }),
  getInventoryLogs: (query?: Record<string, any>) => request("/inventory/logs", { query }),

  // ── Payment Settings ────────────────────────────────────
  getPaymentSettings: () => request("/payment/settings"),
  savePaymentSettings: (body: any) => request("/payment/settings", { method: "POST", body }),
};
