import { API_BASE_URL } from "./config.js";
import { api, getAccessToken, setAccessToken } from "./services/api.js";
import { createBarcodeScanner } from "./services/scanner.js";
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
  adminUsers: [],
  cart: [],
  activeTab: "pos",
  authUser: null,
  authReady: false,
  paymentMethod: "cash",
  dashboardRange: "daily",
  adminUsersLoaded: false,
  dashboardLoaded: false,
  historyLoaded: false,
  paymentSettingsLoaded: false,
  reportDateFiltersInitialized: false,
  dashboardReportExporting: false,
  historyReportExporting: false,
  paymentSettings: {
    shopId: "",
    upiId: "",
    qrImage: "",
    configured: false,
  },
  selectedProductId: null,
  scannerRunning: false,
  salesHistory: [],
  upiModalOpen: false,
  upiExpiresAt: 0,
  upiCountdownIntervalId: null,
  upiStatusPollIntervalId: null,
  upiAutoCompleting: false,
  pendingUpiCheckout: null,
  upiQrRenderToken: 0,
  resetPasswordTargetUserId: "",
  resetPasswordTargetUsername: "",
  userStatusTargetUserId: "",
  userStatusTargetUsername: "",
  userStatusTargetIsActive: null,
  setStockTargetProductId: "",
  setStockTargetProductName: "",
  mobileCartOpen: false,
};

const elements = {
  apiBaseText: document.getElementById("api-base"),
  syncInfo: document.getElementById("sync-info"),
  networkBadge: document.getElementById("network-badge"),
  pendingBadge: document.getElementById("pending-badge"),
  authUserBadge: document.getElementById("auth-user-badge"),
  logoutButton: document.getElementById("logout-button"),
  appNav: document.getElementById("app-nav"),
  appMain: document.getElementById("app-main"),
  tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),

  searchInput: document.getElementById("search-input"),
  productResults: document.getElementById("product-results"),
  scanButton: document.getElementById("scan-button"),
  manualBarcodeButton: document.getElementById("manual-barcode-button"),
  mobileCartSheet: document.getElementById("mobile-cart-sheet"),
  mobileCartRail: document.getElementById("mobile-cart-rail"),
  mobileCartBackdrop: document.getElementById("mobile-cart-backdrop"),
  mobileCartOpenButton: document.getElementById("mobile-cart-open-button"),
  mobileCartCloseButton: document.getElementById("mobile-cart-close-button"),
  mobileCartCheckoutButton: document.getElementById("mobile-cart-checkout-button"),
  mobileCartItemCount: document.getElementById("mobile-cart-item-count"),
  mobileCartTotalValue: document.getElementById("mobile-cart-total-value"),

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
  changePasswordForm: document.getElementById("change-password-form"),
  currentPasswordInput: document.getElementById("current-password-input"),
  newPasswordInput: document.getElementById("new-password-input"),
  confirmPasswordInput: document.getElementById("confirm-password-input"),
  userRefreshButton: document.getElementById("user-refresh-button"),
  userTableBody: document.getElementById("user-table-body"),

  dashboardRangeButtons: Array.from(document.querySelectorAll("[data-range]")),
  metricRevenue: document.getElementById("metric-revenue"),
  metricTransactions: document.getElementById("metric-transactions"),
  metricAvgBill: document.getElementById("metric-avg-bill"),
  metricLowStock: document.getElementById("metric-low-stock"),
  metricInventoryValue: document.getElementById("metric-inventory-value"),
  paymentBreakdown: document.getElementById("payment-breakdown"),
  trendChart: document.getElementById("trend-chart"),
  topProducts: document.getElementById("top-products"),

  dashboardReportStartDateInput: document.getElementById("dashboard-report-start-date"),
  dashboardReportEndDateInput: document.getElementById("dashboard-report-end-date"),
  dashboardReportPaymentMethodInput: document.getElementById("dashboard-report-payment-method"),
  dashboardExportCsvButton: document.getElementById("dashboard-export-csv"),
  dashboardExportPdfButton: document.getElementById("dashboard-export-pdf"),

  historyTableBody: document.getElementById("history-table-body"),
  historyReportStartDateInput: document.getElementById("history-report-start-date"),
  historyReportEndDateInput: document.getElementById("history-report-end-date"),
  historyReportPaymentMethodInput: document.getElementById("history-report-payment-method"),
  historyExportCsvButton: document.getElementById("history-export-csv"),
  historyExportPdfButton: document.getElementById("history-export-pdf"),

  scannerModal: document.getElementById("scanner-modal"),
  scannerStage: document.getElementById("scanner-stage"),
  scannerViewport: document.getElementById("scanner-viewport"),
  scannerStatus: document.getElementById("scanner-status"),
  scannerLoading: document.getElementById("scanner-loading"),
  scannerStartButton: document.getElementById("scanner-start"),
  scannerStopButton: document.getElementById("scanner-stop"),
  scannerTorchButton: document.getElementById("scanner-torch"),
  scannerManualEntryButton: document.getElementById("scanner-manual-entry"),
  scannerSearchNameButton: document.getElementById("scanner-search-name"),
  scannerCloseButton: document.getElementById("scanner-close"),
  barcodeModal: document.getElementById("barcode-modal"),
  barcodeForm: document.getElementById("barcode-form"),
  barcodeInput: document.getElementById("barcode-input"),
  barcodeCloseButton: document.getElementById("barcode-close"),
  barcodeCancelButton: document.getElementById("barcode-cancel"),
  stockModal: document.getElementById("stock-modal"),
  stockForm: document.getElementById("stock-form"),
  stockModalDescription: document.getElementById("stock-modal-description"),
  stockQuantityInput: document.getElementById("stock-quantity-input"),
  stockCloseButton: document.getElementById("stock-close"),
  stockCancelButton: document.getElementById("stock-cancel"),
  stockSubmitButton: document.getElementById("stock-submit"),

  paymentSettingsForm: document.getElementById("payment-settings-form"),
  paymentUpiIdInput: document.getElementById("payment-upi-id"),
  paymentQrFileInput: document.getElementById("payment-qr-file"),
  paymentQrHint: document.getElementById("payment-qr-hint"),
  paymentQrPreviewWrap: document.getElementById("payment-qr-preview-wrap"),
  paymentQrPreview: document.getElementById("payment-qr-preview"),
  paymentSettingsSaveButton: document.getElementById("payment-settings-save"),
  paymentSettingsRemoveQrButton: document.getElementById("payment-settings-remove-qr"),

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

  authModal: document.getElementById("auth-modal"),
  authForm: document.getElementById("auth-form"),
  authUsername: document.getElementById("auth-username"),
  authPassword: document.getElementById("auth-password"),
  authError: document.getElementById("auth-error"),
  authLoginButton: document.getElementById("auth-login-button"),
  authBootstrapButton: document.getElementById("auth-bootstrap-button"),

  resetPasswordModal: document.getElementById("reset-password-modal"),
  resetPasswordForm: document.getElementById("reset-password-form"),
  resetPasswordDescription: document.getElementById("reset-password-description"),
  resetPasswordNewInput: document.getElementById("reset-password-new"),
  resetPasswordConfirmInput: document.getElementById("reset-password-confirm"),
  resetPasswordCloseButton: document.getElementById("reset-password-close"),
  resetPasswordCancelButton: document.getElementById("reset-password-cancel"),
  resetPasswordSubmitButton: document.getElementById("reset-password-submit"),

  userStatusModal: document.getElementById("user-status-modal"),
  userStatusDescription: document.getElementById("user-status-description"),
  userStatusCloseButton: document.getElementById("user-status-close"),
  userStatusCancelButton: document.getElementById("user-status-cancel"),
  userStatusConfirmButton: document.getElementById("user-status-confirm"),

  toastRoot: document.getElementById("toast-root"),
};

let upiModalHideTimeoutId = null;
let upiQrCodeInstance = null;
let barcodeScanner = null;
const MIN_PARTIAL_BARCODE_LENGTH = 6;
const SCANNER_DEBUG_ENABLED =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
  window.localStorage.getItem("pos_debug_scanner") === "1";
const SCANNER_CONFIG = {
  noDetectionTimeoutMs: 14000,
  successCooldownMs: 1300,
  confirmationHits: 1,
  confirmationWindowMs: 1800,
  minAcceptedLength: 3,
};
const KEYBOARD_WEDGE_CONFIG = {
  interKeyTimeoutMs: 85,
  maxBufferLength: 64,
  minCodeLength: 3,
};
const SCAN_GUARD_CONFIG = {
  cooldownMs: 1200,
  duplicateWindowMs: 2200,
};
const UPI_CONFIG = {
  currency: "INR",
  defaultShopName: "Shop",
  sessionTimeoutMs: 2 * 60 * 1000,
};

const EXTERNAL_SCRIPT_URLS = {
  qrcode: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  jspdfAutoTable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
};

const externalScriptLoaders = new Map();
const modalFocusReturnMap = new WeakMap();

let keyboardWedgeBuffer = "";
let keyboardWedgeLastAt = 0;
let scanGuardActive = false;
let scanGuardTimeoutId = null;
let lastScannedCode = "";
let lastScannedAt = 0;
let lastCartHighlightProductId = "";
let cartHighlightTimeoutId = null;
let eventsBound = false;
let paymentQrMarkedForRemoval = false;

const ROLE_TAB_ACCESS = {
  admin: ["pos", "admin", "dashboard", "history"],
  cashier: ["pos", "history"],
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

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function loadExternalScript(url, globalName) {
  if (globalName && window[globalName]) {
    return Promise.resolve(window[globalName]);
  }

  const existingPromise = externalScriptLoaders.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise((resolve, reject) => {
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

    script.addEventListener(
      "load",
      () => {
        resolve(globalName ? window[globalName] : true);
      },
      { once: true }
    );

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

  externalScriptLoaders.set(url, promise);
  return promise;
}

async function ensureQRCodeLoaded() {
  try {
    return await loadExternalScript(EXTERNAL_SCRIPT_URLS.qrcode, "QRCode");
  } catch (error) {
    return null;
  }
}

function isModalVisible(modalElement) {
  return Boolean(modalElement && !modalElement.classList.contains("hidden"));
}

function rememberModalFocus(modalElement) {
  if (!modalElement) {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    modalFocusReturnMap.set(modalElement, activeElement);
  }
}

function restoreModalFocus(modalElement) {
  const previousFocus = modalFocusReturnMap.get(modalElement);
  if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
    previousFocus.focus();
  }
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((entry) => entry instanceof HTMLElement && !entry.hasAttribute("hidden"));
}

function getTopVisibleModal() {
  const orderedModals = [
    elements.userStatusModal,
    elements.resetPasswordModal,
    elements.stockModal,
    elements.barcodeModal,
    elements.billModal,
    elements.upiModal,
    elements.scannerModal,
    elements.authModal,
  ];

  return orderedModals.find((modalElement) => isModalVisible(modalElement)) || null;
}

function closeModalByElement(modalElement) {
  if (!modalElement) {
    return;
  }

  if (modalElement === elements.resetPasswordModal) {
    closeResetPasswordModal();
    return;
  }

  if (modalElement === elements.userStatusModal) {
    closeUserStatusModal();
    return;
  }

  if (modalElement === elements.stockModal) {
    closeSetStockModal();
    return;
  }

  if (modalElement === elements.barcodeModal) {
    closeBarcodeModal();
    return;
  }

  if (modalElement === elements.billModal) {
    closeBillModal();
    return;
  }

  if (modalElement === elements.upiModal) {
    cancelUpiPayment();
    return;
  }

  if (modalElement === elements.scannerModal) {
    closeScannerModal();
    return;
  }

  if (modalElement === elements.authModal) {
    return;
  }
}

function handleGlobalModalKeydown(event) {
  const modalElement = getTopVisibleModal();
  if (!modalElement) {
    return;
  }

  if (event.key === "Escape") {
    if (modalElement !== elements.authModal) {
      event.preventDefault();
      closeModalByElement(modalElement);
    }
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getFocusableElements(modalElement);
  if (!focusableElements.length) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function getUserId(user) {
  return String(user?.id || user?._id || "");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function formatDateInputValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultReportDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);

  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  };
}

function initializeReportDateFilters() {
  if (state.reportDateFiltersInitialized) {
    return;
  }

  const defaults = getDefaultReportDateRange();

  const startDateInputs = [elements.dashboardReportStartDateInput, elements.historyReportStartDateInput];
  startDateInputs.forEach((input) => {
    if (input && !String(input.value || "").trim()) {
      input.value = defaults.startDate;
    }
  });

  const endDateInputs = [elements.dashboardReportEndDateInput, elements.historyReportEndDateInput];
  endDateInputs.forEach((input) => {
    if (input && !String(input.value || "").trim()) {
      input.value = defaults.endDate;
    }
  });

  state.reportDateFiltersInitialized = true;
}

function buildReportQueryFromInputs({ startInput, endInput, paymentInput, limit = 1000 } = {}) {
  const startDate = String(startInput?.value || "").trim();
  const endDate = String(endInput?.value || "").trim();

  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error("Select both From and To dates");
  }

  if (startDate && endDate) {
    const normalizedStart = new Date(`${startDate}T00:00:00`);
    const normalizedEnd = new Date(`${endDate}T23:59:59`);

    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
      throw new Error("Invalid date filter");
    }

    if (normalizedStart > normalizedEnd) {
      throw new Error("From date cannot be after To date");
    }
  }

  const paymentMethod = String(paymentInput?.value || "")
    .trim()
    .toLowerCase();

  const query = {
    limit: Math.min(Math.max(Number(limit) || 1000, 1), 1000),
  };

  if (startDate) {
    query.startDate = startDate;
  }

  if (endDate) {
    query.endDate = endDate;
  }

  if (paymentMethod) {
    query.paymentMethod = paymentMethod;
  }

  return {
    query,
    filters: {
      startDate,
      endDate,
      paymentMethod: paymentMethod || "all",
    },
  };
}

function getHistoryApiFilters() {
  const { query } = buildReportQueryFromInputs({
    startInput: elements.historyReportStartDateInput,
    endInput: elements.historyReportEndDateInput,
    paymentInput: elements.historyReportPaymentMethodInput,
    limit: 20,
  });

  const historyQuery = {
    limit: Math.min(Math.max(Number(query.limit) || 20, 1), 200),
  };

  if (query.startDate) {
    historyQuery.from = query.startDate;
  }

  if (query.endDate) {
    historyQuery.to = query.endDate;
  }

  if (query.paymentMethod) {
    historyQuery.paymentMethod = query.paymentMethod;
  }

  return historyQuery;
}

function formatAmountForCsv(value) {
  return asNumber(value, 0).toFixed(2);
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(columns, rows) {
  const headerRow = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const dataRows = rows.map((row) =>
    columns.map((column) => escapeCsvValue(column.getValue(row))).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

function downloadFile({ content, fileName, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function formatPaymentMethodLabel(paymentMethod) {
  if (String(paymentMethod || "").toLowerCase() === "cash") {
    return "Cash";
  }

  if (String(paymentMethod || "").toLowerCase() === "upi") {
    return "UPI";
  }

  return "All";
}

function formatReportDateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) {
    return "Last 30 days";
  }

  return `${startDate} to ${endDate}`;
}

function buildReportFileName(prefix, extension, filters = {}) {
  const rangePart =
    filters.startDate && filters.endDate
      ? `${filters.startDate}_to_${filters.endDate}`
      : "last_30_days";
  const paymentPart = filters.paymentMethod && filters.paymentMethod !== "all" ? filters.paymentMethod : "all";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `${prefix}_${rangePart}_${paymentPart}_${timestamp}.${extension}`;
}

function setExportButtonsBusy({ buttons, activeButton, loadingLabel, busy }) {
  buttons.forEach((button) => {
    if (!button) {
      return;
    }

    if (!button.dataset.idleLabel) {
      button.dataset.idleLabel = button.textContent || "";
    }

    button.disabled = busy;
    button.textContent =
      busy && button === activeButton
        ? loadingLabel
        : button.dataset.idleLabel || button.textContent;
  });
}

async function ensurePdfLibrary() {
  const jsPdfNamespace = await loadExternalScript(EXTERNAL_SCRIPT_URLS.jspdf, "jspdf");
  await loadExternalScript(EXTERNAL_SCRIPT_URLS.jspdfAutoTable);

  const jsPDF = jsPdfNamespace?.jsPDF;
  if (typeof jsPDF !== "function") {
    throw new Error("Unable to load PDF export library");
  }

  return jsPDF;
}

async function exportTablePdf({ title, subtitleLines, columns, rows, fileName }) {
  const jsPDF = await ensurePdfLibrary();
  const doc = new jsPDF({
    orientation: columns.length > 7 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  let currentY = 38;
  doc.setFontSize(16);
  doc.text(String(title || "Report"), 40, currentY);
  currentY += 18;

  doc.setFontSize(10);
  (subtitleLines || []).forEach((line) => {
    doc.text(String(line), 40, currentY);
    currentY += 13;
  });

  const autoTableInvoker =
    typeof doc.autoTable === "function"
      ? (options) => doc.autoTable(options)
      : typeof window.jspdfAutoTable === "function"
      ? (options) => window.jspdfAutoTable(doc, options)
      : null;

  if (!autoTableInvoker) {
    throw new Error("Unable to load PDF table plugin");
  }

  autoTableInvoker({
    startY: currentY + 4,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => String(column.getValue(row) ?? "-"))),
    theme: "striped",
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [220, 226, 236],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [93, 82, 63],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    margin: {
      left: 40,
      right: 40,
    },
  });

  doc.save(fileName);
}


function getPasswordValidationMessage(newPassword, confirmPassword) {
  const password = String(newPassword || "");
  const confirmation = String(confirmPassword || "");

  if (!password || !confirmation) {
    return "Both password fields are required";
  }

  if (password !== confirmation) {
    return "New password and confirmation do not match";
  }

  if (password.length < 8 || password.length > 128) {
    return "Password must be 8-128 characters";
  }

  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number";
  }

  return "";
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

function getAllowedTabsForRole(role) {
  if (!role) {
    return new Set();
  }

  const normalizedRole = String(role).toLowerCase();
  return new Set(ROLE_TAB_ACCESS[normalizedRole] || ROLE_TAB_ACCESS.cashier);
}

function setAuthError(message = "") {
  const text = String(message || "").trim();
  elements.authError.textContent = text;
  elements.authError.classList.toggle("hidden", !text);
}

function setAuthLoadingState(isLoading) {
  elements.authLoginButton.disabled = isLoading;
  elements.authBootstrapButton.disabled = isLoading;
  elements.authLoginButton.textContent = isLoading ? "Signing in..." : "Login";
}

function openAuthModal(message = "") {
  if (elements.authModal.classList.contains("hidden")) {
    rememberModalFocus(elements.authModal);
  }
  setAuthError(message);
  elements.authModal.classList.remove("hidden");
  elements.authUsername.focus();
}

function closeAuthModal() {
  elements.authModal.classList.add("hidden");
  setAuthError("");
  setAuthLoadingState(false);
  restoreModalFocus(elements.authModal);
}

function openResetPasswordModal(user) {
  if (!elements.resetPasswordModal || !elements.resetPasswordForm) {
    return;
  }

  const userId = getUserId(user);
  if (!userId) {
    return;
  }

  state.resetPasswordTargetUserId = userId;
  state.resetPasswordTargetUsername = user.username || "user";

  rememberModalFocus(elements.resetPasswordModal);
  elements.resetPasswordDescription.textContent = `Set a new password for ${state.resetPasswordTargetUsername}.`;
  elements.resetPasswordForm.reset();
  elements.resetPasswordModal.classList.remove("hidden");
  elements.resetPasswordNewInput.focus();
}

function closeResetPasswordModal() {
  if (!elements.resetPasswordModal || !elements.resetPasswordForm) {
    return;
  }

  elements.resetPasswordModal.classList.add("hidden");
  elements.resetPasswordForm.reset();
  state.resetPasswordTargetUserId = "";
  state.resetPasswordTargetUsername = "";
  restoreModalFocus(elements.resetPasswordModal);
}

function openUserStatusModal(user, targetStatus) {
  if (!elements.userStatusModal || !elements.userStatusConfirmButton) {
    return;
  }

  const userId = getUserId(user);
  if (!userId) {
    return;
  }

  const username = String(user?.username || "user");
  const shouldActivate = Boolean(targetStatus);

  state.userStatusTargetUserId = userId;
  state.userStatusTargetUsername = username;
  state.userStatusTargetIsActive = shouldActivate;

  elements.userStatusDescription.textContent = shouldActivate
    ? `Activate ${username} and allow sign-in access?`
    : `Deactivate ${username} and block sign-in access?`;

  elements.userStatusConfirmButton.textContent = shouldActivate ? "Activate User" : "Deactivate User";
  elements.userStatusConfirmButton.classList.toggle("danger-btn", !shouldActivate);

  rememberModalFocus(elements.userStatusModal);
  elements.userStatusModal.classList.remove("hidden");
  elements.userStatusConfirmButton.focus();
}

function closeUserStatusModal() {
  if (!elements.userStatusModal || !elements.userStatusConfirmButton) {
    return;
  }

  elements.userStatusModal.classList.add("hidden");
  elements.userStatusConfirmButton.disabled = false;
  elements.userStatusConfirmButton.textContent = "Confirm";
  elements.userStatusConfirmButton.classList.remove("danger-btn");
  state.userStatusTargetUserId = "";
  state.userStatusTargetUsername = "";
  state.userStatusTargetIsActive = null;
  restoreModalFocus(elements.userStatusModal);
}

function openBarcodeModal(initialValue = "") {
  if (!elements.barcodeModal || !elements.barcodeForm || !elements.barcodeInput) {
    return;
  }

  rememberModalFocus(elements.barcodeModal);
  elements.barcodeForm.reset();
  elements.barcodeInput.value = String(initialValue || "").trim();
  elements.barcodeModal.classList.remove("hidden");
  elements.barcodeInput.focus();
}

function closeBarcodeModal() {
  if (!elements.barcodeModal || !elements.barcodeForm) {
    return;
  }

  elements.barcodeModal.classList.add("hidden");
  elements.barcodeForm.reset();
  restoreModalFocus(elements.barcodeModal);
}

function openSetStockModal(product) {
  if (!product || !elements.stockModal || !elements.stockForm || !elements.stockQuantityInput) {
    return;
  }

  state.setStockTargetProductId = String(product._id || "");
  state.setStockTargetProductName = product.name || "product";

  if (!state.setStockTargetProductId) {
    return;
  }

  rememberModalFocus(elements.stockModal);
  elements.stockForm.reset();
  elements.stockModalDescription.textContent = `Set stock quantity for ${state.setStockTargetProductName}.`;
  elements.stockQuantityInput.value = String(Math.max(asNumber(product.stock, 0), 0));
  elements.stockModal.classList.remove("hidden");
  elements.stockQuantityInput.focus();
}

function closeSetStockModal() {
  if (!elements.stockModal || !elements.stockForm) {
    return;
  }

  elements.stockModal.classList.add("hidden");
  elements.stockForm.reset();
  state.setStockTargetProductId = "";
  state.setStockTargetProductName = "";
  restoreModalFocus(elements.stockModal);
}

function setAppLocked(isLocked) {
  document.body.classList.toggle("app-locked", Boolean(isLocked));
}

function updateAuthBadge() {
  const user = state.authUser;

  elements.authUserBadge.classList.remove("auth-badge-admin", "auth-badge-cashier");

  if (!user) {
    elements.authUserBadge.textContent = "Not signed in";
    elements.logoutButton.classList.add("hidden");
    return;
  }

  const role = String(user.role || "cashier").toLowerCase();
  const displayName = user.displayName || user.username || "User";
  elements.authUserBadge.textContent = `${displayName} (${role})`;
  elements.authUserBadge.classList.add(role === "admin" ? "auth-badge-admin" : "auth-badge-cashier");
  elements.logoutButton.classList.remove("hidden");
}

function applyRoleAccess() {
  const allowedTabs = getAllowedTabsForRole(state.authUser?.role);

  elements.tabButtons.forEach((button) => {
    const isAllowed = allowedTabs.has(button.dataset.tab);
    button.classList.toggle("hidden", !isAllowed);
  });

  elements.tabPanels.forEach((panel) => {
    const isAllowed = allowedTabs.has(panel.dataset.tabPanel);
    if (!isAllowed) {
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
    }
  });

  if (!allowedTabs.size) {
    return;
  }

  if (!allowedTabs.has(state.activeTab)) {
    state.activeTab = allowedTabs.has("pos") ? "pos" : Array.from(allowedTabs)[0] || "pos";
  }
}

function applyAuthenticatedUser(user) {
  state.authUser = user;
  state.authReady = true;
  updateAuthBadge();
  applyRoleAccess();
  setAppLocked(false);
  closeAuthModal();
  setActiveTab(state.activeTab);
}

async function logoutUser(message = "Logged out") {
  closeResetPasswordModal();
  closeUserStatusModal();
  closeBarcodeModal();
  closeSetStockModal();
  closeBillModal();
  setMobileCartOpen(false);

  if (state.scannerRunning) {
    await closeScannerModal();
  }

  if (state.upiModalOpen) {
    closeUpiModal();
  }

  state.authUser = null;
  state.authReady = false;
  state.paymentSettingsLoaded = false;
  state.paymentSettings = {
    shopId: "",
    upiId: "",
    qrImage: "",
    configured: false,
  };
  paymentQrMarkedForRemoval = false;
  setAccessToken("");
  updateAuthBadge();
  applyRoleAccess();
  setAppLocked(true);
  openAuthModal(message);
}

async function restoreSession() {
  if (!getAccessToken()) {
    return false;
  }

  try {
    const response = await api.getCurrentUser();
    applyAuthenticatedUser(response.data);
    return true;
  } catch (error) {
    setAccessToken("");
    return false;
  }
}

async function authenticateWithCredentials({ bootstrap = false } = {}) {
  const username = elements.authUsername.value.trim();
  const password = elements.authPassword.value;

  if (!username || !password) {
    setAuthError("Username and password are required.");
    return false;
  }

  setAuthLoadingState(true);
  setAuthError("");

  try {
    const response = bootstrap
      ? await api.bootstrapAdmin({ username, password, displayName: username })
      : await api.login({ username, password });

    const token = response.data?.token;
    const user = response.data?.user;
    if (!token || !user) {
      throw new Error("Invalid authentication response");
    }

    setAccessToken(token);
    applyAuthenticatedUser(user);
    await loadInitialData();
    showToast(bootstrap ? "Admin account created and logged in" : "Login successful", "success");
    return true;
  } catch (error) {
    setAuthError(error.message || "Authentication failed");
    return false;
  } finally {
    setAuthLoadingState(false);
  }
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

function normalizePaymentSettings(payload = {}) {
  const normalizedUpiId = String(payload.upiId || "").trim().toLowerCase();

  return {
    shopId: String(payload.shopId || "").trim(),
    upiId: normalizedUpiId,
    qrImage: String(payload.qrImage || "").trim(),
    configured: Boolean(payload.configured || normalizedUpiId),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected image"));

    reader.readAsDataURL(file);
  });
}

function updatePaymentSettingsState(settingsData = {}) {
  state.paymentSettings = {
    ...state.paymentSettings,
    ...normalizePaymentSettings(settingsData),
  };
  state.paymentSettingsLoaded = true;
}

function renderPaymentSettingsForm() {
  if (!elements.paymentSettingsForm || !elements.paymentUpiIdInput) {
    return;
  }

  elements.paymentUpiIdInput.value = state.paymentSettings.upiId;

  const hasSavedQrImage = Boolean(state.paymentSettings.qrImage && !paymentQrMarkedForRemoval);
  if (elements.paymentQrPreviewWrap && elements.paymentQrPreview) {
    elements.paymentQrPreviewWrap.classList.toggle("hidden", !hasSavedQrImage);
    if (hasSavedQrImage) {
      elements.paymentQrPreview.src = state.paymentSettings.qrImage;
    } else {
      elements.paymentQrPreview.removeAttribute("src");
    }
  }

  if (elements.paymentQrHint) {
    elements.paymentQrHint.textContent = hasSavedQrImage
      ? "Saved QR image is active for UPI checkout."
      : "Leave empty to use dynamic QR generated from UPI ID and bill amount.";
  }

  if (elements.paymentSettingsRemoveQrButton) {
    elements.paymentSettingsRemoveQrButton.disabled = !hasSavedQrImage;
  }
}

async function loadPaymentSettings({ silent = false } = {}) {
  try {
    const response = await api.getPaymentSettings();
    updatePaymentSettingsState(response?.data || {});
    paymentQrMarkedForRemoval = false;
    renderPaymentSettingsForm();
    return state.paymentSettings;
  } catch (error) {
    state.paymentSettingsLoaded = false;
    if (!silent) {
      showToast(error.message || "Unable to load payment settings", "error");
    }
    return null;
  }
}

async function ensurePaymentSettingsLoaded() {
  if (state.paymentSettingsLoaded) {
    return state.paymentSettings;
  }

  return loadPaymentSettings({ silent: true });
}

async function resolveQrImageFromFormInput() {
  const selectedFile = elements.paymentQrFileInput?.files?.[0] || null;
  if (selectedFile) {
    return readFileAsDataUrl(selectedFile);
  }

  if (paymentQrMarkedForRemoval) {
    return "";
  }

  return state.paymentSettings.qrImage || "";
}

function buildUpiPaymentLink(amount, upiId, shopName = UPI_CONFIG.defaultShopName) {
  const payeeAddress = String(upiId || "").trim().toLowerCase();
  if (!payeeAddress) {
    return "";
  }

  const params = new URLSearchParams({
    pa: payeeAddress,
    pn: String(shopName || UPI_CONFIG.defaultShopName).trim() || UPI_CONFIG.defaultShopName,
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

function renderUpiQrCode(upiPaymentLink, qrImage = "") {
  const uploadedQrImage = String(qrImage || "").trim();
  if (uploadedQrImage) {
    state.upiQrRenderToken += 1;
    elements.upiQrRoot.innerHTML = "";

    const imageElement = document.createElement("img");
    imageElement.src = uploadedQrImage;
    imageElement.alt = "UPI QR";
    elements.upiQrRoot.appendChild(imageElement);
    return;
  }

  const renderToken = (state.upiQrRenderToken += 1);
  elements.upiQrRoot.innerHTML = "";
  elements.upiQrRoot.innerHTML =
    '<p class="text-xs text-slate-500 text-center">Loading QR code...</p>';

  void ensureQRCodeLoaded().then((QRCode) => {
    if (renderToken !== state.upiQrRenderToken) {
      return;
    }

    if (!QRCode) {
      elements.upiQrRoot.innerHTML =
        '<p class="text-xs text-slate-500 text-center">QR generator unavailable. Use Open UPI App.</p>';
      return;
    }

    elements.upiQrRoot.innerHTML = "";
    upiQrCodeInstance = new QRCode(elements.upiQrRoot, {
      text: upiPaymentLink,
      width: 220,
      height: 220,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  });
}

function refreshUpiModalContentFromSession(sessionData) {
  const fallbackLink = buildUpiPaymentLink(
    sessionData.amount || 0,
    sessionData.upiId,
    sessionData.shopName || UPI_CONFIG.defaultShopName
  );
  elements.upiAmountValue.textContent = formatCurrency(sessionData.amount || 0);
  elements.upiShopName.textContent = sessionData.shopName || UPI_CONFIG.defaultShopName;
  elements.upiIdValue.textContent = sessionData.upiId || "-";
  elements.upiOpenAppLink.href = sessionData.upiLink || fallbackLink;
  renderUpiQrCode(
    sessionData.qrValue || sessionData.paymentUrl || sessionData.upiLink || fallbackLink,
    sessionData.qrImage || ""
  );
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
    restoreModalFocus(elements.upiModal);
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
  closeUpiModal({ resetCheckout: false });
  const result = await completeCheckout(pendingCheckout.context, pendingCheckout.payload, {
    successMessage: "UPI payment successful",
    offlineMessage: "UPI transaction saved offline. It will sync when online.",
  });

  if (result.success) {
    state.pendingUpiCheckout = null;
    return result;
  }

  await openUpiModal(pendingCheckout.context);
  setUpiPaymentStatus("Payment failed. Retry or cancel.", "error");
  setUpiActionButtonsState({ disabled: false, label: "Payment Done" });
  return result;
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

  const paymentSettings = await ensurePaymentSettingsLoaded();
  const upiId = String(paymentSettings?.upiId || "").trim().toLowerCase();
  if (!upiId) {
    showToast("UPI is not configured. Ask admin to update Payment Settings.", "error");
    if (state.authUser?.role === "admin") {
      setActiveTab("admin");
    }
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

  setMobileCartOpen(false);

  const payload = buildCheckoutPayload(normalizedContext);
  const shopName = String(paymentSettings?.shopId || UPI_CONFIG.defaultShopName).trim() || UPI_CONFIG.defaultShopName;
  const upiLink = buildUpiPaymentLink(normalizedContext.total, upiId, shopName);

  const fallbackSessionData = {
    amount: normalizedContext.total,
    upiId,
    shopName,
    upiLink,
    qrValue: upiLink,
    qrImage: String(paymentSettings?.qrImage || ""),
    pollEveryMs: 0,
    expiresAt: new Date(Date.now() + UPI_CONFIG.sessionTimeoutMs).toISOString(),
  };

  state.pendingUpiCheckout = {
    context: normalizedContext,
    payload,
    sessionId: null,
    pollEveryMs: 0,
    sessionSnapshot: fallbackSessionData,
  };

  refreshUpiModalContentFromSession(fallbackSessionData);
  setUpiPaymentStatus("Scan QR and pay. Then tap Payment Done.", "waiting");
  setUpiActionButtonsState({ disabled: false, label: "Payment Done" });

  state.upiModalOpen = true;
  startUpiCountdown(Date.now() + UPI_CONFIG.sessionTimeoutMs);

  rememberModalFocus(elements.upiModal);
  elements.upiModal.classList.remove("hidden");
  requestAnimationFrame(() => {
    elements.upiModal.classList.add("modal-upi-visible");
  });
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

function logScannerDebug(message, details = null) {
  if (!SCANNER_DEBUG_ENABLED) {
    return;
  }

  if (details) {
    console.info(`[scanner] ${message}`, details);
    return;
  }

  console.info(`[scanner] ${message}`);
}

function normalizeBarcode(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function isLikelyBarcodeValue(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue || rawValue.length > KEYBOARD_WEDGE_CONFIG.maxBufferLength) {
    return false;
  }

  if (/\s/.test(rawValue)) {
    return false;
  }

  return normalizeBarcode(rawValue).length >= KEYBOARD_WEDGE_CONFIG.minCodeLength;
}

function resetKeyboardWedgeBuffer() {
  keyboardWedgeBuffer = "";
  keyboardWedgeLastAt = 0;
}

function isEditableElement(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function handleKeyboardWedgeKeydown(event) {
  if (!state.authReady || state.activeTab !== "pos") {
    resetKeyboardWedgeBuffer();
    return;
  }

  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  const target = event.target;
  if (isEditableElement(target) && target !== elements.searchInput) {
    resetKeyboardWedgeBuffer();
    return;
  }

  const key = String(event.key || "");
  const now = Date.now();

  if (key === "Enter") {
    const scannedValue = keyboardWedgeBuffer;
    resetKeyboardWedgeBuffer();

    if (isLikelyBarcodeValue(scannedValue)) {
      event.preventDefault();
      void applyScannedBarcode(scannedValue, "Scanned");
    }

    return;
  }

  if (key.length !== 1 || !/^[0-9A-Za-z\-._/]+$/.test(key)) {
    if (key !== "Shift") {
      resetKeyboardWedgeBuffer();
    }
    return;
  }

  const shouldResetBuffer = now - keyboardWedgeLastAt > KEYBOARD_WEDGE_CONFIG.interKeyTimeoutMs;
  keyboardWedgeBuffer = shouldResetBuffer
    ? key
    : `${keyboardWedgeBuffer}${key}`.slice(-KEYBOARD_WEDGE_CONFIG.maxBufferLength);
  keyboardWedgeLastAt = now;
}

function isScannerSourceLabel(sourceLabel) {
  return String(sourceLabel || "").trim().toLowerCase() === "scanned";
}

function isScanBlocked(normalizedCode) {
  if (scanGuardActive) {
    return true;
  }

  if (!normalizedCode) {
    return false;
  }

  const now = Date.now();
  return (
    normalizedCode === lastScannedCode &&
    now - lastScannedAt < SCAN_GUARD_CONFIG.duplicateWindowMs
  );
}

function activateScanGuard(normalizedCode) {
  scanGuardActive = true;
  lastScannedCode = normalizedCode;
  lastScannedAt = Date.now();

  if (scanGuardTimeoutId) {
    window.clearTimeout(scanGuardTimeoutId);
  }

  scanGuardTimeoutId = window.setTimeout(() => {
    scanGuardActive = false;
  }, SCAN_GUARD_CONFIG.cooldownMs);
}

function markCartProductAdded(productId) {
  const normalizedProductId = String(productId || "");
  if (!normalizedProductId) {
    return;
  }

  lastCartHighlightProductId = normalizedProductId;

  if (cartHighlightTimeoutId) {
    window.clearTimeout(cartHighlightTimeoutId);
  }

  cartHighlightTimeoutId = window.setTimeout(() => {
    lastCartHighlightProductId = "";
    renderCart();
  }, 900);
}

function normalizeProductEntry(product = {}) {
  return {
    ...product,
    barcode: String(product.barcode || "").trim(),
  };
}

function normalizeProductEntries(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products.map((product) => normalizeProductEntry(product));
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

function getBarcodeMatchScore(dbCode, scannedCode) {
  if (!dbCode || !scannedCode) {
    return 0;
  }

  if (dbCode === scannedCode) {
    return 3;
  }

  if (
    dbCode.length >= MIN_PARTIAL_BARCODE_LENGTH &&
    scannedCode.length >= MIN_PARTIAL_BARCODE_LENGTH
  ) {
    if (dbCode.includes(scannedCode)) {
      return 2;
    }

    if (scannedCode.includes(dbCode)) {
      return 1;
    }
  }

  return 0;
}

function findBestBarcodeMatch(products, candidates) {
  let matchedProduct = null;
  let matchedCandidate = "";
  let matchedScore = 0;

  for (const product of products) {
    const dbCode = normalizeBarcode(product?.barcode);
    if (!dbCode) {
      continue;
    }

    for (const candidate of candidates) {
      const score = getBarcodeMatchScore(dbCode, candidate);
      if (score > matchedScore) {
        matchedScore = score;
        matchedProduct = product;
        matchedCandidate = candidate;
      }

      if (score === 3) {
        break;
      }
    }

    if (matchedScore === 3) {
      break;
    }
  }

  return {
    product: matchedProduct,
    candidate: matchedCandidate,
    score: matchedScore,
  };
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
  const allowedTabs = getAllowedTabsForRole(state.authUser?.role);
  if (!allowedTabs.has(tabName)) {
    return;
  }

  state.activeTab = tabName;

  if (tabName !== "pos") {
    setMobileCartOpen(false);

    if (isModalVisible(elements.scannerModal)) {
      void closeScannerModal();
    }
  }

  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("tab-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  elements.tabPanels.forEach((panel) => {
    const isHidden = panel.dataset.tabPanel !== tabName || !allowedTabs.has(panel.dataset.tabPanel);
    panel.classList.toggle("hidden", isHidden);
    panel.setAttribute("aria-hidden", isHidden ? "true" : "false");
  });

  if (window.matchMedia("(max-width: 768px)").matches) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  syncMobileCartRail();

  void ensureTabData(tabName);
}

async function ensureTabData(tabName) {
  if (!state.authReady) {
    return;
  }

  if (tabName === "admin" && state.authUser?.role === "admin") {
    await loadPaymentSettings({ silent: false });
  }

  if (tabName === "admin" && state.authUser?.role === "admin" && !state.adminUsersLoaded) {
    const loaded = await loadAdminUsers();
    state.adminUsersLoaded = loaded;
  }

  if (tabName === "dashboard" && !state.dashboardLoaded) {
    state.dashboardLoaded = true;
    await loadDashboard();
  }

  if (tabName === "history" && !state.historyLoaded) {
    state.historyLoaded = true;
    await loadSalesHistory();
  }
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

function setMobileCartOpen(isOpen) {
  if (!elements.mobileCartSheet || !elements.mobileCartBackdrop) {
    return;
  }

  const shouldOpen =
    Boolean(isOpen) &&
    isMobileViewport() &&
    state.activeTab === "pos" &&
    state.cart.length > 0;

  state.mobileCartOpen = shouldOpen;
  elements.mobileCartSheet.classList.toggle("mobile-cart-sheet-open", shouldOpen);
  elements.mobileCartBackdrop.classList.toggle("hidden", !shouldOpen);
  document.body.classList.toggle("mobile-cart-sheet-open", shouldOpen);

  if (shouldOpen && elements.mobileCartCloseButton) {
    elements.mobileCartCloseButton.focus();
  }

  syncMobileCartRail();
}

function syncMobileCartRail() {
  if (!elements.mobileCartRail || !elements.mobileCartItemCount || !elements.mobileCartTotalValue) {
    return;
  }

  const itemCount = state.cart.reduce((count, item) => count + item.quantity, 0);
  const total = getCartTotal();

  elements.mobileCartItemCount.textContent = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  elements.mobileCartTotalValue.textContent = formatCurrency(total);

  const railAllowed = isMobileViewport() && state.activeTab === "pos" && itemCount > 0;
  const shouldShowRail = railAllowed && !state.mobileCartOpen;
  elements.mobileCartRail.classList.toggle("hidden", !shouldShowRail);

  if (!railAllowed && state.mobileCartOpen) {
    setMobileCartOpen(false);
  }
}

function renderCart() {
  if (!state.cart.length) {
    elements.cartList.innerHTML = '<p class="text-sm text-slate-500 px-3 py-4">Your cart is empty.</p>';
  } else {
    elements.cartList.innerHTML = state.cart
      .map(
        (item) => `
        <div class="cart-row ${lastCartHighlightProductId === item.productId ? "cart-row-added" : ""}">
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

  syncMobileCartRail();

  if (!state.cart.length) {
    setMobileCartOpen(false);
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
      '<tr class="table-empty-row"><td colspan="7" class="px-4 py-4 text-center text-slate-500">No products available.</td></tr>';
    return;
  }

  elements.productTableBody.innerHTML = products
    .map(
      (product) => `
      <tr>
        <td class="px-3 py-3" data-label="Name">${product.name}</td>
        <td class="px-3 py-3" data-label="Barcode">${product.barcode}</td>
        <td class="px-3 py-3" data-label="Category">${product.category || "General"}</td>
        <td class="px-3 py-3" data-label="Price">${formatCurrency(product.price)}</td>
        <td class="px-3 py-3" data-label="Stock">
          <span class="stock-pill ${product.stock <= 5 ? "stock-pill-low" : "stock-pill-ok"}">${product.stock}</span>
        </td>
        <td class="px-3 py-3" data-label="Status">${product.isActive ? "Active" : "Inactive"}</td>
        <td class="px-3 py-3" data-label="Actions">
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

function renderAdminUsersTable() {
  if (!elements.userTableBody) {
    return;
  }

  const users = [...state.adminUsers].sort((a, b) =>
    String(a.username || "").localeCompare(String(b.username || ""))
  );

  if (!users.length) {
    elements.userTableBody.innerHTML =
      '<tr class="table-empty-row"><td colspan="6" class="px-4 py-4 text-center text-slate-500">No users found.</td></tr>';
    return;
  }

  const currentUserId = getUserId(state.authUser);

  elements.userTableBody.innerHTML = users
    .map((user) => {
      const userId = getUserId(user);
      const isCurrentUser = userId === currentUserId;
      const activeClass = user.isActive ? "user-status-active" : "user-status-inactive";
      const statusLabel = user.isActive ? "Active" : "Inactive";
      const toggleLabel = isCurrentUser ? "Current Account" : user.isActive ? "Deactivate" : "Activate";
      const disableToggle = isCurrentUser ? "disabled" : "";

      return `
      <tr>
        <td class="px-3 py-3" data-label="Username">${user.username || "-"}</td>
        <td class="px-3 py-3" data-label="Display Name">${user.displayName || "-"}</td>
        <td class="px-3 py-3 uppercase" data-label="Role">${user.role || "cashier"}</td>
        <td class="px-3 py-3" data-label="Status">
          <span class="user-status-pill ${activeClass}">${statusLabel}</span>
        </td>
        <td class="px-3 py-3" data-label="Last Login">${formatDateTime(user.lastLoginAt)}</td>
        <td class="px-3 py-3" data-label="Actions">
          <div class="admin-actions">
            <button class="table-btn" data-user-action="reset-password" data-user-id="${userId}">Reset Password</button>
            <button class="table-btn ${user.isActive ? "danger" : ""}" data-user-action="toggle-status" data-user-id="${userId}" ${disableToggle}>${toggleLabel}</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function renderHistoryTable() {
  if (!state.salesHistory.length) {
    elements.historyTableBody.innerHTML =
      '<tr class="table-empty-row"><td colspan="6" class="px-4 py-4 text-center text-slate-500">No transactions found.</td></tr>';
    return;
  }

  elements.historyTableBody.innerHTML = state.salesHistory
    .map(
      (sale) => `
      <tr>
        <td class="px-3 py-3" data-label="Bill No">${sale.billNumber}</td>
        <td class="px-3 py-3" data-label="Date/Time">${new Date(sale.createdAt).toLocaleString()}</td>
        <td class="px-3 py-3 uppercase" data-label="Mode">${sale.paymentMethod}</td>
        <td class="px-3 py-3" data-label="Items">${sale.items.length}</td>
        <td class="px-3 py-3 font-semibold" data-label="Total">${formatCurrency(sale.total)}</td>
        <td class="px-3 py-3" data-label="Cashier">${sale.cashier || "Default Cashier"}</td>
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

function mergeReportFilters(serverFilters, fallbackFilters) {
  return {
    startDate: String(serverFilters?.startDate || fallbackFilters?.startDate || "").slice(0, 10),
    endDate: String(serverFilters?.endDate || fallbackFilters?.endDate || "").slice(0, 10),
    paymentMethod: String(serverFilters?.paymentMethod || fallbackFilters?.paymentMethod || "all").toLowerCase(),
  };
}

function getSalesReportColumns({ forPdf = false } = {}) {
  const amountFormatter = forPdf ? (value) => formatCurrency(value) : (value) => formatAmountForCsv(value);

  return [
    {
      header: "Date",
      getValue: (row) => row.date || "-",
    },
    {
      header: "Transactions",
      getValue: (row) => String(row.transactions ?? 0),
    },
    {
      header: "Items Sold",
      getValue: (row) => String(row.totalItems ?? 0),
    },
    {
      header: "Revenue",
      getValue: (row) => amountFormatter(row.totalRevenue),
    },
    {
      header: "Tax",
      getValue: (row) => amountFormatter(row.totalTax),
    },
    {
      header: "Discount",
      getValue: (row) => amountFormatter(row.totalDiscount),
    },
  ];
}

function getTransactionsReportColumns({ forPdf = false } = {}) {
  const amountFormatter = forPdf ? (value) => formatCurrency(value) : (value) => formatAmountForCsv(value);

  return [
    {
      header: "Bill No",
      getValue: (row) => row.billNumber || "-",
    },
    {
      header: "Date/Time",
      getValue: (row) => formatDateTime(row.dateTime),
    },
    {
      header: "Mode",
      getValue: (row) => String(row.paymentMethod || "").toUpperCase() || "-",
    },
    {
      header: "Items",
      getValue: (row) => String(row.itemsCount ?? 0),
    },
    {
      header: "Item Details",
      getValue: (row) => row.items || "-",
    },
    {
      header: "Total",
      getValue: (row) => amountFormatter(row.total),
    },
    {
      header: "Paid",
      getValue: (row) => amountFormatter(row.paidAmount),
    },
    {
      header: "Change",
      getValue: (row) => amountFormatter(row.changeDue),
    },
    {
      header: "Cashier",
      getValue: (row) => row.cashier || "Default Cashier",
    },
    {
      header: "Source",
      getValue: (row) => row.source || "online",
    },
  ];
}

function exportCsvReport({ filePrefix, filters, columns, records }) {
  const csvContent = buildCsvContent(columns, records);
  const fileName = buildReportFileName(filePrefix, "csv", filters);

  downloadFile({
    content: csvContent,
    fileName,
    mimeType: "text/csv;charset=utf-8",
  });
}

async function exportPdfReport({ title, filePrefix, filters, summaryLines, columns, records }) {
  const fileName = buildReportFileName(filePrefix, "pdf", filters);

  await exportTablePdf({
    title,
    subtitleLines: summaryLines,
    columns,
    rows: records,
    fileName,
  });
}

async function handleDashboardReportExport(format) {
  if (state.authUser?.role !== "admin") {
    showToast("Only admins can export reports", "error");
    return;
  }

  if (state.dashboardReportExporting) {
    return;
  }

  let requestContext;
  try {
    requestContext = buildReportQueryFromInputs({
      startInput: elements.dashboardReportStartDateInput,
      endInput: elements.dashboardReportEndDateInput,
      paymentInput: elements.dashboardReportPaymentMethodInput,
      limit: 1000,
    });
  } catch (error) {
    showToast(error.message || "Invalid dashboard report filters", "error");
    return;
  }

  const buttons = [elements.dashboardExportCsvButton, elements.dashboardExportPdfButton];
  const activeButton = format === "pdf" ? elements.dashboardExportPdfButton : elements.dashboardExportCsvButton;

  state.dashboardReportExporting = true;
  setExportButtonsBusy({
    buttons,
    activeButton,
    loadingLabel: format === "pdf" ? "Exporting PDF..." : "Exporting CSV...",
    busy: true,
  });

  try {
    const response = await api.getSalesReport(requestContext.query);
    const reportData = response?.data || {};
    const records = Array.isArray(reportData.records) ? reportData.records : [];

    if (!records.length) {
      showToast("No sales records found for selected filters", "warning");
      return;
    }

    const filters = mergeReportFilters(reportData.filters, requestContext.filters);
    const summary = reportData.summary || {};

    if (format === "pdf") {
      await exportPdfReport({
        title: "Sales Report",
        filePrefix: "sales_report",
        filters,
        summaryLines: [
          `Range: ${formatReportDateRangeLabel(filters.startDate, filters.endDate)}`,
          `Payment Mode: ${formatPaymentMethodLabel(filters.paymentMethod)}`,
          `Revenue: ${formatCurrency(summary.totalRevenue || 0)} | Transactions: ${summary.totalTransactions || 0} | Items: ${summary.totalItems || 0}`,
        ],
        columns: getSalesReportColumns({ forPdf: true }),
        records,
      });
    } else {
      exportCsvReport({
        filePrefix: "sales_report",
        filters,
        columns: getSalesReportColumns(),
        records,
      });
    }

    showToast(`Sales report ${format.toUpperCase()} exported`, "success");
  } catch (error) {
    showToast(error.message || "Unable to export sales report", "error");
  } finally {
    state.dashboardReportExporting = false;
    setExportButtonsBusy({
      buttons,
      activeButton,
      loadingLabel: "",
      busy: false,
    });
  }
}

async function handleHistoryReportExport(format) {
  if (state.authUser?.role !== "admin") {
    showToast("Only admins can export reports", "error");
    return;
  }

  if (state.historyReportExporting) {
    return;
  }

  let requestContext;
  try {
    requestContext = buildReportQueryFromInputs({
      startInput: elements.historyReportStartDateInput,
      endInput: elements.historyReportEndDateInput,
      paymentInput: elements.historyReportPaymentMethodInput,
      limit: 1000,
    });
  } catch (error) {
    showToast(error.message || "Invalid transaction report filters", "error");
    return;
  }

  const buttons = [elements.historyExportCsvButton, elements.historyExportPdfButton];
  const activeButton = format === "pdf" ? elements.historyExportPdfButton : elements.historyExportCsvButton;

  state.historyReportExporting = true;
  setExportButtonsBusy({
    buttons,
    activeButton,
    loadingLabel: format === "pdf" ? "Exporting PDF..." : "Exporting CSV...",
    busy: true,
  });

  try {
    const response = await api.getTransactionsReport(requestContext.query);
    const reportData = response?.data || {};
    const records = Array.isArray(reportData.records) ? reportData.records : [];

    if (!records.length) {
      showToast("No transactions found for selected filters", "warning");
      return;
    }

    const filters = mergeReportFilters(reportData.filters, requestContext.filters);
    const summary = reportData.summary || {};

    if (format === "pdf") {
      await exportPdfReport({
        title: "Transactions Report",
        filePrefix: "transactions_report",
        filters,
        summaryLines: [
          `Range: ${formatReportDateRangeLabel(filters.startDate, filters.endDate)}`,
          `Payment Mode: ${formatPaymentMethodLabel(filters.paymentMethod)}`,
          `Revenue: ${formatCurrency(summary.totalRevenue || 0)} | Transactions: ${summary.totalTransactions || 0} | Records Returned: ${summary.returnedRecords || records.length}`,
        ],
        columns: getTransactionsReportColumns({ forPdf: true }),
        records,
      });
    } else {
      exportCsvReport({
        filePrefix: "transactions_report",
        filters,
        columns: getTransactionsReportColumns(),
        records,
      });
    }

    showToast(`Transactions report ${format.toUpperCase()} exported`, "success");
  } catch (error) {
    showToast(error.message || "Unable to export transactions report", "error");
  } finally {
    state.historyReportExporting = false;
    setExportButtonsBusy({
      buttons,
      activeButton,
      loadingLabel: "",
      busy: false,
    });
  }
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
    return false;
  }

  const existingItem = state.cart.find((item) => item.productId === product._id);
  const currentQty = existingItem ? existingItem.quantity : 0;

  if (currentQty + quantity > product.stock) {
    showToast("Not enough stock available", "error");
    return false;
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

  markCartProductAdded(product._id);
  renderCart();
  return true;
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

  rememberModalFocus(elements.billModal);
  elements.billModal.classList.remove("hidden");
}

function closeBillModal() {
  elements.billModal.classList.add("hidden");
  restoreModalFocus(elements.billModal);
}

async function loadProducts() {
  try {
    const response = await api.getProducts({ limit: 500 });
    state.products = normalizeProductEntries(response.data);
    setCachedProducts(state.products);
    setLastSyncTimestamp();
    updateSyncInfo();
  } catch (error) {
    const cachedProducts = getCachedProducts();
    if (cachedProducts.length) {
      state.products = normalizeProductEntries(cachedProducts);
      showToast("Using cached products while offline", "warning");
    } else {
      state.products = [];
      showToast(error.message || "Unable to load products", "error");
    }
  }

  renderProductResults();
  renderProductTable();
}

async function loadAdminUsers() {
  if (state.authUser?.role !== "admin") {
    state.adminUsers = [];
    renderAdminUsersTable();
    return false;
  }

  try {
    const response = await api.getUsers();
    state.adminUsers = Array.isArray(response.data) ? response.data : [];
    renderAdminUsersTable();
    return true;
  } catch (error) {
    state.adminUsers = [];
    renderAdminUsersTable();
    showToast(error.message || "Unable to load users", "error");
    return false;
  }
}

async function loadSalesHistory() {
  let query = { limit: 20 };

  try {
    query = getHistoryApiFilters();
  } catch (error) {
    showToast(error.message || "Invalid history filters", "error");
    state.salesHistory = [];
    renderHistoryTable();
    return;
  }

  try {
    const response = await api.getSalesHistory(query);
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
      const normalizedPaymentMethod =
        String(pending?.payload?.paymentMethod || "").toLowerCase() === "card"
          ? "upi"
          : pending.payload?.paymentMethod;

      await api.processBilling({
        ...pending.payload,
        paymentMethod: normalizedPaymentMethod,
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

async function loadInitialData() {
  state.adminUsers = [];
  state.adminUsersLoaded = false;
  state.dashboardLoaded = false;
  state.historyLoaded = false;
  state.paymentSettingsLoaded = false;
  state.products = [];
  state.salesHistory = [];

  renderAdminUsersTable();

  await loadProducts();
  await loadPaymentSettings({ silent: true });
  await loadLowStockAlert();
  await syncPendingSales();
}

async function handleCheckout() {
  if (!state.authReady) {
    setAppLocked(true);
    openAuthModal("Please sign in to continue.");
    return;
  }

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
  if (!candidates.length) {
    return null;
  }

  const localMatch = findBestBarcodeMatch(state.products, candidates);

  logScannerDebug("Local barcode lookup finished", {
    candidates,
    matchType:
      localMatch.score === 3 ? "exact" : localMatch.score > 0 ? "partial" : "none",
    matchedProduct: localMatch.product
      ? {
          id: localMatch.product._id,
          name: localMatch.product.name,
          barcode: String(localMatch.product.barcode || "").trim(),
          barcodeLength: String(localMatch.product.barcode || "").trim().length,
          candidateLength: localMatch.candidate.length,
        }
      : null,
  });

  return localMatch.product || null;
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
        const normalizedProduct = normalizeProductEntry(response.data);
        const existingIndex = state.products.findIndex((product) => product._id === normalizedProduct._id);
        if (existingIndex >= 0) {
          state.products[existingIndex] = normalizedProduct;
        } else {
          state.products.unshift(normalizedProduct);
        }

        logScannerDebug("Remote exact barcode lookup matched", {
          candidate,
          candidateLength: candidate.length,
          product: {
            id: normalizedProduct._id,
            name: normalizedProduct.name,
            barcode: normalizedProduct.barcode,
            barcodeLength: normalizedProduct.barcode.length,
          },
        });

        return normalizedProduct;
      }
    } catch (error) {
      // Continue to next candidate until a valid barcode lookup succeeds.
    }
  }

  const searchSeed = candidates[0] || "";
  if (searchSeed.length >= MIN_PARTIAL_BARCODE_LENGTH) {
    try {
      const response = await api.getProducts({ search: searchSeed, limit: 60 });
      const remoteProducts = normalizeProductEntries(response?.data);
      const remoteMatch = findBestBarcodeMatch(remoteProducts, candidates);

      if (remoteMatch.product) {
        const existingIndex = state.products.findIndex((product) => product._id === remoteMatch.product._id);
        if (existingIndex >= 0) {
          state.products[existingIndex] = remoteMatch.product;
        } else {
          state.products.unshift(remoteMatch.product);
        }

        logScannerDebug("Remote partial barcode lookup matched", {
          searchSeed,
          candidates,
          candidateUsed: remoteMatch.candidate,
          matchType: remoteMatch.score === 3 ? "exact" : "partial",
          product: {
            id: remoteMatch.product._id,
            name: remoteMatch.product.name,
            barcode: remoteMatch.product.barcode,
            barcodeLength: remoteMatch.product.barcode.length,
          },
        });

        return remoteMatch.product;
      }

      logScannerDebug("Remote partial barcode lookup found no match", {
        searchSeed,
        candidates,
        remoteResultCount: remoteProducts.length,
      });
    } catch (error) {
      logScannerDebug("Remote partial barcode lookup failed", {
        searchSeed,
        message: error?.message || "Unknown error",
      });
    }
  }

  return null;
}

async function applyScannedBarcode(code, sourceLabel = "Scanned") {
  const rawCode = String(code || "");
  const normalizedCode = normalizeBarcode(rawCode);
  const scannerSource = isScannerSourceLabel(sourceLabel);

  logScannerDebug("Barcode captured", {
    source: sourceLabel,
    rawCode,
    rawLength: rawCode.length,
    normalizedCode,
    normalizedLength: normalizedCode.length,
  });

  if (!normalizedCode) {
    showToast("Product not found for scanned barcode", "warning");
    return false;
  }

  if (scannerSource && isScanBlocked(normalizedCode)) {
    logScannerDebug("Scanner input ignored by cooldown/duplicate guard", {
      source: sourceLabel,
      normalizedCode,
      normalizedLength: normalizedCode.length,
    });
    return false;
  }

  if (scannerSource) {
    activateScanGuard(normalizedCode);
  }

  elements.searchInput.value = normalizedCode;
  renderProductResults();

  const resolvedProduct = await resolveProductByBarcode(normalizedCode);
  if (resolvedProduct) {
    const dbCode = String(resolvedProduct.barcode || "").trim();

    logScannerDebug("Barcode matched product", {
      source: sourceLabel,
      scannedCode: normalizedCode,
      scannedLength: normalizedCode.length,
      dbBarcode: dbCode,
      dbBarcodeLength: dbCode.length,
      productId: resolvedProduct._id,
      productName: resolvedProduct.name,
    });

    const added = addToCart(resolvedProduct, 1);
    if (!added) {
      return false;
    }

    renderProductTable();
    showToast(
      scannerSource ? `Product added: ${resolvedProduct.name}` : `${sourceLabel}: ${resolvedProduct.name}`,
      "success"
    );
    return true;
  } else {
    logScannerDebug("No product matched scanned barcode", {
      source: sourceLabel,
      scannedCode: normalizedCode,
      scannedLength: normalizedCode.length,
      candidates: getBarcodeCandidates(normalizedCode),
    });
    showToast("Product not found for scanned barcode", "warning");
    return false;
  }
}

function promptManualBarcodeEntry() {
  openBarcodeModal();
}

function setScannerStatus(message, tone = "info") {
  if (!elements.scannerStatus) {
    return;
  }

  elements.scannerStatus.textContent = String(message || "");
  elements.scannerStatus.dataset.tone = String(tone || "info");
}

function openScannerModal() {
  if (!elements.scannerModal) {
    return;
  }

  if (elements.scannerModal.classList.contains("hidden")) {
    rememberModalFocus(elements.scannerModal);
  }

  elements.scannerModal.classList.remove("hidden");
  setScannerStatus("Align barcode within the box and hold steady", "info");
}

async function stopScanner() {
  if (barcodeScanner) {
    await barcodeScanner.stop();
  }

  state.scannerRunning = false;
}

async function closeScannerModal() {
  await stopScanner();
  elements.scannerModal.classList.add("hidden");
  restoreModalFocus(elements.scannerModal);
}

function focusSearchFallbackFromScanner() {
  void closeScannerModal().finally(() => {
    setActiveTab("pos");
    elements.searchInput.focus();
    showToast("Type product name in Search Product as backup", "info");
  });
}

function ensureBarcodeScanner() {
  if (barcodeScanner) {
    return barcodeScanner;
  }

  barcodeScanner = createBarcodeScanner({
    stageElement: elements.scannerStage,
    viewportElement: elements.scannerViewport,
    statusElement: elements.scannerStatus,
    loadingElement: elements.scannerLoading,
    startButton: elements.scannerStartButton,
    stopButton: elements.scannerStopButton,
    torchButton: elements.scannerTorchButton,
    debug: SCANNER_DEBUG_ENABLED,
    ...SCANNER_CONFIG,
    onStatus: (message, tone) => {
      setScannerStatus(message, tone);
    },
    onError: (message) => {
      showToast(message, "error");
    },
    onNoDetection: () => {
      showToast("No barcode detected. Try better lighting or hold steady", "warning");
      void closeScannerModal().finally(() => {
        promptManualBarcodeEntry();
      });
    },
    onDetected: async ({ code, rawValue, format, engine }) => {
      logScannerDebug("Scanner accepted barcode", {
        code,
        rawValue,
        format,
        engine,
      });

      await stopScanner();
      elements.scannerModal.classList.add("hidden");
      restoreModalFocus(elements.scannerModal);
      await applyScannedBarcode(code, "Scanned");
      state.scannerRunning = false;
    },
  });

  return barcodeScanner;
}

async function startScanner() {
  openScannerModal();

  const scanner = ensureBarcodeScanner();
  const started = await scanner.start();
  state.scannerRunning = started;

  if (!started) {
    await closeScannerModal();
    promptManualBarcodeEntry();
  }
}

async function toggleScannerTorch() {
  if (!barcodeScanner) {
    return;
  }

  await barcodeScanner.toggleTorch();
}

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });

  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await authenticateWithCredentials({ bootstrap: false });
  });

  elements.authBootstrapButton.addEventListener("click", async () => {
    await authenticateWithCredentials({ bootstrap: true });
  });

  elements.logoutButton.addEventListener("click", () => {
    void logoutUser("Logged out successfully.");
  });

  elements.searchInput.addEventListener("input", renderProductResults);
  elements.manualBarcodeButton.addEventListener("click", promptManualBarcodeEntry);

  if (elements.barcodeCloseButton) {
    elements.barcodeCloseButton.addEventListener("click", () => {
      closeBarcodeModal();
    });
  }

  if (elements.barcodeCancelButton) {
    elements.barcodeCancelButton.addEventListener("click", () => {
      closeBarcodeModal();
    });
  }

  if (elements.barcodeModal) {
    elements.barcodeModal.addEventListener("click", (event) => {
      if (event.target === elements.barcodeModal) {
        closeBarcodeModal();
      }
    });
  }

  if (elements.barcodeForm) {
    elements.barcodeForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const barcodeValue = String(elements.barcodeInput?.value || "").trim();
      if (!barcodeValue) {
        showToast("Barcode is required", "error");
        return;
      }

      closeBarcodeModal();
      await applyScannedBarcode(barcodeValue, "Manual barcode");
    });
  }

  if (elements.stockCloseButton) {
    elements.stockCloseButton.addEventListener("click", () => {
      closeSetStockModal();
    });
  }

  if (elements.stockCancelButton) {
    elements.stockCancelButton.addEventListener("click", () => {
      closeSetStockModal();
    });
  }

  if (elements.stockModal) {
    elements.stockModal.addEventListener("click", (event) => {
      if (event.target === elements.stockModal) {
        closeSetStockModal();
      }
    });
  }

  if (elements.stockForm) {
    elements.stockForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!state.setStockTargetProductId) {
        showToast("No product selected for stock update", "error");
        closeSetStockModal();
        return;
      }

      const quantity = Math.max(asNumber(elements.stockQuantityInput?.value, NaN), 0);
      if (!Number.isFinite(quantity)) {
        showToast("Invalid stock quantity", "error");
        return;
      }

      const productId = state.setStockTargetProductId;
      const submitButton = elements.stockSubmitButton;
      const previousLabel = submitButton ? submitButton.textContent : "";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Updating...";
      }

      try {
        await api.updateStock(productId, {
          mode: "set",
          quantity,
          referenceType: "adjustment",
          note: "Set from admin panel",
        });

        showToast("Stock updated", "success");
        closeSetStockModal();
        await loadProducts();
        await loadLowStockAlert();
        await loadDashboard();
      } catch (error) {
        showToast(error.message || "Unable to update stock", "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = previousLabel || "Update Stock";
        }
      }
    });
  }

  if (elements.mobileCartOpenButton) {
    elements.mobileCartOpenButton.addEventListener("click", () => {
      setMobileCartOpen(true);
    });
  }

  if (elements.mobileCartCloseButton) {
    elements.mobileCartCloseButton.addEventListener("click", () => {
      setMobileCartOpen(false);
    });
  }

  if (elements.mobileCartBackdrop) {
    elements.mobileCartBackdrop.addEventListener("click", () => {
      setMobileCartOpen(false);
    });
  }

  if (elements.mobileCartCheckoutButton) {
    elements.mobileCartCheckoutButton.addEventListener("click", () => {
      setMobileCartOpen(false);
      void handleCheckout();
    });
  }

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

  if (elements.changePasswordForm) {
    elements.changePasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const currentPassword = elements.currentPasswordInput.value;
      const newPassword = elements.newPasswordInput.value;
      const confirmPassword = elements.confirmPasswordInput.value;

      if (!currentPassword) {
        showToast("Current password is required", "error");
        return;
      }

      if (currentPassword === newPassword) {
        showToast("New password must be different from current password", "error");
        return;
      }

      const validationMessage = getPasswordValidationMessage(newPassword, confirmPassword);
      if (validationMessage) {
        showToast(validationMessage, "error");
        return;
      }

      try {
        await api.changePassword({
          currentPassword,
          newPassword,
        });

        elements.changePasswordForm.reset();
        showToast("Password changed successfully", "success");
      } catch (error) {
        showToast(error.message || "Unable to change password", "error");
      }
    });
  }

  if (elements.userRefreshButton) {
    elements.userRefreshButton.addEventListener("click", async () => {
      const loaded = await loadAdminUsers();
      state.adminUsersLoaded = loaded || state.adminUsersLoaded;
    });
  }

  if (elements.paymentQrFileInput) {
    elements.paymentQrFileInput.addEventListener("change", async () => {
      const selectedFile = elements.paymentQrFileInput.files?.[0] || null;

      if (!selectedFile) {
        renderPaymentSettingsForm();
        return;
      }

      paymentQrMarkedForRemoval = false;

      try {
        const previewData = await readFileAsDataUrl(selectedFile);
        if (elements.paymentQrPreviewWrap && elements.paymentQrPreview) {
          elements.paymentQrPreviewWrap.classList.remove("hidden");
          elements.paymentQrPreview.src = previewData;
        }

        if (elements.paymentQrHint) {
          elements.paymentQrHint.textContent = "Selected QR image will be saved when you click Save Payment Settings.";
        }
      } catch (error) {
        showToast(error.message || "Unable to preview selected QR image", "error");
      }
    });
  }

  if (elements.paymentSettingsRemoveQrButton) {
    elements.paymentSettingsRemoveQrButton.addEventListener("click", () => {
      if (!state.paymentSettings.qrImage) {
        return;
      }

      paymentQrMarkedForRemoval = true;
      if (elements.paymentQrFileInput) {
        elements.paymentQrFileInput.value = "";
      }
      renderPaymentSettingsForm();
      showToast("Uploaded QR will be removed after saving settings", "info");
    });
  }

  if (elements.paymentSettingsForm) {
    elements.paymentSettingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (state.authUser?.role !== "admin") {
        showToast("Only admins can update payment settings", "error");
        return;
      }

      const upiId = String(elements.paymentUpiIdInput?.value || "").trim().toLowerCase();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,}@[a-zA-Z]{2,}$/.test(upiId)) {
        showToast("Enter a valid UPI ID (example: name@bank)", "error");
        return;
      }

      const saveButton = elements.paymentSettingsSaveButton;
      const removeButton = elements.paymentSettingsRemoveQrButton;
      const previousLabel = saveButton?.textContent || "Save Payment Settings";

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
      }

      if (removeButton) {
        removeButton.disabled = true;
      }

      try {
        const qrImage = await resolveQrImageFromFormInput();
        const response = await api.savePaymentSettings({ upiId, qrImage });

        updatePaymentSettingsState(response?.data || { upiId, qrImage, configured: true });
        paymentQrMarkedForRemoval = false;
        if (elements.paymentQrFileInput) {
          elements.paymentQrFileInput.value = "";
        }

        renderPaymentSettingsForm();
        showToast("Payment settings saved", "success");
      } catch (error) {
        showToast(error.message || "Unable to save payment settings", "error");
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = previousLabel;
        }

        if (removeButton) {
          removeButton.disabled = false;
        }
      }
    });
  }

  if (elements.resetPasswordCloseButton) {
    elements.resetPasswordCloseButton.addEventListener("click", () => {
      closeResetPasswordModal();
    });
  }

  if (elements.resetPasswordCancelButton) {
    elements.resetPasswordCancelButton.addEventListener("click", () => {
      closeResetPasswordModal();
    });
  }

  if (elements.resetPasswordModal) {
    elements.resetPasswordModal.addEventListener("click", (event) => {
      if (event.target === elements.resetPasswordModal) {
        closeResetPasswordModal();
      }
    });
  }

  if (elements.resetPasswordForm) {
    elements.resetPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!state.resetPasswordTargetUserId) {
        showToast("No user selected for password reset", "error");
        closeResetPasswordModal();
        return;
      }

      const newPassword = elements.resetPasswordNewInput.value;
      const confirmPassword = elements.resetPasswordConfirmInput.value;
      const validationMessage = getPasswordValidationMessage(newPassword, confirmPassword);

      if (validationMessage) {
        showToast(validationMessage, "error");
        return;
      }

      const submitButton = elements.resetPasswordSubmitButton;
      const previousLabel = submitButton ? submitButton.textContent : "";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Resetting...";
      }

      try {
        await api.resetUserPassword(state.resetPasswordTargetUserId, { newPassword });
        showToast(`Password reset for ${state.resetPasswordTargetUsername}`, "success");
        closeResetPasswordModal();
        await loadAdminUsers();
      } catch (error) {
        showToast(error.message || "Unable to reset password", "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = previousLabel || "Reset Password";
        }
      }
    });
  }

  if (elements.userStatusCloseButton) {
    elements.userStatusCloseButton.addEventListener("click", () => {
      closeUserStatusModal();
    });
  }

  if (elements.userStatusCancelButton) {
    elements.userStatusCancelButton.addEventListener("click", () => {
      closeUserStatusModal();
    });
  }

  if (elements.userStatusModal) {
    elements.userStatusModal.addEventListener("click", (event) => {
      if (event.target === elements.userStatusModal) {
        closeUserStatusModal();
      }
    });
  }

  if (elements.userStatusConfirmButton) {
    elements.userStatusConfirmButton.addEventListener("click", async () => {
      if (!state.userStatusTargetUserId || state.userStatusTargetIsActive === null) {
        closeUserStatusModal();
        return;
      }

      const submitButton = elements.userStatusConfirmButton;
      const previousLabel = submitButton.textContent;
      const shouldActivate = Boolean(state.userStatusTargetIsActive);
      const targetUserId = state.userStatusTargetUserId;

      submitButton.disabled = true;
      submitButton.textContent = shouldActivate ? "Activating..." : "Deactivating...";

      try {
        await api.updateUserStatus(targetUserId, { isActive: shouldActivate });
        showToast(shouldActivate ? "User activated" : "User deactivated", shouldActivate ? "success" : "warning");
        closeUserStatusModal();
        await loadAdminUsers();
      } catch (error) {
        showToast(error.message || "User action failed", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = previousLabel || "Confirm";
      }
    });
  }

  if (elements.userTableBody) {
    elements.userTableBody.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-user-action]");
      if (!button) return;

      const userId = button.dataset.userId;
      const user = state.adminUsers.find((entry) => getUserId(entry) === userId);
      if (!user) return;

      try {
        if (button.dataset.userAction === "reset-password") {
          openResetPasswordModal(user);
          return;
        }

        if (button.dataset.userAction === "toggle-status") {
          const targetStatus = !Boolean(user.isActive);
          openUserStatusModal(user, targetStatus);
          return;
        }
      } catch (error) {
        showToast(error.message || "User action failed", "error");
      }
    });
  }

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
        openSetStockModal(product);
        return;
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
      state.dashboardLoaded = true;
      elements.dashboardRangeButtons.forEach((entry) => {
        entry.classList.toggle("range-active", entry === button);
      });
      await loadDashboard();
    });
  });

  if (elements.dashboardExportCsvButton) {
    elements.dashboardExportCsvButton.addEventListener("click", () => {
      void handleDashboardReportExport("csv");
    });
  }

  if (elements.dashboardExportPdfButton) {
    elements.dashboardExportPdfButton.addEventListener("click", () => {
      void handleDashboardReportExport("pdf");
    });
  }

  if (elements.historyExportCsvButton) {
    elements.historyExportCsvButton.addEventListener("click", () => {
      void handleHistoryReportExport("csv");
    });
  }

  if (elements.historyExportPdfButton) {
    elements.historyExportPdfButton.addEventListener("click", () => {
      void handleHistoryReportExport("pdf");
    });
  }

  [
    elements.historyReportStartDateInput,
    elements.historyReportEndDateInput,
    elements.historyReportPaymentMethodInput,
  ]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("change", () => {
        if (!state.authReady || !state.historyLoaded) {
          return;
        }

        void loadSalesHistory();
      });
    });

  elements.scanButton.addEventListener("click", () => {
    void startScanner();
  });

  if (elements.scannerStartButton) {
    elements.scannerStartButton.addEventListener("click", () => {
      void startScanner();
    });
  }

  if (elements.scannerStopButton) {
    elements.scannerStopButton.addEventListener("click", () => {
      void stopScanner();
    });
  }

  if (elements.scannerTorchButton) {
    elements.scannerTorchButton.addEventListener("click", () => {
      void toggleScannerTorch();
    });
  }

  if (elements.scannerManualEntryButton) {
    elements.scannerManualEntryButton.addEventListener("click", () => {
      void closeScannerModal().finally(() => {
        promptManualBarcodeEntry();
      });
    });
  }

  if (elements.scannerSearchNameButton) {
    elements.scannerSearchNameButton.addEventListener("click", focusSearchFallbackFromScanner);
  }

  elements.scannerCloseButton.addEventListener("click", () => {
    void closeScannerModal();
  });

  elements.scannerModal.addEventListener("click", (event) => {
    if (event.target === elements.scannerModal) {
      void closeScannerModal();
    }
  });

  elements.billClose.addEventListener("click", closeBillModal);
  elements.billPrint.addEventListener("click", () => window.print());

  elements.billModal.addEventListener("click", (event) => {
    if (event.target === elements.billModal) {
      closeBillModal();
    }
  });

  document.addEventListener("keydown", handleGlobalModalKeydown);
  document.addEventListener("keydown", handleKeyboardWedgeKeydown);

  window.addEventListener("blur", resetKeyboardWedgeBuffer);

  window.addEventListener("resize", () => {
    syncMobileCartRail();
  });

  window.addEventListener("online", async () => {
    updateNetworkBadge();
    await syncPendingSales();
  });

  window.addEventListener("offline", updateNetworkBadge);

  window.addEventListener("pos:unauthorized", () => {
    if (state.authReady) {
      void logoutUser("Session expired. Please sign in again.");
    }
  });
}

async function init() {
  elements.apiBaseText.textContent = API_BASE_URL;
  updateNetworkBadge();
  updatePendingBadge();
  updateSyncInfo();
  bindEvents();
  initializeReportDateFilters();
  renderPaymentSettingsForm();

  renderCart();
  updateAuthBadge();
  applyRoleAccess();
  setAppLocked(true);
  setActiveTab("pos");

  const hasActiveSession = await restoreSession();
  if (!hasActiveSession) {
    openAuthModal("Please sign in to continue.");
    return;
  }

  await loadInitialData();
}

init();
