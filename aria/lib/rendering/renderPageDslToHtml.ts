import { combineBuilderNodeSets } from "../icons/customElement";
import { renderMotionScriptTag } from "../motion/runtime";
import { renderNavScriptTag, renderNavStylesheetTag } from "../nav";
import { prepareNavigationForRender } from "../cms/navActive";
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
import { type LayoutDSL, type PageDSL } from "../types/nodes";
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
import {
  assembleRendererStyleBands,
  buildRendererBaseStyleFragment,
  collectRendererStyleRequirements,
  splitCompatibilityRendererBaseCss,
} from "./canonical/rendererStyles";
import {
  normalizeEditableSurface,
  parseCanonicalJsonValue,
  resolveRenderSurface,
  type RenderMode,
  type RenderRegionInput,
} from "./canonical";
import {
  compileRenderDocument,
  collectRuntimeManifest,
  serializeRenderDocumentHtml,
  type CanonicalSha256,
  type NodeToHtmlDocumentOptions,
} from "./canonical/document";
import { createStorageRenderDependencyProvider } from "./storageRenderDependencyProvider";

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
  /** Explicit render identity; public is the compatibility default. */
  mode?: RenderMode;
};

type RenderPageDslToHtmlResult = {
  html: string;
  cspHeaderValue: string;
  documentHash: CanonicalSha256;
};

const noopLogger: RenderLogger = () => undefined;

export type { RenderCmsDataOptions };

function toCanonicalManifestValue(value: unknown) {
  const serialized = JSON.stringify(value);
  const parsed: unknown = JSON.parse(serialized);
  return parseCanonicalJsonValue(parsed);
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
  const storedInlineSnapshotCss =
    inlineCompiledCss && hasCompiledCSS
      ? designSystem.artifacts.globalCSS.trim()
      : "";
  const resolvedThemeCssVariables = buildResolvedThemeCssVariables(
    designSystem,
    siteSettings,
  );

  const publicationDependencies = options.page._publicationDependencies;
  let iconResources: IconRenderResources | undefined;
  const normalized = await normalizeEditableSurface(
    { kind: "page", source: options.page },
    { freeze: true },
  );
  const resolvedSurface = await resolveRenderSurface({
    normalized,
    mode: options.mode ?? (options.inlineCompiledCss ? "snapshot" : "public"),
    route: {
      path: requestPath,
      ...((options.locale ?? cmsOptions.locale)
        ? { locale: options.locale ?? cmsOptions.locale }
        : {}),
    },
    dependencyVersions: {
      ...(publicationDependencies?.layout
        ? { layout: publicationDependencies.layout }
        : {}),
      components: publicationDependencies?.components ?? {},
    },
    providers: {
      dependencies: createStorageRenderDependencyProvider(options.adapter, {
        layoutOverride: options.layoutOverride,
      }),
      data: {
        resolveData: async (input) => {
          const regions = await Promise.all(
            input.regions.map(
              async (region): Promise<RenderRegionInput> => ({
                ...region,
                roots: await resolveCmsBoundNodes({
                  nodes: region.roots,
                  adapter: options.adapter,
                  cms: cmsOptions,
                  basePath: requestPath,
                  catalog,
                  contextLabel:
                    region.role === "page"
                      ? `page "${options.page.id}" nodes`
                      : `${region.role} region "${region.id}"`,
                }),
              }),
            ),
          );
          return {
            regions,
            records: [
              {
                kind: "cms-resolution",
                id: `${options.page.id}:${cmsOptions.locale ?? "default"}`,
                value: toCanonicalManifestValue(regions),
              },
            ],
          };
        },
      },
      resources: {
        resolveResources: async (input) => {
          const regions = structuredClone(input.regions);
          for (const region of regions) {
            prepareNavigationForRender(region.roots, requestPath);
          }
          const nodes = combineBuilderNodeSets(
            ...regions.map((region) => region.roots),
          );
          iconResources = await resolveIconRenderResources(nodes, {
            locals: options.locals,
          });
          return {
            regions,
            records: [...iconResources.icons.entries()].map(([id, icon]) => ({
              kind: "icon",
              id,
              value: toCanonicalManifestValue(icon),
            })),
          };
        },
      },
      styles: {
        resolveStyleArtifact: async () => ({
          id: "global",
          revision:
            designSystem.artifacts.globalCSSHash ||
            designSystem.artifacts.lastCompiled ||
            "uncompiled",
          value: toCanonicalManifestValue({
            baseCSSHash: designSystem.artifacts.baseCSSHash,
            globalCSSHash: designSystem.artifacts.globalCSSHash,
            utilityEngine: framework,
          }),
        }),
      },
    },
  });
  const iconSourceNodes = combineBuilderNodeSets(
    ...resolvedSurface.regions.map((region) => [...region.roots]),
  );
  const rendererBaseFragment = await buildRendererBaseStyleFragment(
    collectRendererStyleRequirements(iconSourceNodes),
  );
  const storedSnapshotBands = splitCompatibilityRendererBaseCss(
    storedInlineSnapshotCss,
  );
  const inlineSnapshotCss = storedInlineSnapshotCss
    ? assembleRendererStyleBands({
        rendererBaseCss: rendererBaseFragment?.css ?? "",
        documentCss: storedSnapshotBands.remainingCss,
        utilityCss: "",
        customClassesCss: "",
        contextRulesCss: "",
        nodeCss: "",
      })
    : "";
  if (iconResources?.metrics) {
    logger("debug", "Icon render prepass completed", {
      slug: options.page.slug,
      ...iconResources.metrics,
      resolvedIconCount: iconResources.icons.size,
    });
  }

  const iconRuntimeNodes = iconSourceNodes;
  const runtimeManifest = collectRuntimeManifest(iconRuntimeNodes);
  const motionScriptTag = runtimeManifest.motion ? renderMotionScriptTag() : "";
  const navStylesheetTag = runtimeManifest.navigation
    ? renderNavStylesheetTag()
    : "";
  const navScriptTag = runtimeManifest.navigation ? renderNavScriptTag() : "";

  const cspPlan = planEffectiveCsp({
    analytics: compiledAnalytics.csp,
    customCode: customCodeAnalysis,
    structuredHead: analyzeStructuredHead(options.page.settings?.head),
    renderPipeline: analyzeRenderPipelineRequirements({
      framework,
      customFrameworkURL: siteSettings?.customFrameworkURL,
      requiresIconifyRuntime: runtimeManifest.legacyIconify,
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
    rendererBaseCss:
      inlineGeneratedDocumentCss && !inlineSnapshotCss
        ? (rendererBaseFragment?.css ?? "")
        : "",
    suppressFrameworkTags: inlineSnapshotCss.length > 0,
    customFonts,
    darkMode: darkMode === "disabled" ? undefined : darkMode,
    iconRuntimeNodes,
    iconResources,
    siteSettings: {
      framework,
      unocssConfig: siteSettings?.unocssConfig,
      customFrameworkURL: siteSettings?.customFrameworkURL,
    },
  };

  logger("info", "Rendering resolved surface", {
    mode: resolvedSurface.mode,
    regionCount: resolvedSurface.regions.length,
    dependencyCount: resolvedSurface.dependencies.records.length,
    renderInputHash: resolvedSurface.renderInputHash,
  });

  const renderDocument = await compileRenderDocument({
    surface: resolvedSurface,
    document: documentOptions,
    cspHeaderValue,
    iconResources,
  });

  return {
    html: serializeRenderDocumentHtml(renderDocument),
    cspHeaderValue,
    documentHash: renderDocument.documentHash,
  };
}
