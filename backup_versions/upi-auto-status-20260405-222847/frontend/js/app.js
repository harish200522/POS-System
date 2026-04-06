import { API_BASE_URL } from "./config.js";
import { api } from "./services/api.js";
import {
  getCachedProducts,
  getLastSyncTimestamp,
  getPendingSales,
  queuePendingSale,
  removePendingSale,
  setCachedProducts,
  setLastSyncTimestamp,
} from "./services/storage.js";

const state = {
  products: [],
  cart: [],
  activeTab: "pos",
  paymentMethod: "cash",
  dashboardRange: "daily",
  selectedProductId: null,
  scannerRunning: false,
  salesHistory: [],
  upiModalOpen: false,
  upiExpiresAt: 0,
  upiCountdownIntervalId: null,
  upiStatusPollIntervalId: null,
  upiAutoCompleting: false,
  pendingUpiCheckout: null,
};

const elements = {
  apiBaseText: document.getElementById("api-base"),
  syncInfo: document.getElementById("sync-info"),
  networkBadge: document.getElementById("network-badge"),
  pendingBadge: document.getElementById("pending-badge"),
  tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),

  searchInput: document.getElementById("search-input"),
  productResults: document.getElementById("product-results"),
  scanButton: document.getElementById("scan-button"),
  manualBarcodeButton: document.getElementById("manual-barcode-button"),

  cartList: document.getElementById("cart-list"),
  subtotalValue: document.getElementById("subtotal-value"),
  totalValue: document.getElementById("total-value"),
  taxInput: document.getElementById("tax-input"),
  discountInput: document.getElementById("discount-input"),
  paidAmountInput: document.getElementById("paid-amount-input"),
  cashierInput: document.getElementById("cashier-input"),
  paymentButtons: Array.from(document.querySelectorAll("[data-payment-method]")),
  checkoutButton: document.getElementById("checkout-button"),
  clearCartButton: document.getElementById("clear-cart-button"),

  lowStockAlert: document.getElementById("low-stock-alert"),

  productForm: document.getElementById("product-form"),
  productFormTitle: document.getElementById("product-form-title"),
  productFormSubmit: document.getElementById("product-form-submit"),
  productFormCancel: document.getElementById("product-form-cancel"),
  productTableBody: document.getElementById("product-table-body"),

  dashboardRangeButtons: Array.from(document.querySelectorAll("[data-range]")),
  metricRevenue: document.getElementById("metric-revenue"),
  metricTransactions: document.getElementById("metric-transactions"),
  metricAvgBill: document.getElementById("metric-avg-bill"),
  metricLowStock: document.getElementById("metric-low-stock"),
  metricInventoryValue: document.getElementById("metric-inventory-value"),
  paymentBreakdown: document.getElementById("payment-breakdown"),
  trendChart: document.getElementById("trend-chart"),
  topProducts: document.getElementById("top-products"),

  historyTableBody: document.getElementById("history-table-body"),

  scannerModal: document.getElementById("scanner-modal"),
  scannerViewport: document.getElementById("scanner-viewport"),
  scannerCloseButton: document.getElementById("scanner-close"),

  upiModal: document.getElementById("upi-modal"),
  upiAmountValue: document.getElementById("upi-amount-value"),
  upiShopName: document.getElementById("upi-shop-name"),
  upiIdValue: document.getElementById("upi-id-value"),
  upiQrRoot: document.getElementById("upi-qr-root"),
  upiPaymentStatus: document.getElementById("upi-payment-status"),
  upiCountdown: document.getElementById("upi-countdown"),
  upiOpenAppLink: document.getElementById("upi-open-app-link"),
  upiDoneButton: document.getElementById("upi-done-button"),
  upiCancelButton: document.getElementById("upi-cancel-button"),

  billModal: document.getElementById("bill-modal"),
  billContent: document.getElementById("bill-content"),
  billClose: document.getElementById("bill-close"),
  billPrint: document.getElementById("bill-print"),

  toastRoot: document.getElementById("toast-root"),
};

let scannerDetectedHandler = null;
let scannerNoResultTimeoutId = null;
let upiModalHideTimeoutId = null;
let upiQrCodeInstance = null;
const SCANNER_AUTO_FALLBACK_MS = 12000;
const UPI_CONFIG = {
  upiId: "hri41468@oksbi",
  shopName: "CounterCraft POS",
  currency: "INR",
  sessionTimeoutMs: 2 * 60 * 1000,
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function asNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function formatCountdown(seconds) {
  const normalizedSeconds = Math.max(Number(seconds) || 0, 0);
  const minutes = Math.floor(normalizedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (normalizedSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function clearUpiCountdownTimer() {
  if (state.upiCountdownIntervalId) {
    window.clearInterval(state.upiCountdownIntervalId);
    state.upiCountdownIntervalId = null;
  }
}

function setUpiPaymentStatus(message, status = "waiting") {
  elements.upiPaymentStatus.textContent = message;
  elements.upiPaymentStatus.classList.remove(
    "upi-status-waiting",
    "upi-status-success",
    "upi-status-error"
  );
  elements.upiPaymentStatus.classList.add(`upi-status-${status}`);
}

function buildCheckoutContext(paymentMethod = state.paymentMethod) {
  const subtotal = getCartSubtotal();
  const tax = Math.max(asNumber(elements.taxInput.value), 0);
  const discount = Math.max(asNumber(elements.discountInput.value), 0);
  const total = Math.max(subtotal + tax - discount, 0);
  const cashier = elements.cashierInput.value.trim() || "Default Cashier";

  let paidAmount = Math.max(asNumber(elements.paidAmountInput.value), 0);
  if (paymentMethod !== "cash") {
    paidAmount = total;
  }

  return {
    subtotal,
    tax,
    discount,
    total,
    paidAmount,
    cashier,
    paymentMethod,
  };
}

function buildCheckoutPayload(checkoutContext) {
  return {
    items: state.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      barcode: item.barcode,
    })),
    paymentMethod: checkoutContext.paymentMethod,
    tax: checkoutContext.tax,
    discount: checkoutContext.discount,
    paidAmount: checkoutContext.paidAmount,
    cashier: checkoutContext.cashier,
  };
}

function buildUpiPaymentLink(amount) {
  const params = new URLSearchParams({
    pa: UPI_CONFIG.upiId,
    pn: UPI_CONFIG.shopName,
    am: Number(amount || 0).toFixed(2),
    cu: UPI_CONFIG.currency,
  });

  return `upi://pay?${params.toString()}`;
}

function clearUpiStatusPollTimer() {
  if (state.upiStatusPollIntervalId) {
    window.clearInterval(state.upiStatusPollIntervalId);
    state.upiStatusPollIntervalId = null;
  }
}

function renderUpiQrCode(upiPaymentLink) {
  elements.upiQrRoot.innerHTML = "";

  if (!window.QRCode) {
    elements.upiQrRoot.innerHTML =
      '<p class="text-xs text-slate-500 text-center">QR generator unavailable. Use Open UPI App.</p>';
    return;
  }

  upiQrCodeInstance = new window.QRCode(elements.upiQrRoot, {
    text: upiPaymentLink,
    width: 220,
    height: 220,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.M,
  });
}

function refreshUpiModalContentFromSession(sessionData) {
  const fallbackLink = buildUpiPaymentLink(sessionData.amount || 0);
  elements.upiAmountValue.textContent = formatCurrency(sessionData.amount || 0);
  elements.upiShopName.textContent = sessionData.shopName || UPI_CONFIG.shopName;
  elements.upiIdValue.textContent = sessionData.upiId || UPI_CONFIG.upiId;
  elements.upiOpenAppLink.href = sessionData.upiLink || fallbackLink;
  renderUpiQrCode(sessionData.qrValue || sessionData.paymentUrl || sessionData.upiLink || fallbackLink);
}

function closeUpiModal({ resetCheckout = true } = {}) {
  clearUpiCountdownTimer();
  clearUpiStatusPollTimer();
  state.upiExpiresAt = 0;
  state.upiAutoCompleting = false;
  state.upiModalOpen = false;

  elements.upiModal.classList.remove("modal-upi-visible");

  if (upiModalHideTimeoutId) {
    window.clearTimeout(upiModalHideTimeoutId);
  }

  upiModalHideTimeoutId = window.setTimeout(() => {
    elements.upiModal.classList.add("hidden");
  }, 200);

  if (resetCheckout) {
    state.pendingUpiCheckout = null;
  }
}

function startUpiCountdown(expiresAtMillis) {
  state.upiExpiresAt = expiresAtMillis;

  const updateCountdown = () => {
    const remainingSeconds = Math.max(Math.ceil((state.upiExpiresAt - Date.now()) / 1000), 0);
    elements.upiCountdown.textContent = `Session expires in ${formatCountdown(remainingSeconds)}`;

    if (remainingSeconds <= 0) {
      cancelUpiPayment("UPI payment timed out. You can retry.");
    }
  };

  clearUpiCountdownTimer();
  updateCountdown();
  state.upiCountdownIntervalId = window.setInterval(updateCountdown, 1000);
}

function setUpiActionButtonsState({ disabled, label } = {}) {
  if (disabled !== undefined) {
    elements.upiDoneButton.disabled = disabled;
  }

  if (label) {
    elements.upiDoneButton.textContent = label;
  }
}

async function completeUpiPayment(completionSource = "manual_confirm") {
  if (!state.pendingUpiCheckout) {
    showToast("UPI session expired. Please retry.", "warning");
    closeUpiModal();
    return { success: false };
  }

  const pendingCheckout = state.pendingUpiCheckout;

  if (!pendingCheckout.sessionId) {
    closeUpiModal({ resetCheckout: false });
    const result = await completeCheckout(pendingCheckout.context, pendingCheckout.payload, {
      successMessage: "UPI payment successful",
      offlineMessage: "UPI transaction saved offline. It will sync when online.",
    });

    if (result.success) {
      state.pendingUpiCheckout = null;
      return result;
    }

    openUpiModal(pendingCheckout.context);
    setUpiPaymentStatus("Payment failed. Retry or cancel.", "error");
    setUpiActionButtonsState({ disabled: false, label: "Payment Done" });
    return result;
  }

  if (state.upiAutoCompleting) {
    return { success: false, message: "UPI completion already in progress" };
  }

  state.upiAutoCompleting = true;
  setUpiActionButtonsState({ disabled: true, label: "Processing..." });
  setUpiPaymentStatus("Confirming payment...", "waiting");

  try {
    const completionResponse = await api.completeUpiSession(pendingCheckout.sessionId, {
      completionSource,
    });

    const sale = completionResponse.data?.sale;
    if (!sale) {
      throw new Error("Unable to finalize UPI sale");
    }

    closeUpiModal();
    showToast("UPI payment successful", "success");
    openBillModal(sale, false);
    clearCart();
    await loadProducts();
    await loadSalesHistory();
    await loadDashboard();
    await loadLowStockAlert();
    updatePendingBadge();

    return { success: true };
  } catch (error) {
    if (error.status === 400) {
      setUpiPaymentStatus("Waiting for payment confirmation...", "waiting");
      showToast("Payment not confirmed yet. Please wait.", "warning");
    } else {
      setUpiPaymentStatus("Payment verification failed. Retry.", "error");
      showToast(error.message || "Unable to verify UPI payment", "error");
    }

    return { success: false, error };
  } finally {
    state.upiAutoCompleting = false;
    if (state.upiModalOpen) {
      setUpiActionButtonsState({ disabled: false, label: "Payment Done" });
    }
  }
}

function startUpiStatusPolling() {
  clearUpiStatusPollTimer();

  if (!state.pendingUpiCheckout?.sessionId) {
    return;
  }

  const pollIntervalMs = Math.max(Number(state.pendingUpiCheckout.pollEveryMs) || 3000, 1500);

  const pollStatus = async () => {
    if (!state.upiModalOpen || !state.pendingUpiCheckout?.sessionId) {
      clearUpiStatusPollTimer();
      return;
    }

    try {
      const statusResponse = await api.getUpiSessionStatus(state.pendingUpiCheckout.sessionId);
      const session = statusResponse.data;

      state.pendingUpiCheckout.sessionSnapshot = session;
      refreshUpiModalContentFromSession(session);

      if (session.expiresAt) {
        const expiresAtMs = new Date(session.expiresAt).getTime();
        if (Math.abs(expiresAtMs - state.upiExpiresAt) > 1000) {
          startUpiCountdown(expiresAtMs);
        }
      }

      if (session.status === "paid") {
        setUpiPaymentStatus("Payment successful. Finalizing bill...", "success");
        await completeUpiPayment("auto_poll");
        return;
      }

      if (session.status === "completed") {
        setUpiPaymentStatus("Payment completed", "success");
        return;
      }

      if (session.status === "cancelled") {
        setUpiPaymentStatus("Payment cancelled", "error");
        clearUpiStatusPollTimer();
        return;
      }

      if (session.status === "expired") {
        setUpiPaymentStatus("Payment session expired", "error");
        clearUpiStatusPollTimer();
        return;
      }

      if (session.status === "failed") {
        setUpiPaymentStatus("Payment failed. Retry with a new QR.", "error");
        clearUpiStatusPollTimer();
        return;
      }

      setUpiPaymentStatus("Waiting for payment...", "waiting");
    } catch (error) {
      setUpiPaymentStatus("Unable to fetch status. Waiting...", "waiting");
    }
  };

  void pollStatus();
  state.upiStatusPollIntervalId = window.setInterval(() => {
    void pollStatus();
  }, pollIntervalMs);
}

async function openUpiModal(checkoutContext = buildCheckoutContext("upi")) {
  if (!state.cart.length) {
    showToast("Add products to cart before UPI payment", "warning");
    return;
  }

  if (checkoutContext.total <= 0) {
    showToast("Total amount must be greater than zero", "warning");
    return;
  }

  if (upiModalHideTimeoutId) {
    window.clearTimeout(upiModalHideTimeoutId);
    upiModalHideTimeoutId = null;
  }

  const normalizedContext = {
    ...checkoutContext,
    paymentMethod: "upi",
    paidAmount: checkoutContext.total,
  };

  const payload = buildCheckoutPayload(normalizedContext);
  const fallbackSessionData = {
    amount: normalizedContext.total,
    upiId: UPI_CONFIG.upiId,
    shopName: UPI_CONFIG.shopName,
    upiLink: buildUpiPaymentLink(normalizedContext.total),
    qrValue: buildUpiPaymentLink(normalizedContext.total),
    pollEveryMs: 3000,
    expiresAt: new Date(Date.now() + UPI_CONFIG.sessionTimeoutMs).toISOString(),
  };

  state.pendingUpiCheckout = {
    context: normalizedContext,
    payload,
    sessionId: null,
    pollEveryMs: 3000,
    sessionSnapshot: fallbackSessionData,
  };

  refreshUpiModalContentFromSession(fallbackSessionData);
  setUpiPaymentStatus("Waiting for payment...", "waiting");
  setUpiActionButtonsState({ disabled: false, label: "Payment Done" });

  state.upiModalOpen = true;
  startUpiCountdown(Date.now() + UPI_CONFIG.sessionTimeoutMs);

  elements.upiModal.classList.remove("hidden");
  requestAnimationFrame(() => {
    elements.upiModal.classList.add("modal-upi-visible");
  });

  try {
    const sessionResponse = await api.createUpiSession(payload);
    const session = sessionResponse.data;

    if (!state.upiModalOpen) {
      return;
    }

    state.pendingUpiCheckout = {
      ...state.pendingUpiCheckout,
      sessionId: session.sessionId,
      pollEveryMs: session.pollEveryMs || 3000,
      sessionSnapshot: session,
    };

    refreshUpiModalContentFromSession(session);
    if (session.expiresAt) {
      startUpiCountdown(new Date(session.expiresAt).getTime());
    }
    setUpiPaymentStatus("Waiting for payment...", "waiting");
    startUpiStatusPolling();
  } catch (error) {
    setUpiPaymentStatus("Auto payment status unavailable. Confirm manually.", "error");
    showToast(error.message || "UPI gateway unavailable. Use Payment Done after transfer.", "warning");
  }
}

function cancelUpiPayment(message = "UPI payment cancelled. Cart is unchanged.") {
  closeUpiModal();
  showToast(message, "warning");
}

async function completeCheckout(checkoutContext, payload, messages = {}) {
  const successMessage = messages.successMessage || "Billing completed";
  const offlineMessage = messages.offlineMessage || "Saved sale offline. It will sync when online.";

  if (navigator.onLine) {
    try {
      const response = await api.processBilling(payload);
      showToast(successMessage, "success");
      openBillModal(response.data, false);
      clearCart();
      await loadProducts();
      await loadSalesHistory();
      await loadDashboard();
      await loadLowStockAlert();
      updatePendingBadge();
      return { success: true };
    } catch (error) {
      if (!error.isNetworkError) {
        showToast(error.message || "Billing failed", "error");
        return { success: false, error };
      }
    }
  }

  const pendingSale = queuePendingSale(payload);
  applyLocalStockDeduction();
  renderProductResults();
  renderProductTable();

  const offlineBill = {
    billNumber: pendingSale.id,
    items: state.cart.map((item) => ({
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: checkoutContext.subtotal,
    tax: checkoutContext.tax,
    discount: checkoutContext.discount,
    total: checkoutContext.total,
    paymentMethod: checkoutContext.paymentMethod,
    paidAmount: checkoutContext.paidAmount,
    changeDue:
      checkoutContext.paymentMethod === "cash"
        ? Math.max(checkoutContext.paidAmount - checkoutContext.total, 0)
        : 0,
    cashier: checkoutContext.cashier,
    createdAt: new Date().toISOString(),
  };

  showToast(offlineMessage, "warning");
  openBillModal(offlineBill, true);
  clearCart();
  updatePendingBadge();

  return { success: true, offline: true };
}

async function handleUpiPaymentDone() {
  await completeUpiPayment("manual_confirm");
}

function clearScannerNoResultTimer() {
  if (scannerNoResultTimeoutId) {
    window.clearTimeout(scannerNoResultTimeoutId);
    scannerNoResultTimeoutId = null;
  }
}

function startScannerNoResultTimer() {
  clearScannerNoResultTimer();

  scannerNoResultTimeoutId = window.setTimeout(() => {
    if (!state.scannerRunning) {
      return;
    }

    stopScanner();
    showToast("No barcode detected in 12s. Switching to manual entry.", "warning");
    promptManualBarcodeEntry();
  }, SCANNER_AUTO_FALLBACK_MS);
}

function normalizeBarcode(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function getBarcodeCandidates(value) {
  const normalized = normalizeBarcode(value);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const isNumeric = /^\d+$/.test(normalized);

  if (isNumeric && normalized.length === 12) {
    candidates.add(`0${normalized}`);
  }

  if (isNumeric && normalized.length === 13 && normalized.startsWith("0")) {
    candidates.add(normalized.slice(1));
  }

  return Array.from(candidates);
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;
  toast.textContent = message;
  elements.toastRoot.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast-item-show");
  });

  setTimeout(() => {
    toast.classList.remove("toast-item-show");
    setTimeout(() => {
      toast.remove();
    }, 220);
  }, 3200);
}

function updateSyncInfo() {
  const lastSync = getLastSyncTimestamp();
  elements.syncInfo.textContent = lastSync
    ? `Last sync: ${new Date(lastSync).toLocaleString()}`
    : "Last sync: never";
}

function updatePendingBadge() {
  const pendingCount = getPendingSales().length;
  elements.pendingBadge.textContent = `${pendingCount} pending`;
  elements.pendingBadge.classList.toggle("badge-attention", pendingCount > 0);
}

function updateNetworkBadge() {
  if (navigator.onLine) {
    elements.networkBadge.textContent = "Online";
    elements.networkBadge.classList.remove("badge-offline");
    elements.networkBadge.classList.add("badge-online");
  } else {
    elements.networkBadge.textContent = "Offline";
    elements.networkBadge.classList.remove("badge-online");
    elements.networkBadge.classList.add("badge-offline");
  }
}

function setActiveTab(tabName) {
  state.activeTab = tabName;

  elements.tabButtons.forEach((button) => {
    button.classList.toggle("tab-active", button.dataset.tab === tabName);
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabName);
  });
}

function getFilteredProducts() {
  const term = elements.searchInput.value.trim().toLowerCase();

  if (!term) {
    return state.products.slice(0, 30);
  }

  return state.products
    .filter(
      (product) =>
        product.isActive !== false &&
        (product.name.toLowerCase().includes(term) || product.barcode.toLowerCase().includes(term))
    )
    .slice(0, 40);
}

function renderProductResults() {
  const products = getFilteredProducts();

  if (!products.length) {
    elements.productResults.innerHTML =
      '<p class="text-sm text-slate-500 px-3 py-2">No matching products found.</p>';
    return;
  }

  elements.productResults.innerHTML = products
    .map(
      (product) => `
      <article class="product-card">
        <div>
          <h4 class="product-name">${product.name}</h4>
          <p class="product-meta">${product.barcode} • ${product.category || "General"}</p>
        </div>
        <div class="product-actions">
          <span class="product-price">${formatCurrency(product.price)}</span>
          <button
            class="add-product-btn"
            data-product-id="${product._id}"
            ${product.stock <= 0 ? "disabled" : ""}
          >
            ${product.stock <= 0 ? "Out of stock" : `Add (${product.stock})`}
          </button>
        </div>
      </article>
    `
    )
    .join("");
}

function getCartSubtotal() {
  return state.cart.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

function getCartTotal() {
  const subtotal = getCartSubtotal();
  const tax = Math.max(asNumber(elements.taxInput.value), 0);
  const discount = Math.max(asNumber(elements.discountInput.value), 0);
  return Math.max(subtotal + tax - discount, 0);
}

function renderCart() {
  if (!state.cart.length) {
    elements.cartList.innerHTML = '<p class="text-sm text-slate-500 px-3 py-4">Your cart is empty.</p>';
  } else {
    elements.cartList.innerHTML = state.cart
      .map(
        (item) => `
        <div class="cart-row">
          <div>
            <p class="font-semibold text-slate-900">${item.name}</p>
            <p class="text-xs text-slate-500">${item.barcode}</p>
          </div>
          <div class="cart-controls">
            <button class="qty-btn" data-cart-action="decrement" data-product-id="${item.productId}">-</button>
            <span>${item.quantity}</span>
            <button class="qty-btn" data-cart-action="increment" data-product-id="${item.productId}">+</button>
            <button class="remove-btn" data-cart-action="remove" data-product-id="${item.productId}">Remove</button>
          </div>
          <p class="font-semibold">${formatCurrency(item.lineTotal)}</p>
        </div>
      `
      )
      .join("");
  }

  const subtotal = getCartSubtotal();
  const total = getCartTotal();
  elements.subtotalValue.textContent = formatCurrency(subtotal);
  elements.totalValue.textContent = formatCurrency(total);

  if (state.paymentMethod !== "cash") {
    elements.paidAmountInput.value = total.toFixed(2);
  }

  if (state.upiModalOpen && state.pendingUpiCheckout?.context) {
    const activeTotal = Number(state.pendingUpiCheckout.context.total || 0);
    if (Math.abs(activeTotal - total) >= 0.01) {
      cancelUpiPayment("Cart amount changed. Generate a new UPI QR.");
    }
  }
}

function renderProductTable() {
  const products = [...state.products].sort((a, b) => a.name.localeCompare(b.name));

  if (!products.length) {
    elements.productTableBody.innerHTML =
      '<tr><td colspan="7" class="px-4 py-4 text-center text-slate-500">No products available.</td></tr>';
    return;
  }

  elements.productTableBody.innerHTML = products
    .map(
      (product) => `
      <tr>
        <td class="px-3 py-3">${product.name}</td>
        <td class="px-3 py-3">${product.barcode}</td>
        <td class="px-3 py-3">${product.category || "General"}</td>
        <td class="px-3 py-3">${formatCurrency(product.price)}</td>
        <td class="px-3 py-3">
          <span class="stock-pill ${product.stock <= 5 ? "stock-pill-low" : "stock-pill-ok"}">${product.stock}</span>
        </td>
        <td class="px-3 py-3">${product.isActive ? "Active" : "Inactive"}</td>
        <td class="px-3 py-3">
          <div class="admin-actions">
            <button class="table-btn" data-product-action="edit" data-product-id="${product._id}">Edit</button>
            <button class="table-btn" data-product-action="set-stock" data-product-id="${product._id}">Set Stock</button>
            <button class="table-btn" data-product-action="restock" data-product-id="${product._id}">+10</button>
            <button class="table-btn danger" data-product-action="delete" data-product-id="${product._id}">Deactivate</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderHistoryTable() {
  if (!state.salesHistory.length) {
    elements.historyTableBody.innerHTML =
      '<tr><td colspan="6" class="px-4 py-4 text-center text-slate-500">No transactions found.</td></tr>';
    return;
  }

  elements.historyTableBody.innerHTML = state.salesHistory
    .map(
      (sale) => `
      <tr>
        <td class="px-3 py-3">${sale.billNumber}</td>
        <td class="px-3 py-3">${new Date(sale.createdAt).toLocaleString()}</td>
        <td class="px-3 py-3 uppercase">${sale.paymentMethod}</td>
        <td class="px-3 py-3">${sale.items.length}</td>
        <td class="px-3 py-3 font-semibold">${formatCurrency(sale.total)}</td>
        <td class="px-3 py-3">${sale.cashier || "Default Cashier"}</td>
      </tr>
    `
    )
    .join("");
}

function renderLowStockAlert(lowStockProducts) {
  if (!lowStockProducts.length) {
    elements.lowStockAlert.innerHTML =
      '<p class="text-sm text-emerald-700">Inventory healthy. No products are below threshold.</p>';
    return;
  }

  const lowStockText = lowStockProducts
    .slice(0, 5)
    .map((product) => `${product.name} (${product.stock})`)
    .join(", ");

  elements.lowStockAlert.innerHTML = `
    <div class="low-stock-chip">Low stock alert</div>
    <p class="text-sm text-amber-800">${lowStockText}</p>
  `;
}

function renderPaymentBreakdown(entries) {
  if (!entries.length) {
    elements.paymentBreakdown.innerHTML = '<p class="text-sm text-slate-500">No payment data available.</p>';
    return;
  }

  elements.paymentBreakdown.innerHTML = entries
    .map(
      (entry) => `
      <div class="payment-row">
        <span class="uppercase">${entry._id}</span>
        <span>${entry.count} txns</span>
        <strong>${formatCurrency(entry.amount)}</strong>
      </div>
    `
    )
    .join("");
}

function renderTrendChart(trend) {
  if (!trend.length) {
    elements.trendChart.innerHTML = '<p class="text-sm text-slate-500">No trend data available.</p>';
    return;
  }

  const maxValue = Math.max(...trend.map((entry) => entry.revenue), 1);

  elements.trendChart.innerHTML = trend
    .map((entry) => {
      const percent = Math.max((entry.revenue / maxValue) * 100, 2);
      return `
      <div class="trend-row">
        <span>${entry._id}</span>
        <div class="trend-bar-wrap">
          <div class="trend-bar" style="width:${percent}%;"></div>
        </div>
        <strong>${formatCurrency(entry.revenue)}</strong>
      </div>
    `;
    })
    .join("");
}

function renderTopProducts(products) {
  if (!products.length) {
    elements.topProducts.innerHTML = '<p class="text-sm text-slate-500">No product sales data yet.</p>';
    return;
  }

  elements.topProducts.innerHTML = products
    .map(
      (entry) => `
      <div class="top-product-row">
        <div>
          <p class="font-semibold text-slate-900">${entry._id.name}</p>
          <p class="text-xs text-slate-500">${entry._id.barcode}</p>
        </div>
        <div class="text-right">
          <p class="text-sm">Qty: ${entry.quantitySold}</p>
          <p class="font-semibold">${formatCurrency(entry.revenue)}</p>
        </div>
      </div>
    `
    )
    .join("");
}

function resetProductForm() {
  state.selectedProductId = null;
  elements.productForm.reset();
  elements.productFormTitle.textContent = "Add Product";
  elements.productFormSubmit.textContent = "Save Product";
  elements.productFormCancel.classList.add("hidden");
}

function populateProductForm(product) {
  state.selectedProductId = product._id;
  elements.productForm.name.value = product.name;
  elements.productForm.barcode.value = product.barcode;
  elements.productForm.category.value = product.category || "General";
  elements.productForm.price.value = product.price;
  elements.productForm.stock.value = product.stock;
  elements.productFormTitle.textContent = "Edit Product";
  elements.productFormSubmit.textContent = "Update Product";
  elements.productFormCancel.classList.remove("hidden");
}

function addToCart(product, quantity = 1) {
  if (!product || product.isActive === false) {
    showToast("This product is not available", "error");
    return;
  }

  const existingItem = state.cart.find((item) => item.productId === product._id);
  const currentQty = existingItem ? existingItem.quantity : 0;

  if (currentQty + quantity > product.stock) {
    showToast("Not enough stock available", "error");
    return;
  }

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.lineTotal = existingItem.quantity * existingItem.unitPrice;
  } else {
    state.cart.push({
      productId: product._id,
      barcode: product.barcode,
      name: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal: product.price * quantity,
    });
  }

  renderCart();
}

function updateCartItem(productId, action) {
  const cartItem = state.cart.find((item) => item.productId === productId);
  if (!cartItem) return;

  const product = state.products.find((entry) => entry._id === productId);

  if (action === "increment") {
    if (!product || cartItem.quantity + 1 > product.stock) {
      showToast("Cannot add more. Stock limit reached.", "warning");
      return;
    }
    cartItem.quantity += 1;
  }

  if (action === "decrement") {
    cartItem.quantity -= 1;
  }

  if (action === "remove" || cartItem.quantity <= 0) {
    state.cart = state.cart.filter((item) => item.productId !== productId);
  } else {
    cartItem.lineTotal = cartItem.quantity * cartItem.unitPrice;
  }

  renderCart();
}

function clearCart() {
  state.cart = [];
  elements.taxInput.value = "0";
  elements.discountInput.value = "0";
  elements.paidAmountInput.value = "0";

  if (state.upiModalOpen) {
    closeUpiModal();
  }

  renderCart();
}

function applyLocalStockDeduction() {
  state.cart.forEach((cartItem) => {
    const product = state.products.find((entry) => entry._id === cartItem.productId);
    if (product) {
      product.stock = Math.max(product.stock - cartItem.quantity, 0);
    }
  });

  setCachedProducts(state.products);
}

function openBillModal(sale, isOffline = false) {
  const rows = sale.items
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.unitPrice)}</td>
        <td>${formatCurrency(item.lineTotal)}</td>
      </tr>
    `
    )
    .join("");

  elements.billContent.innerHTML = `
    <div class="bill-head">
      <h3>Retail POS Invoice</h3>
      <p>${isOffline ? "OFFLINE BILL (Pending Sync)" : "PAID"}</p>
    </div>
    <p>Bill No: <strong>${sale.billNumber}</strong></p>
    <p>Date: ${new Date(sale.createdAt || Date.now()).toLocaleString()}</p>
    <p>Cashier: ${sale.cashier || "Default Cashier"}</p>
    <table class="bill-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="bill-total-row">
      <span>Subtotal</span>
      <strong>${formatCurrency(sale.subtotal)}</strong>
    </div>
    <div class="bill-total-row">
      <span>Tax</span>
      <strong>${formatCurrency(sale.tax)}</strong>
    </div>
    <div class="bill-total-row">
      <span>Discount</span>
      <strong>${formatCurrency(sale.discount)}</strong>
    </div>
    <div class="bill-total-row grand">
      <span>Total</span>
      <strong>${formatCurrency(sale.total)}</strong>
    </div>
    <div class="bill-total-row">
      <span>Payment</span>
      <strong>${sale.paymentMethod.toUpperCase()}</strong>
    </div>
    <div class="bill-total-row">
      <span>Paid Amount</span>
      <strong>${formatCurrency(sale.paidAmount)}</strong>
    </div>
    <div class="bill-total-row">
      <span>Change Due</span>
      <strong>${formatCurrency(sale.changeDue)}</strong>
    </div>
  `;

  elements.billModal.classList.remove("hidden");
}

function closeBillModal() {
  elements.billModal.classList.add("hidden");
}

async function loadProducts() {
  try {
    const response = await api.getProducts({ limit: 500 });
    state.products = response.data;
    setCachedProducts(state.products);
    setLastSyncTimestamp();
    updateSyncInfo();
  } catch (error) {
    const cachedProducts = getCachedProducts();
    if (cachedProducts.length) {
      state.products = cachedProducts;
      showToast("Using cached products while offline", "warning");
    } else {
      state.products = [];
      showToast(error.message || "Unable to load products", "error");
    }
  }

  renderProductResults();
  renderProductTable();
}

async function loadSalesHistory() {
  try {
    const response = await api.getSalesHistory({ limit: 20 });
    state.salesHistory = response.data;
  } catch (error) {
    state.salesHistory = [];
  }

  renderHistoryTable();
}

async function loadLowStockAlert() {
  try {
    const response = await api.getLowStockProducts({ threshold: 5 });
    renderLowStockAlert(response.data);
  } catch (error) {
    const lowStockProducts = state.products.filter((product) => product.stock <= 5);
    renderLowStockAlert(lowStockProducts);
  }
}

async function loadDashboard() {
  try {
    const [salesSummary, inventoryOverview] = await Promise.all([
      api.getSalesSummary({ range: state.dashboardRange }),
      api.getInventoryOverview({ threshold: 5 }),
    ]);

    const overview = salesSummary.data.overview;

    elements.metricRevenue.textContent = formatCurrency(overview.totalRevenue || 0);
    elements.metricTransactions.textContent = String(overview.totalTransactions || 0);

    const avgBill =
      overview.totalTransactions > 0 ? overview.totalRevenue / overview.totalTransactions : 0;
    elements.metricAvgBill.textContent = formatCurrency(avgBill);
    elements.metricLowStock.textContent = String(salesSummary.data.lowStockCount || 0);
    elements.metricInventoryValue.textContent = formatCurrency(
      inventoryOverview.data.inventoryValue || 0
    );

    renderPaymentBreakdown(salesSummary.data.paymentBreakdown || []);
    renderTrendChart(salesSummary.data.trend || []);
    renderTopProducts(salesSummary.data.topProducts || []);
  } catch (error) {
    elements.metricRevenue.textContent = formatCurrency(0);
    elements.metricTransactions.textContent = "0";
    elements.metricAvgBill.textContent = formatCurrency(0);
    elements.metricLowStock.textContent = "0";
    elements.metricInventoryValue.textContent = formatCurrency(0);

    renderPaymentBreakdown([]);
    renderTrendChart([]);
    renderTopProducts([]);
  }
}

async function syncPendingSales() {
  if (!navigator.onLine) return;

  const pendingSales = getPendingSales();
  if (!pendingSales.length) return;

  let syncedCount = 0;

  for (const pending of pendingSales) {
    try {
      await api.processBilling({
        ...pending.payload,
        source: "offline_sync",
      });
      removePendingSale(pending.id);
      syncedCount += 1;
    } catch (error) {
      if (!error.isNetworkError) {
        removePendingSale(pending.id);
      } else {
        break;
      }
    }
  }

  if (syncedCount > 0) {
    showToast(`${syncedCount} offline transaction(s) synced`, "success");
    await loadProducts();
    await loadSalesHistory();
    await loadDashboard();
    await loadLowStockAlert();
    setLastSyncTimestamp();
  }

  updatePendingBadge();
  updateSyncInfo();
}

async function handleCheckout() {
  if (!state.cart.length) {
    showToast("Add products to cart before checkout", "warning");
    return;
  }

  const checkoutContext = buildCheckoutContext(state.paymentMethod);

  if (checkoutContext.paymentMethod === "cash" && checkoutContext.paidAmount < checkoutContext.total) {
    showToast("Paid amount cannot be less than total for cash", "error");
    return;
  }

  if (checkoutContext.paymentMethod === "upi") {
    if (state.upiModalOpen) {
      showToast("Complete payment from the Scan & Pay window.", "info");
      return;
    }

    await openUpiModal(checkoutContext);
    return;
  }

  const payload = buildCheckoutPayload(checkoutContext);
  await completeCheckout(checkoutContext, payload);
}

function findProductByBarcode(barcode) {
  const candidates = getBarcodeCandidates(barcode);
  if (!candidates.length) return null;

  return (
    state.products.find((product) => candidates.includes(normalizeBarcode(product.barcode))) || null
  );
}

async function resolveProductByBarcode(code) {
  const localProduct = findProductByBarcode(code);
  if (localProduct) {
    return localProduct;
  }

  if (!navigator.onLine) {
    return null;
  }

  const candidates = getBarcodeCandidates(code);
  for (const candidate of candidates) {
    try {
      const response = await api.getProductByBarcode(candidate);
      if (response?.data) {
        const existingIndex = state.products.findIndex((product) => product._id === response.data._id);
        if (existingIndex >= 0) {
          state.products[existingIndex] = response.data;
        } else {
          state.products.unshift(response.data);
        }
        return response.data;
      }
    } catch (error) {
      // Continue to next candidate until a valid barcode lookup succeeds.
    }
  }

  return null;
}

async function applyScannedBarcode(code, sourceLabel = "Scanned") {
  const normalizedCode = normalizeBarcode(code);
  if (!normalizedCode) return;

  elements.searchInput.value = normalizedCode;
  renderProductResults();

  const resolvedProduct = await resolveProductByBarcode(normalizedCode);
  if (resolvedProduct) {
    addToCart(resolvedProduct, 1);
    renderProductTable();
    showToast(`${sourceLabel}: ${resolvedProduct.name}`, "success");
  } else {
    showToast(`${sourceLabel} barcode ${normalizedCode} not found`, "warning");
  }
}

function promptManualBarcodeEntry() {
  const manualCode = window.prompt("Enter barcode to search and add to cart:");
  if (manualCode === null) {
    return;
  }

  void applyScannedBarcode(manualCode, "Manual barcode");
}

function getCameraErrorMessage(error) {
  const errorName = String(error?.name || "");

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Camera permission denied. Allow camera access in browser settings.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No camera device found on this system.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Camera is busy in another app. Close it and try again.";
  }

  if (errorName === "SecurityError") {
    return "Camera blocked by browser security policy. Use localhost or HTTPS.";
  }

  return "Camera access failed. Check permissions or use manual barcode entry.";
}

async function startScanner() {
  if (state.scannerRunning) return;

  if (!window.Quagga) {
    showToast("Scanner unavailable. Falling back to manual barcode entry.", "warning");
    promptManualBarcodeEntry();
    return;
  }

  if (!window.isSecureContext) {
    showToast("Camera requires localhost or HTTPS. Using manual entry.", "warning");
    promptManualBarcodeEntry();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("Camera API not supported. Using manual barcode entry.", "warning");
    promptManualBarcodeEntry();
    return;
  }

  try {
    const preflightStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });

    preflightStream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    showToast(getCameraErrorMessage(error), "error");
    promptManualBarcodeEntry();
    return;
  }

  elements.scannerModal.classList.remove("hidden");

  window.Quagga.init(
    {
      numOfWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),
      frequency: 10,
      locator: {
        patchSize: "medium",
        halfSample: true,
      },
      inputStream: {
        type: "LiveStream",
        target: elements.scannerViewport,
        constraints: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
      },
      decoder: {
        multiple: false,
        readers: [
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
          "code_128_reader",
          "code_39_reader",
        ],
      },
      locate: true,
    },
    (error) => {
      if (error) {
        elements.scannerModal.classList.add("hidden");
        showToast(getCameraErrorMessage(error), "error");
        promptManualBarcodeEntry();
        return;
      }

      window.Quagga.start();
      state.scannerRunning = true;
      startScannerNoResultTimer();

      scannerDetectedHandler = (result) => {
        const code = result?.codeResult?.code;
        if (!code) return;

        clearScannerNoResultTimer();
        void applyScannedBarcode(code, "Scanned");

        stopScanner();
      };

      window.Quagga.onDetected(scannerDetectedHandler);
    }
  );
}

function stopScanner() {
  clearScannerNoResultTimer();

  if (window.Quagga && scannerDetectedHandler) {
    window.Quagga.offDetected(scannerDetectedHandler);
    scannerDetectedHandler = null;
  }

  if (state.scannerRunning && window.Quagga) {
    window.Quagga.stop();
    state.scannerRunning = false;
  }

  elements.scannerModal.classList.add("hidden");
  elements.scannerViewport.innerHTML = "";
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });

  elements.searchInput.addEventListener("input", renderProductResults);
  elements.manualBarcodeButton.addEventListener("click", promptManualBarcodeEntry);

  elements.productResults.addEventListener("click", (event) => {
    const target = event.target.closest("[data-product-id]");
    if (!target) return;

    const product = state.products.find((entry) => entry._id === target.dataset.productId);
    if (product) {
      addToCart(product, 1);
    }
  });

  elements.cartList.addEventListener("click", (event) => {
    const control = event.target.closest("[data-cart-action]");
    if (!control) return;

    updateCartItem(control.dataset.productId, control.dataset.cartAction);
  });

  elements.taxInput.addEventListener("input", renderCart);
  elements.discountInput.addEventListener("input", renderCart);

  elements.paymentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const previousMethod = state.paymentMethod;
      state.paymentMethod = button.dataset.paymentMethod;

      elements.paymentButtons.forEach((entry) => {
        entry.classList.toggle("payment-active", entry === button);
      });

      if (state.paymentMethod !== "cash") {
        elements.paidAmountInput.value = getCartTotal().toFixed(2);
      }

      if (state.upiModalOpen && state.paymentMethod !== "upi") {
        closeUpiModal();
        showToast("UPI payment window closed. Cart is unchanged.", "info");
      }

      if (state.paymentMethod === "upi" && state.cart.length > 0 && previousMethod !== "upi") {
        void openUpiModal(buildCheckoutContext("upi"));
      }
    });
  });

  elements.checkoutButton.addEventListener("click", handleCheckout);
  elements.clearCartButton.addEventListener("click", clearCart);

  elements.upiDoneButton.addEventListener("click", () => {
    void handleUpiPaymentDone();
  });

  elements.upiCancelButton.addEventListener("click", () => {
    cancelUpiPayment();
  });

  elements.upiOpenAppLink.addEventListener("click", () => {
    setUpiPaymentStatus("Waiting for payment confirmation...", "waiting");
  });

  elements.upiModal.addEventListener("click", (event) => {
    if (event.target === elements.upiModal) {
      cancelUpiPayment();
    }
  });

  elements.productForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: elements.productForm.name.value.trim(),
      barcode: elements.productForm.barcode.value.trim(),
      category: elements.productForm.category.value.trim() || "General",
      price: asNumber(elements.productForm.price.value),
      stock: asNumber(elements.productForm.stock.value),
    };

    if (!payload.name || !payload.barcode) {
      showToast("Name and barcode are required", "error");
      return;
    }

    try {
      if (state.selectedProductId) {
        await api.updateProduct(state.selectedProductId, payload);
        showToast("Product updated", "success");
      } else {
        await api.addProduct(payload);
        showToast("Product added", "success");
      }

      resetProductForm();
      await loadProducts();
      await loadLowStockAlert();
      await loadDashboard();
    } catch (error) {
      showToast(error.message || "Unable to save product", "error");
    }
  });

  elements.productFormCancel.addEventListener("click", resetProductForm);

  elements.productTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-product-action]");
    if (!button) return;

    const product = state.products.find((entry) => entry._id === button.dataset.productId);
    if (!product) return;

    try {
      if (button.dataset.productAction === "edit") {
        populateProductForm(product);
        return;
      }

      if (button.dataset.productAction === "set-stock") {
        const value = window.prompt("Set new stock quantity", String(product.stock));
        if (value === null) return;
        const quantity = Math.max(asNumber(value, NaN), 0);
        if (!Number.isFinite(quantity)) {
          showToast("Invalid stock quantity", "error");
          return;
        }

        await api.updateStock(product._id, {
          mode: "set",
          quantity,
          referenceType: "adjustment",
          note: "Set from admin panel",
        });
        showToast("Stock updated", "success");
      }

      if (button.dataset.productAction === "restock") {
        await api.updateStock(product._id, {
          mode: "add",
          quantity: 10,
          referenceType: "restock",
          note: "Quick +10 restock",
        });
        showToast("Stock increased by 10", "success");
      }

      if (button.dataset.productAction === "delete") {
        await api.deleteProduct(product._id);
        showToast("Product deactivated", "warning");
      }

      await loadProducts();
      await loadLowStockAlert();
      await loadDashboard();
    } catch (error) {
      showToast(error.message || "Action failed", "error");
    }
  });

  elements.dashboardRangeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.dashboardRange = button.dataset.range;
      elements.dashboardRangeButtons.forEach((entry) => {
        entry.classList.toggle("range-active", entry === button);
      });
      await loadDashboard();
    });
  });

  elements.scanButton.addEventListener("click", startScanner);
  elements.scannerCloseButton.addEventListener("click", stopScanner);

  elements.billClose.addEventListener("click", closeBillModal);
  elements.billPrint.addEventListener("click", () => window.print());

  window.addEventListener("online", async () => {
    updateNetworkBadge();
    await syncPendingSales();
  });

  window.addEventListener("offline", updateNetworkBadge);
}

async function init() {
  elements.apiBaseText.textContent = API_BASE_URL;
  updateNetworkBadge();
  updatePendingBadge();
  updateSyncInfo();
  bindEvents();

  renderCart();
  setActiveTab("pos");

  await loadProducts();
  await loadSalesHistory();
  await loadDashboard();
  await loadLowStockAlert();
  await syncPendingSales();
}

init();
