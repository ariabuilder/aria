import type { ExclusionReason, PageForDiscovery } from "./schemas";

export function getExclusionReason(page: PageForDiscovery): ExclusionReason {
  if (page.status === "draft") {
    return "draft";
  }
  if (page.status === "archived") {
    return "archived";
  }
  if (page.systemRole === "not-found") {
    return "not-found";
  }
  if (page.systemRole === "cms-entry") {
    return "cms-entry";
  }
  if (page.accessMode === "password") {
    return "password";
  }
  if (page.accessMode === "private") {
    return "private";
  }
  if (page.accessMode === "unlisted") {
    return "unlisted";
  }
  if (page.settings?.seo?.noindex === true) {
    return "noindex";
  }
  return "included";
}

export function isPageDiscoverable(page: PageForDiscovery): boolean {
  return getExclusionReason(page) === "included";
}
