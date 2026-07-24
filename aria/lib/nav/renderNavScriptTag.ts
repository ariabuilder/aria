export const ARIA_NAV_RUNTIME_URL = "/vendor/aria-nav/aria-nav.js";
export const ARIA_NAV_RUNTIME_CSS_URL = "/vendor/aria-nav/aria-nav.css";

export function renderNavStylesheetTag(): string {
  return `<link rel="stylesheet" href="${ARIA_NAV_RUNTIME_CSS_URL}">`;
}

export function renderNavScriptTag(): string {
  return `<script src="${ARIA_NAV_RUNTIME_URL}" defer></script>`;
}
