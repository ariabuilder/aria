import {
  getSiteSettingsUtilityEngine,
  type StorageAdapter,
  type PageData,
} from "../storage/adapter";
import type { BuilderNode, BreakpointDefinition } from "../types/nodes";
import { nodesToHtmlFragment } from "../blocks/nodesToHtml";
import { renderPageDslToHtml } from "./renderPageDslToHtml";
import {
  combineBuilderNodeSets,
  nodesRequireIconifyRuntime,
  renderIconifyRuntimeHeadHtml,
} from "../icons/customElement";
import { compileAnalyticsScripts } from "../analytics/compileAnalyticsScripts";
import { analyzeCustomCode } from "../security/analyzeCustomCode";
import {
  analyzeRenderPipelineRequirements,
  createEmptyCspRequirements,
  planEffectiveCsp,
  renderCspMetaTag,
} from "../security/csp";
import { resolveSiteMetadata } from "./resolveSiteMetadata";
import {
  buildRobotsMetaTag,
  resolvePageRobotsMeta,
} from "../seo/robotsMeta";
import {
  createDefaultUniversalDesignSystem,
  resolveBreakpointDefinitionsFromDesignSystem,
} from "../styles/universalDesignSystem";
import {
  loadCollectionPublicPageRoute,
  type PublicPageRouteStage,
} from "./resolvePublicPageRoute";
import { resolveCmsEntrySeoOverride } from "./resolveCmsEntrySeo";

// Helper for rendering component nodes
function renderComponentNodes(
  nodes: BuilderNode[],
  breakpoints: BreakpointDefinition[],
): string {
  return nodesToHtmlFragment(nodes, 0, breakpoints);
}

export type RenderPageResult = {
  html: string;
};

export type RenderPagePartsResult = {
  headHtml: string;
  bodyHtml: string;
};

type RenderablePageData = PageData & {
  nodes?: BuilderNode[];
  settings?: {
    cssVariables?: Record<string, string>;
  };
};

export {
  loadCollectionPublicPageRoute,
  resolveCollectionTemplateRoute,
  CollectionEntryContextSchema,
  CollectionPublicPageRouteSchema,
  CollectionTemplateRouteSchema,
  PublicPageRouteStageSchema,
  type CollectionEntryContext,
  type CollectionPublicPageRoute,
  type CollectionTemplateRoute,
  type PublicPageRouteStage,
} from "./resolvePublicPageRoute";
export { resolveCmsEntrySeoOverride, CmsEntrySeoOverrideSchema } from "./resolveCmsEntrySeo";

function isBuilderNode(value: unknown): value is BuilderNode {
  if (!value || typeof value !== "object") return false;
  const maybeNode = value as Record<string, unknown>;
  return (
    typeof maybeNode.id === "string" &&
    typeof maybeNode.type === "string" &&
    typeof maybeNode.props === "object" &&
    maybeNode.props !== null &&
    typeof maybeNode.styles === "object" &&
    maybeNode.styles !== null &&
    Array.isArray(maybeNode.children)
  );
}

function toBuilderNodeArray(value: unknown): BuilderNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isBuilderNode);
}

function getFrontmatterString(page: PageData, key: string): string {
  const value = page.frontmatter?.[key];
  return typeof value === "string" ? value : "";
}

function getLayoutSlug(page: PageData): string {
  return page.layout || getFrontmatterString(page, "layout");
}

function getPageNodes(page: RenderablePageData): BuilderNode[] {
  const pageWithNodes = page as RenderablePageData & Record<string, unknown>;
  return toBuilderNodeArray(pageWithNodes.nodes ?? page.blocks);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlAttr(value: string): string {
  // For our use here, the same escaping is sufficient.
  return escapeHtmlText(value);
}

function normalizeSlugForStorage(pathname: string): string {
  if (pathname === "/" || pathname === "") return "/";
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return trimmed;
}

function isInvalidSlugError(value: unknown): boolean {
  return (
    value instanceof Error &&
    typeof value.message === "string" &&
    value.message.toLowerCase().includes("invalid slug")
  );
}

async function getPageDslSafe(
  adapter: StorageAdapter,
  slug: string,
  stage: PublicPageRouteStage,
): Promise<Awaited<ReturnType<StorageAdapter["getPageDSL"]>>> {
  try {
    return stage === "published"
      ? await adapter.getPublishedPageDSL(slug)
      : await adapter.getPageDSL(slug);
  } catch (error: unknown) {
    if (isInvalidSlugError(error)) {
      return null;
    }
    throw error;
  }
}

async function buildCollectionRenderCmsOptions(
  adapter: StorageAdapter,
  collectionRoute: NonNullable<
    Awaited<ReturnType<typeof loadCollectionPublicPageRoute>>
  >,
  stage: PublicPageRouteStage,
) {
  const entry = await adapter.getEntry({
    collectionId: collectionRoute.entryContext.collectionId,
    idOrSlug: collectionRoute.entryContext.slug,
  });
  const sourceLocale =
    entry?.locales.find((locale) => locale.isSource) ?? entry?.locales[0];
  const entrySeo = sourceLocale
    ? resolveCmsEntrySeoOverride({
        entryTitle: sourceLocale.title,
        frontmatter: sourceLocale.frontmatter,
      })
    : undefined;

  return {
    preview: stage !== "published",
    entryContext: collectionRoute.entryContext,
    entrySeo,
  } as const;
}

export async function renderPageHtmlFromStorage(options: {
  adapter: StorageAdapter;
  pathname: string;
  stage?: PublicPageRouteStage;
}): Promise<RenderPageResult | null> {
  const { adapter, pathname, stage = "draft" } = options;
  const slug = normalizeSlugForStorage(pathname);

  const page = await getPageDslSafe(adapter, slug, stage);
  if (!page) {
    const collectionRoute = await loadCollectionPublicPageRoute(adapter, {
      pathname,
      stage,
    });
    if (!collectionRoute) return null;

    const { html } = await renderPageDslToHtml({
      page: collectionRoute.templatePage,
      adapter,
      pathOrSlug: pathname,
      cms: await buildCollectionRenderCmsOptions(adapter, collectionRoute, stage),
    });

    return { html };
  }

  const { html } = await renderPageDslToHtml({
    page,
    adapter,
    pathOrSlug: pathname,
  });

  return { html };
}

export async function renderPagePartsFromStorage(options: {
  adapter: StorageAdapter;
  pathname: string;
}): Promise<RenderPagePartsResult | null> {
  const { adapter, pathname } = options;
  const slug = normalizeSlugForStorage(pathname);

  const page = await getPageSafe(adapter, slug, "draft");
  if (!page) return null;

  const [siteSettings, designSystem] = await Promise.all([
    adapter.getSiteSettings(),
    adapter
      .getDesignSystem()
      .then((value) => value ?? createDefaultUniversalDesignSystem()),
  ]);
  const canonicalBreakpoints =
    resolveBreakpointDefinitionsFromDesignSystem(designSystem);
  const compiledAnalytics = compileAnalyticsScripts(siteSettings?.analytics);
  const customCodeAnalysis = analyzeCustomCode([
    { label: "site customHeadCode", code: siteSettings?.customHeadCode },
    { label: "site customBodyCode", code: siteSettings?.customBodyCode },
    { label: "site customFooterCode", code: siteSettings?.customFooterCode },
  ]);
  const layoutSlug = getLayoutSlug(page);
  const pageNodes = getPageNodes(page);

  let headerNodes: BuilderNode[] = [];
  let footerNodes: BuilderNode[] = [];
  let headerSource: string | undefined;
  let footerSource: string | undefined;

  if (layoutSlug) {
    const layout = await adapter.getLayoutDSL(layoutSlug);
    if (layout) {
      const headerComponentSlug =
        layout.regions?.headerComponent ??
        layout.metadata?.regions?.headerComponent;
      const footerComponentSlug =
        layout.regions?.footerComponent ??
        layout.metadata?.regions?.footerComponent;

      const [headerComp, footerComp] = await Promise.all([
        headerComponentSlug
          ? adapter.getComponentDSL(headerComponentSlug)
          : null,
        footerComponentSlug
          ? adapter.getComponentDSL(footerComponentSlug)
          : null,
      ]);

      headerNodes = headerComp?.nodes ?? [];
      footerNodes = footerComp?.nodes ?? [];
      headerSource = headerNodes.length
        ? renderComponentNodes(headerNodes, canonicalBreakpoints)
        : undefined;
      footerSource = footerNodes.length
        ? renderComponentNodes(footerNodes, canonicalBreakpoints)
        : undefined;
    }
  }

  const iconRuntimeNodes = combineBuilderNodeSets(
    pageNodes,
    headerNodes,
    footerNodes,
  );
  const cspMetaTag = renderCspMetaTag(
    planEffectiveCsp({
      analytics: compiledAnalytics.csp,
      customCode: customCodeAnalysis,
      structuredHead: createEmptyCspRequirements(),
      renderPipeline: analyzeRenderPipelineRequirements({
        framework: getSiteSettingsUtilityEngine(siteSettings),
        customFrameworkURL: siteSettings?.customFrameworkURL,
        requiresIconifyRuntime: nodesRequireIconifyRuntime(iconRuntimeNodes),
        includesStructuredDataJsonLd: true,
      }),
    }),
  );

  const title = page.frontmatter?.title ?? page.title;
  const description = getFrontmatterString(page, "description");
  const resolvedMetadata = resolveSiteMetadata({
    siteSettings,
    pageTitle: title,
    pageDescription: description,
    pathOrSlug: pathname,
  });

  const robotsDirectives = resolvePageRobotsMeta({
    seo: resolvedMetadata.seo,
  });
  const robotsMetaTag = buildRobotsMetaTag(robotsDirectives);

  const headHtml = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${resolvedMetadata.title ? `<title>${escapeHtmlText(String(resolvedMetadata.title))}</title>` : ""}
${resolvedMetadata.description ? `<meta name="description" content="${escapeHtmlAttr(String(resolvedMetadata.description))}" />` : ""}
${resolvedMetadata.seo?.canonical ? `<link rel="canonical" href="${escapeHtmlAttr(String(resolvedMetadata.seo.canonical))}" />` : ""}
${resolvedMetadata.seo?.ogImage ? `<meta property="og:image" content="${escapeHtmlAttr(String(resolvedMetadata.seo.ogImage))}" />` : ""}
${robotsMetaTag}
`.trim();

  let bodyHtml = [
    siteSettings?.customBodyCode,
    compiledAnalytics.bodyStartHTML,
    nodesToHtmlFragment(pageNodes, 0, canonicalBreakpoints),
    compiledAnalytics.bodyEndHTML,
    siteSettings?.customFooterCode,
  ]
    .filter(Boolean)
    .join("\n");

  if (headerSource) bodyHtml = `${headerSource}\n${bodyHtml}`;
  if (footerSource) bodyHtml = `${bodyHtml}\n${footerSource}`;

  return {
    headHtml: [
      headHtml,
      cspMetaTag,
      resolvedMetadata.faviconHeadHTML,
      renderIconifyRuntimeHeadHtml(iconRuntimeNodes),
      siteSettings?.customHeadCode,
      compiledAnalytics.headHTML,
    ]
      .filter(Boolean)
      .join("\n"),
    bodyHtml,
  };
}

async function getPageSafe(
  adapter: StorageAdapter,
  slug: string,
  stage: "draft" | "published",
): Promise<RenderablePageData | null> {
  try {
    const pageDSL =
      stage === "published"
        ? await adapter.getPublishedPageDSL(slug)
        : await adapter.getPageDSL(slug);
    if (!pageDSL) return null;

    // Convert PageDSL to legacy PageData format for backward compatibility
    return {
      slug: pageDSL.slug ?? slug,
      title: pageDSL.title ?? slug,
      type: "page",
      blocks: undefined,
      nodes: toBuilderNodeArray(pageDSL.nodes),
      settings: pageDSL.settings,
      frontmatter: pageDSL.frontmatter as PageData["frontmatter"],
      layout: pageDSL.layout,
      draft: pageDSL.status === "draft",
      parent: pageDSL.parent,
      order: pageDSL.order,
      updated_at: new Date(pageDSL.updatedAt ?? Date.now()).getTime() / 1000,
    };
  } catch (error) {
    if (isInvalidSlugError(error)) {
      return null;
    }
    throw error;
  }
}
