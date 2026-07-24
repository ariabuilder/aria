import type { DiscoverableCmsEntry, PageForDiscovery } from "./schemas";
import { getExclusionReason } from "./discoverability";

function readEntryNoindex(frontmatter: Record<string, unknown> | undefined): boolean {
  if (!frontmatter) {
    return false;
  }
  const seo = frontmatter.seo;
  if (seo && typeof seo === "object" && "noindex" in seo) {
    return (seo as { noindex?: boolean }).noindex === true;
  }
  return frontmatter.noindex === true || frontmatter.seo_noindex === true;
}

export function isCmsEntryRouteTemplateEligible(
  templatePage: PageForDiscovery | null,
): boolean {
  if (!templatePage) {
    return false;
  }

  if (templatePage.status === "draft" || templatePage.status === "archived") {
    return false;
  }

  if (templatePage.systemRole === "not-found") {
    return false;
  }

  if (templatePage.accessMode === "password") {
    return false;
  }

  if (templatePage.accessMode === "private") {
    return false;
  }

  if (templatePage.settings?.seo?.noindex === true) {
    return false;
  }

  return true;
}

export function isCmsEntryDiscoverable(input: {
  entry: DiscoverableCmsEntry;
  templatePage: PageForDiscovery | null;
  frontmatter?: Record<string, unknown>;
}): boolean {
  if (!isCmsEntryRouteTemplateEligible(input.templatePage)) {
    return false;
  }

  if (
    input.templatePage &&
    getExclusionReason(input.templatePage) === "unlisted"
  ) {
    return false;
  }

  return !readEntryNoindex(input.frontmatter);
}
