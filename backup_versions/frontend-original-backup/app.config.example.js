window.__APP_CONFIG__ = {
  // Update this for each environment (dev/staging/prod).
  API_BASE_URL: "https://your-api-domain.example.com/api",

  // Optional billing profile for invoice PDF/link generation.
  SHOP_NAME: "CounterCraft POS",
  SHOP_ADDRESS: "Main Market Road, Your City",
  SHOP_PHONE: "+91 90000 00000",
  SHOP_GSTIN: "22AAAAA0000A1Z5",

  // Optional public invoice URL base. shareId is appended as /:shareId (no query params).
  // Example: "https://yourapp.com/bill"
  BILL_PUBLIC_BASE_URL: "",

  // Used when cashier enters 10-digit local number without country code.
  WHATSAPP_DEFAULT_COUNTRY_CODE: "91",
};
