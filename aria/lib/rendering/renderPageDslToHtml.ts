import {
  nodesToHtmlDocumentAsync,
  nodesToHtmlFragmentAsync,
  nodesToHtmlWithLayoutAsync,
  resolvePublishedHtmlRenderStyleMode,
  type NodeToHtmlDocumentOptions,
} from "../blocks/nodesToHtml";
import {
  combineBuilderNodeSets,
  nodesRequireIconifyRuntime,
} from "../icons/customElement";
import {
  nodeTreeRequiresMotionRuntime,
  renderMotionScriptTag,
} from "../motion/runtime";
import {
  nodeTreeRequiresNavRuntime,
  renderNavScriptTag,
  renderNavStylesheetTag,
} from "../nav";
import { prepareNavigationForRender } from "../cms/navActive";
import { mergePageBlocksWithLayoutSlotsForPublish } from "../layouts/canvasSlotMerge";
import { compileAnalyticsScripts } from "../analytics/compileAnalyticsScripts";
import { analyzeCustomCode } from "../security/analyzeCustomCode";
import {
  analyzeRenderPipelineRequirements,
  analyzeStructuredHead,
  planEffectiveCsp,
  serializeCspHeaderValue,
} from "../security/csp";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  buildVerificationMetaTags,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from "../seo/jsonLdSite";
import { resolveSiteMetadata } from "./resolveSiteMetadata";
import { resolvePageRobotsMeta } from "../seo/robotsMeta";
import {
  getSiteSettingsUtilityEngine,
  type StorageAdapter,
  type StoredPageAccessMode,
} from "../storage/adapter";
import {
  createDefaultUniversalDesignSystem,
  getCustomFontsLibraryFromUniversalDesignSystem,
  resolveBreakpointDefinitionsFromDesignSystem,
} from "../styles/universalDesignSystem";
import { type BuilderNode, type LayoutDSL, type PageDSL } from "../types/nodes";
import { buildResolvedThemeCssVariables } from "../styles/resolvedUserTheme";
import { buildGlobalStylesCss } from "../styles/globalStylesCss";
import {
  RenderCmsDataOptionsSchema,
  resolveCmsBoundNodes,
  type RenderCmsDataOptions,
} from "../cms/resolveBoundNodes";
import { resolveTemplatePageCmsOptions } from "../cms/templatePagePreview";
import type { RuntimeLocals } from "../cloudflare/env";
import { MediaCatalogRepository } from "../media/catalog/repository";
import { resolveIconRenderResources } from "../icons/resolveIconResources";
import type { IconRenderResources } from "../icons/iconRenderResources";

type RenderLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) => void;

type RenderPageDslToHtmlOptions = {
  page: PageDSL;
  adapter: StorageAdapter;
  logger?: RenderLogger;
  inlineCompiledCss?: boolean;
  /** Overrides `page.slug` for canonical URLs and metadata. */
  pathOrSlug?: string;
  /** Prepended to generated head HTML (e.g. CSP meta from publish). */
  headHTMLPrefix?: string;
  globalCSSHref?: string;
  /** Explicit site locale for non-CMS page translations. */
  locale?: string;
  direction?: "ltr" | "rtl";
  /** Immutable localized SEO snapshot, layered over page settings. */
  seoOverride?: NodeToHtmlDocumentOptions["seo"];
  /** Error routes must not advertise a canonical public document. */
  suppressCanonical?: boolean;
  /** Frozen localized layout selected by the route resolver. */
  layoutOverride?: LayoutDSL | null;
  accessMode?: StoredPageAccessMode;
  cms?: RenderCmsDataOptions;
  catalog?: MediaCatalogRepository | null;
  locals?: RuntimeLocals;
};

type RenderPageDslToHtmlResult = {
  html: string;
  cspHeaderValue: string;
};

const noopLogger: RenderLogger = () => undefined;

export type { RenderCmsDataOptions };

function injectIntoBody(
  html: string,
  injection: { header?: string; footer?: string },
): string {
  const header = injection.header ?? "";
  const footer = injection.footer ?? "";

  if (!header && !footer) return html;

  const bodyOpenMatch = html.match(/<body[^>]*>/i);
  const bodyCloseMatch = html.match(/<\/body>/i);

  if (!bodyOpenMatch || !bodyCloseMatch) {
    return `${header}${html}${footer}`;
  }

  const bodyOpenIndex = html.search(/<body[^>]*>/i);
  const bodyOpenEnd = bodyOpenIndex + bodyOpenMatch[0].length;
  const bodyCloseIndex = html.search(/<\/body>/i);

  return (
    html.slice(0, bodyOpenEnd) +
    (header ? `\n${header}` : "") +
    html.slice(bodyOpenEnd, bodyCloseIndex) +
    (footer ? `\n${footer}\n` : "") +
    html.slice(bodyCloseIndex)
  );
}

async function loadAssignedLayoutRegionNodes(options: {
  layout: LayoutDSL | null;
  getComponentDSL: StorageAdapter["getComponentDSL"];
}): Promise<{
  headerNodes: BuilderNode[];
  footerNodes: BuilderNode[];
}> {
  const { layout, getComponentDSL } = options;
  if (!layout) {
    return {
      headerNodes: [],
      footerNodes: [],
    };
  }

  const effectiveRegions = layout.regions ?? layout.metadata?.regions;
  const headerComponentId = effectiveRegions?.headerComponent;
  const footerComponentId = effectiveRegions?.footerComponent;

  const [headerComp, footerComp] = await Promise.all([
    headerComponentId ? getComponentDSL(headerComponentId) : null,
    footerComponentId ? getComponentDSL(footerComponentId) : null,
  ]);

  return {
    headerNodes: headerComp?.nodes ?? [],
    footerNodes: footerComp?.nodes ?? [],
  };
}

async function renderLayoutRegionFragments(options: {
  headerNodes: BuilderNode[];
  footerNodes: BuilderNode[];
  getComponentDSL: StorageAdapter["getComponentDSL"];
  breakpoints?: NodeToHtmlDocumentOptions["breakpoints"];
  globalCSSEnabled?: boolean;
  inlineGeneratedDocumentCss?: boolean;
  locals?: RuntimeLocals;
  iconResources?: IconRenderResources;
}): Promise<{
  header?: string;
  footer?: string;
}> {
  const fragmentStyleMode = resolvePublishedHtmlRenderStyleMode({
    globalCSSEnabled: options.globalCSSEnabled,
    inlineGeneratedDocumentCss: options.inlineGeneratedDocumentCss,
  });
  // Keep one deterministic SVG instance sequence for the whole document.
  const header = options.headerNodes.length
    ? await nodesToHtmlFragmentAsync(
        options.headerNodes,
        options.getComponentDSL,
        0,
        options.breakpoints,
        fragmentStyleMode,
        options.iconResources,
        options.locals,
      )
    : "";
  const footer = options.footerNodes.length
    ? await nodesToHtmlFragmentAsync(
        options.footerNodes,
        options.getComponentDSL,
        0,
        options.breakpoints,
        fragmentStyleMode,
        options.iconResources,
        options.locals,
      )
    : "";

  return {
    header: header || undefined,
    footer: footer || undefined,
  };
}

async function resolveLayoutSlotsDefaultContent(
  layout: LayoutDSL,
  adapter: StorageAdapter,
  cms: RenderCmsDataOptions,
  basePath: string,
  catalog: MediaCatalogRepository | null | undefined,
): Promise<LayoutDSL> {
  if (!layout.slots?.length) {
    return layout;
  }

  const slots = await Promise.all(
    layout.slots.map(async (slot) => {
      if (!slot.defaultContent?.length) {
        return slot;
      }
      return {
        ...slot,
        defaultContent: await resolveCmsBoundNodes({
          nodes: slot.defaultContent,
          adapter,
          cms,
          basePath,
          catalog,
          contextLabel: `layout "${layout.id}" slot "${slot.name}" default content`,
        }),
      };
    }),
  );

  return { ...layout, slots };
}

export async function renderPageDslToHtml(
  options: RenderPageDslToHtmlOptions,
): Promise<RenderPageDslToHtmlResult> {
  const logger = options.logger ?? noopLogger;
  const requestPath = options.pathOrSlug ?? options.page.slug;
  const catalog =
    options.catalog ?? MediaCatalogRepository.tryCreate(options.locals);

  let siteSettings = null;
  let designSystem = createDefaultUniversalDesignSystem();

  try {
    [siteSettings, designSystem] = await Promise.all([
      options.adapter.getSiteSettings(),
      options.adapter
        .getDesignSystem()
        .then((value) => value ?? createDefaultUniversalDesignSystem()),
    ]);
  } catch (error) {
    logger(
      "warn",
      "Failed to load site settings/design system, using defaults",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const compiledAnalytics = compileAnalyticsScripts(siteSettings?.analytics);
  if (compiledAnalytics.warnings.length > 0) {
    logger("warn", "Analytics compile warnings", {
      slug: options.page.slug,
      warnings: compiledAnalytics.warnings,
    });
  }

  const cmsOptions = RenderCmsDataOptionsSchema.parse(
    await resolveTemplatePageCmsOptions(
      options.adapter,
      options.page.id,
      (options.cms ?? {}) as RenderCmsDataOptions,
    ),
  );
  const entrySeo = cmsOptions.entrySeo;

  const resolvedMetadata = resolveSiteMetadata({
    siteSettings,
    pageTitle: entrySeo?.title ?? options.page.title,
    pageDescription: entrySeo?.description ?? options.page.description,
    pageSeo: {
      ...(options.page.settings?.seo ?? {}),
      ...(options.seoOverride ?? {}),
      ...(entrySeo?.title ? { title: entrySeo.title } : {}),
      ...(entrySeo?.description ? { description: entrySeo.description } : {}),
      ...(entrySeo?.ogImage ? { ogImage: entrySeo.ogImage } : {}),
    },
    pathOrSlug: requestPath,
  });

  const robotsDirectives = resolvePageRobotsMeta({
    accessMode: options.accessMode ?? options.page.accessMode,
    seo: {
      ...(options.page.settings?.seo ?? {}),
      ...(options.seoOverride ?? {}),
    },
  });

  const mergedSeo = {
    ...resolvedMetadata.seo,
    ...(options.suppressCanonical ? { canonical: undefined } : {}),
    noindex: robotsDirectives.noindex,
    nofollow: robotsDirectives.nofollow,
  };

  const customCodeAnalysis = analyzeCustomCode([
    { label: "site customHeadCode", code: siteSettings?.customHeadCode },
    { label: "site customBodyCode", code: siteSettings?.customBodyCode },
    { label: "site customFooterCode", code: siteSettings?.customFooterCode },
    { label: "page headHTML", code: options.page.settings?.headHTML },
  ]);

  const framework = getSiteSettingsUtilityEngine(siteSettings);
  const canonicalBreakpoints =
    resolveBreakpointDefinitionsFromDesignSystem(designSystem);
  const darkMode = siteSettings?.darkMode || "disabled";
  const customFonts =
    getCustomFontsLibraryFromUniversalDesignSystem(designSystem);
  const hasCompiledCSS = Boolean(
    designSystem.artifacts.globalCSS && designSystem.artifacts.globalCSSHash,
  );
  const globalCSSEnabled = hasCompiledCSS;
  const inlineGeneratedDocumentCss = !hasCompiledCSS;
  const inlineCompiledCss = options.inlineCompiledCss === true;
  const inlineSnapshotCss =
    inlineCompiledCss && hasCompiledCSS
      ? designSystem.artifacts.globalCSS.trim()
      : "";
  const resolvedThemeCssVariables = buildResolvedThemeCssVariables(
    designSystem,
    siteSettings,
  );

  let layout: LayoutDSL | null = null;
  let headerNodes: BuilderNode[] = [];
  let footerNodes: BuilderNode[] = [];
  const publicationDependencies = options.page._publicationDependencies;
  const publishedLayout = publicationDependencies?.layout;
  const getComponentDSL: StorageAdapter["getComponentDSL"] = (id, version) =>
    options.adapter.getComponentDSL(
      id,
      version ?? publicationDependencies?.components[id],
    );

  if (options.page.layout || options.layoutOverride) {
    try {
      layout =
        options.layoutOverride ??
        (await options.adapter.getLayoutDSL(
          options.page.layout!,
          publishedLayout && publishedLayout.id === options.page.layout
            ? publishedLayout.version
            : undefined,
        ));
      const regionNodes = await loadAssignedLayoutRegionNodes({
        layout,
        getComponentDSL,
      });
      headerNodes = regionNodes.headerNodes;
      footerNodes = regionNodes.footerNodes;
    } catch (error) {
      logger(
        "error",
        `Layout \"${options.page.layout}\" failed to load, rendering page only`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  const pageNodes = await resolveCmsBoundNodes({
    nodes: options.page.nodes,
    adapter: options.adapter,
    cms: cmsOptions,
    basePath: requestPath,
    catalog,
    contextLabel: `page "${options.page.id}" nodes`,
  });

  if (layout?.slots?.length) {
    layout = await resolveLayoutSlotsDefaultContent(
      layout,
      options.adapter,
      cmsOptions,
      requestPath,
      catalog,
    );
  }

  headerNodes = await resolveCmsBoundNodes({
    nodes: headerNodes,
    adapter: options.adapter,
    cms: cmsOptions,
    basePath: requestPath,
    catalog,
    contextLabel: options.page.layout
      ? `layout "${options.page.layout}" header region`
      : `page "${options.page.id}" header region`,
  });
  footerNodes = await resolveCmsBoundNodes({
    nodes: footerNodes,
    adapter: options.adapter,
    cms: cmsOptions,
    basePath: requestPath,
    catalog,
    contextLabel: options.page.layout
      ? `layout "${options.page.layout}" footer region`
      : `page "${options.page.id}" footer region`,
  });

  const slotOnlyLayout =
    layout &&
    (!layout.nodes || layout.nodes.length === 0) &&
    Array.isArray(layout.slots) &&
    layout.slots.length > 0;

  const mergedSlotNodes = slotOnlyLayout
    ? mergePageBlocksWithLayoutSlotsForPublish(pageNodes, layout)
    : null;

  // Expand every render region before one shared icon prepass. The async
  // document/fragment helpers receive this resource and therefore do not read
  // the manifest or shards again.
  const { expandComponentReferencesServer } =
    await import("../blocks/nodeUtils");
  const iconSourceNodes = combineBuilderNodeSets(
    await expandComponentReferencesServer(
      slotOnlyLayout ? (mergedSlotNodes ?? pageNodes) : pageNodes,
      getComponentDSL,
    ),
    layout?.nodes?.length
      ? await expandComponentReferencesServer(layout.nodes, getComponentDSL)
      : [],
    await expandComponentReferencesServer(headerNodes, getComponentDSL),
    await expandComponentReferencesServer(footerNodes, getComponentDSL),
  );
  const iconResources = await resolveIconRenderResources(iconSourceNodes, {
    locals: options.locals,
  });
  if (iconResources.metrics) {
    logger("debug", "Icon render prepass completed", {
      slug: options.page.slug,
      ...iconResources.metrics,
      resolvedIconCount: iconResources.icons.size,
    });
  }

  prepareNavigationForRender(pageNodes, requestPath);
  if (mergedSlotNodes) {
    prepareNavigationForRender(mergedSlotNodes, requestPath);
  }
  if (layout?.nodes?.length) {
    prepareNavigationForRender(layout.nodes, requestPath);
  }
  prepareNavigationForRender(headerNodes, requestPath);
  prepareNavigationForRender(footerNodes, requestPath);

  const assignedRegions = await renderLayoutRegionFragments({
    headerNodes,
    footerNodes,
    getComponentDSL,
    breakpoints: canonicalBreakpoints,
    globalCSSEnabled,
    inlineGeneratedDocumentCss,
    locals: options.locals,
    iconResources,
  });

  const iconRuntimeNodes = combineBuilderNodeSets(
    slotOnlyLayout ? mergedSlotNodes! : pageNodes,
    layout?.nodes,
    headerNodes,
    footerNodes,
  );

  const needsMotionRuntime = nodeTreeRequiresMotionRuntime(
    slotOnlyLayout ? mergedSlotNodes! : pageNodes,
    layout?.nodes,
    headerNodes,
    footerNodes,
  );
  const needsNavRuntime = nodeTreeRequiresNavRuntime(
    slotOnlyLayout ? mergedSlotNodes! : pageNodes,
    layout?.nodes,
    headerNodes,
    footerNodes,
  );
  const motionScriptTag = needsMotionRuntime ? renderMotionScriptTag() : "";
  const navStylesheetTag = needsNavRuntime ? renderNavStylesheetTag() : "";
  const navScriptTag = needsNavRuntime ? renderNavScriptTag() : "";

  const cspPlan = planEffectiveCsp({
    analytics: compiledAnalytics.csp,
    customCode: customCodeAnalysis,
    structuredHead: analyzeStructuredHead(options.page.settings?.head),
    renderPipeline: analyzeRenderPipelineRequirements({
      framework,
      customFrameworkURL: siteSettings?.customFrameworkURL,
      requiresIconifyRuntime: nodesRequireIconifyRuntime(iconRuntimeNodes),
      includesStructuredDataJsonLd: true,
      globalCSSEnabled,
      customFonts,
      darkMode: darkMode === "disabled" ? undefined : darkMode,
    }),
  });

  if (cspPlan.warnings.length > 0) {
    logger("warn", "CSP planning warnings", {
      slug: options.page.slug,
      warnings: cspPlan.warnings,
    });
  }

  const cspHeaderValue = serializeCspHeaderValue(cspPlan);

  const pageSummaries = await options.adapter.listPagesDSL({ limit: 1000 });
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd({
    siteSettings,
    page: { slug: options.page.slug },
    pages: pageSummaries.map((summary) => ({
      slug: summary.slug ?? summary.id,
      parent: summary.parent,
    })),
  });

  const resolvedCssVariables =
    inlineSnapshotCss.length > 0 || !globalCSSEnabled
      ? {
          ...resolvedThemeCssVariables,
          ...(options.page.settings?.cssVariables ?? {}),
        }
      : (options.page.settings?.cssVariables ?? {});

  const documentOptions: NodeToHtmlDocumentOptions = {
    lang: options.locale ?? options.cms?.locale,
    dir: options.direction,
    title: resolvedMetadata.title,
    description: resolvedMetadata.description,
    breakpoints: canonicalBreakpoints,
    seo: mergedSeo,
    head: options.page.settings?.head,
    headHTML: [
      options.headHTMLPrefix,
      resolvedMetadata.faviconHeadHTML,
      serializeJsonLd(buildOrganizationJsonLd(siteSettings)),
      serializeJsonLd(buildWebSiteJsonLd(siteSettings)),
      serializeJsonLd(breadcrumbJsonLd),
      buildVerificationMetaTags(siteSettings),
      inlineSnapshotCss ? `<style>${inlineSnapshotCss}</style>` : "",
      navStylesheetTag,
      options.page.settings?.headHTML,
      siteSettings?.customHeadCode,
      compiledAnalytics.headHTML,
    ]
      .filter(Boolean)
      .join("\n"),
    bodyStartHTML: [
      siteSettings?.customBodyCode,
      compiledAnalytics.bodyStartHTML,
    ]
      .filter(Boolean)
      .join("\n"),
    bodyEndHTML: [
      compiledAnalytics.bodyEndHTML,
      siteSettings?.customFooterCode,
      motionScriptTag,
      navScriptTag,
    ]
      .filter(Boolean)
      .join("\n"),
    cssVariables: resolvedCssVariables,
    globalCSSEnabled: inlineSnapshotCss ? false : globalCSSEnabled,
    globalCSSHash: designSystem.artifacts.globalCSSHash,
    globalCSSHref: options.globalCSSHref,
    inlineGeneratedDocumentCss,
    inlineGlobalStylesCSS: buildGlobalStylesCss(designSystem),
    suppressFrameworkTags: inlineSnapshotCss.length > 0,
    customFonts,
    darkMode: darkMode === "disabled" ? undefined : darkMode,
    iconRuntimeNodes,
    iconResources,
    iconLocals: options.locals,
    siteSettings: {
      framework,
      unocssConfig: siteSettings?.unocssConfig,
      customFrameworkURL: siteSettings?.customFrameworkURL,
    },
  };

  if (layout?.nodes && layout.nodes.length > 0) {
    logger("info", `Rendering with layout \"${options.page.layout}\"`, {
      nodeCount: layout.nodes.length,
    });

    return {
      html: injectIntoBody(
        await nodesToHtmlWithLayoutAsync(
          pageNodes,
          layout.nodes,
          getComponentDSL,
          {
            ...documentOptions,
            layoutSlots: layout.slots ?? [],
          },
        ),
        assignedRegions,
      ),
      cspHeaderValue,
    };
  }

  if (slotOnlyLayout && mergedSlotNodes) {
    logger("info", `Rendering with layout slots \"${options.page.layout}\"`, {
      slotCount: layout?.slots?.length ?? 0,
      mergedNodeCount: mergedSlotNodes.length,
    });

    return {
      html: await nodesToHtmlDocumentAsync(
        mergedSlotNodes,
        getComponentDSL,
        documentOptions,
      ),
      cspHeaderValue,
    };
  }

  if (options.page.layout && layout) {
    logger(
      "info",
      `Layout \"${options.page.layout}\" has no layout nodes; rendering page with assigned regions only`,
    );
  } else {
    logger("info", "Rendering page without layout");
  }

  return {
    html: injectIntoBody(
      await nodesToHtmlDocumentAsync(
        pageNodes,
        getComponentDSL,
        documentOptions,
      ),
      assignedRegions,
    ),
    cspHeaderValue,
  };
}
