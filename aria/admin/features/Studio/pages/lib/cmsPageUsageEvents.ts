export const CMS_PAGE_USAGE_UPDATED_EVENT = "aria:cms-page-usage-updated" as const;

export function dispatchCmsPageUsageUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CMS_PAGE_USAGE_UPDATED_EVENT));
}
