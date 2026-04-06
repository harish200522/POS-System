function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

const runtimeConfigBase = normalizeBaseUrl(window.__APP_CONFIG__?.API_BASE_URL);
const localOverrideBase = normalizeBaseUrl(localStorage.getItem("pos_api_base"));
const sameOriginBase = normalizeBaseUrl(`${window.location.origin}/api`);

export const API_BASE_URL = runtimeConfigBase || localOverrideBase || sameOriginBase;

export function setApiBase(url) {
  const normalizedUrl = normalizeBaseUrl(url);
  if (!normalizedUrl) {
    throw new Error("API base URL cannot be empty");
  }
  localStorage.setItem("pos_api_base", normalizedUrl);
}
