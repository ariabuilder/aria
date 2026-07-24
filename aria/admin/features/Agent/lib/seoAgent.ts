import { extractTextContent } from "../../../../lib/blocks/nodesToHtml";
import { resolvePublicPagePath } from "../../../../lib/pages/publicPaths";
import type { BuilderNode, PageDSL } from "../../../../lib/types/nodes";
import { AGENT_PAGE_SEO_UPDATED_EVENT } from "./constants";
import type {
  AgentAvailability,
  AgentSeoContext,
  AgentShellContext,
  AgentToolStep,
} from "./schemas";

type PageSeoSettings = NonNullable<PageDSL["settings"]>["seo"];

const SEO_CONTENT_EXCERPT_MAX = 2500;

export interface BuildAgentSeoContextInput {
  pageSlug: string;
  pageTitle?: string;
  pageDescription?: string;
  systemRole?: PageDSL["systemRole"];
  parent?: string;
  nodes?: BuilderNode[];
  currentSeo?: PageSeoSettings;
  siteUrl?: string;
  siteName?: string;
  field?: AgentSeoContext["field"];
}

function compactCurrentSeo(
  seo: PageSeoSettings | undefined,
): AgentSeoContext["currentSeo"] | undefined {
  if (!seo) return undefined;

  const compact = {
    title: seo.title,
    description: seo.description,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    ogImage: seo.ogImage,
    canonical: seo.canonical,
    noindex: seo.noindex,
    nofollow: seo.nofollow,
  };

  const hasValue = Object.values(compact).some(
    (value) => value !== undefined && value !== "",
  );
  return hasValue ? compact : undefined;
}

export function buildAgentSeoContext(
  input: BuildAgentSeoContextInput,
): AgentSeoContext {
  const siteUrl = input.siteUrl?.trim().replace(/\/+$/, "") || undefined;
  const publicPath = resolvePublicPagePath(input.pageSlug, [
    { slug: input.pageSlug, parent: input.parent },
  ]);
  const publicPageUrl = siteUrl
    ? `${siteUrl}${publicPath === "/" ? "/" : publicPath}`
    : publicPath;

  let contentExcerpt: string | undefined;
  if (input.nodes?.length) {
    const raw = extractTextContent(input.nodes).replace(/\s+/g, " ").trim();
    if (raw) {
      contentExcerpt =
        raw.length > SEO_CONTENT_EXCERPT_MAX
          ? `${raw.slice(0, SEO_CONTENT_EXCERPT_MAX)}…`
          : raw;
    }
  }

  return {
    pageSlug: input.pageSlug,
    pageTitle: input.pageTitle,
    field: input.field ?? "general",
    siteUrl,
    siteName: input.siteName?.trim() || undefined,
    publicPageUrl,
    systemRole: input.systemRole,
    pageDescription: input.pageDescription?.trim() || undefined,
    contentExcerpt,
    currentSeo: compactCurrentSeo(input.currentSeo),
  };
}

export function buildSeoImprovementPrompt(
  pageTitle?: string,
  pageSlug?: string,
): string {
  const name = pageTitle?.trim() || pageSlug?.trim() || "this";
  return `Update the SEO metadata for the "${name}" page in Studio. Read the page content first (aria_read_page with detail=seo), then set meta title, description, Open Graph, canonical, and robots. Do not edit page content in Composer.`;
}

export function buildSeoStudioShellContext(
  pageSlug: string,
  pageTitle?: string,
  pageId?: string | null,
): AgentShellContext {
  return {
    mode: "studio",
    workspace: "studio",
    itemType: "page",
    itemSlug: pageSlug,
    itemTitle: pageTitle ?? pageSlug,
    pageId: pageId ?? null,
    selectedBlockId: null,
    blockCount: 0,
    canClientInsert: false,
    canClientNavigate: false,
  };
}

export function isAgentInferenceReady(
  availability: AgentAvailability | null | undefined,
): boolean {
  return Boolean(
    availability?.canUseStudioAgent &&
      availability?.siteEnabled &&
      availability?.effectiveInferenceBackend !== "unavailable",
  );
}

export function canShowSeoAgentLauncher(
  availability: AgentAvailability | null | undefined,
): boolean {
  return Boolean(
    availability?.canUseStudioAgent && availability?.siteEnabled,
  );
}

export function dispatchAgentPageSeoUpdated(slug: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AGENT_PAGE_SEO_UPDATED_EVENT, {
      detail: { slug },
    }),
  );
}

export function notifyAgentPageSeoUpdatedFromToolSteps(
  toolSteps: readonly AgentToolStep[],
  seoContext?: AgentSeoContext | null,
): void {
  if (!seoContext?.pageSlug) {
    return;
  }

  const updated = toolSteps.some(
    (step) =>
      step.toolName === "aria_update_page_seo" && step.status === "success",
  );

  if (updated) {
    dispatchAgentPageSeoUpdated(seoContext.pageSlug);
  }
}
