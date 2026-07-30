import {
  buildGoogleFontsURL,
  generateContextRulesCSS,
  generateCustomClasses,
  generateCustomFontsCSS,
  generateKeyframesCSS,
} from "../../lib/styles/generateCustomCSS";
import {
  collectNodeStylesheet,
  type NodeToHtmlDocumentOptions,
} from "../../lib/blocks/nodesToHtml";
import { createNavigationPresetClasses } from "../../lib/blocks/navigationPresetClasses";
import {
  resolveBreakpointDefinitionsFromDesignSystem,
  resolveBreakpointWidthMapFromDesignSystem,
  getCustomFontsLibraryFromUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import {
  buildResolvedThemeCssVariables,
  resolveUserTheme,
} from "../../lib/styles/resolvedUserTheme";
import { serializeFontFamilyValue } from "../../lib/styles/fontFamily";
import { buildGlobalStylesCss } from "../../lib/styles/globalStylesCss";
import { readAriaMotionCss } from "../../lib/motion/css/readAriaMotionCss";
import { nodeTreeRequiresMotionStyles } from "../../lib/motion/runtime";
import type { AuthorshipSaveContext } from "../_shared";
import type { BuilderNode } from "../../lib/types/nodes";
import { persistSiteSettings } from "../_designSystemPersist";
import {
  createSiteStyleRevision,
  getSiteSettingsUtilityEngine,
  resolveSiteStyleRevision,
  type SiteSettings,
} from "../../lib/storage/adapter";
import { deletePageSnapshots } from "../../lib/rendering/pageSnapshots";
import {
  generateCSSHash,
  getDesignSystem,
  log,
  saveDesignSystem,
  type StylesStorageAdapter,
} from "./_shared";
import type { RenderStylesData } from "./renderStyles";

type GlobalCSSArtifactsResult = {
  designSystem: UniversalDesignSystem;
  globalCSSHash: string;
  cssSize: number;
  classCount: number;
  lastCompiled: string;
  framework: "unocss" | "custom";
  styleRevision: string;
  invalidatedPageCount: number;
};

export type BuildGlobalCSSArtifactsOptions = {
  /**
   * Rebuild palette/semantic CSS variables in stored artifacts without
   * scanning all DSL or recompiling Uno utilities.
   */
  colorsOnly?: boolean;
  /** Unsaved/submitted nodes that must participate in this publish compile. */
  utilityNodes?: readonly BuilderNode[];
};

export type RegenerateGlobalCSSArtifactsOptions =
  BuildGlobalCSSArtifactsOptions & {
    bumpStyleRevision?: boolean;
    invalidatePageRenderArtifacts?: boolean;
    authorship?: AuthorshipSaveContext;
  };

const DESIGN_SYSTEM_COLORS_CSS_SECTION =
  /\/\* Design System Colors \*\/\s*:root\s*\{[\s\S]*?\}/;

function buildGoogleFontsImportCss(
  customFonts: ReturnType<
    typeof getCustomFontsLibraryFromUniversalDesignSystem
  >,
): string {
  const googleFonts = Object.values(customFonts?.googleFonts ?? {});

  return googleFonts
    .map(
      (font) =>
        `@import url("${buildGoogleFontsURL(font.family, font.variants)}");`,
    )
    .join("\n")
    .trim();
}

function hasTypographyToken(
  tokens: Record<string, string>,
  token: string,
): boolean {
  const value = tokens[token];
  return typeof value === "string" && value.trim().length > 0;
}

function buildTypographyRule(selector: string, declarations: string[]): string {
  return [
    selector + " {",
    ...declarations.map((line) => `  ${line}`),
    "}",
  ].join("\n");
}

function buildSemanticTypographyCss(
  designSystem: UniversalDesignSystem,
): string {
  const rules: string[] = [];
  const { sizes, lineHeights, letterSpacing, weights } =
    designSystem.tokens.typography;
  const hasBodyFamily = hasTypographyToken(
    {
      ...designSystem.tokens.typography.families,
      ...designSystem.fonts.assignments,
    },
    "body",
  );
  const hasHeadingFamily = hasTypographyToken(
    {
      ...designSystem.tokens.typography.families,
      ...designSystem.fonts.assignments,
    },
    "heading",
  );

  const bodyDeclarations: string[] = [];
  if (hasBodyFamily) {
    bodyDeclarations.push(
      "font-family: var(--font-family-base, var(--font-family-body, inherit));",
    );
  }
  if (hasTypographyToken(sizes, "base")) {
    bodyDeclarations.push("font-size: var(--font-size-base);");
  }
  if (hasTypographyToken(lineHeights, "base")) {
    bodyDeclarations.push("line-height: var(--line-height-base);");
  }
  if (hasTypographyToken(letterSpacing, "base")) {
    bodyDeclarations.push("letter-spacing: var(--letter-spacing-base);");
  }
  if (hasTypographyToken(weights, "regular")) {
    bodyDeclarations.push("font-weight: var(--font-weight-regular);");
  }

  if (bodyDeclarations.length > 0) {
    rules.push(buildTypographyRule("body", bodyDeclarations));
  }

  const headingWeightToken = ["semibold", "bold", "medium", "regular"].find(
    (token) => hasTypographyToken(weights, token),
  );
  const headingScaleBySelector: Array<[string, string]> = [
    ["h1", "5xl"],
    ["h2", "4xl"],
    ["h3", "3xl"],
    ["h4", "2xl"],
    ["h5", "xl"],
    ["h6", "lg"],
  ];

  for (const [selector, scaleToken] of headingScaleBySelector) {
    const declarations: string[] = [];

    if (hasHeadingFamily) {
      declarations.push(
        `font-family: var(--font-family-${scaleToken}, var(--font-family-heading, var(--font-family-body, inherit)));`,
      );
    } else if (hasBodyFamily) {
      declarations.push(
        `font-family: var(--font-family-${scaleToken}, var(--font-family-body, inherit));`,
      );
    }
    if (hasTypographyToken(sizes, scaleToken)) {
      declarations.push(`font-size: var(--font-size-${scaleToken});`);
    }
    if (hasTypographyToken(lineHeights, scaleToken)) {
      declarations.push(`line-height: var(--line-height-${scaleToken});`);
    }
    if (hasTypographyToken(letterSpacing, scaleToken)) {
      declarations.push(`letter-spacing: var(--letter-spacing-${scaleToken});`);
    }
    if (headingWeightToken) {
      declarations.push(
        `font-weight: var(--font-weight-${headingWeightToken});`,
      );
    }

    if (declarations.length > 0) {
      rules.push(buildTypographyRule(selector, declarations));
    }
  }

  return rules.join("\n\n");
}

function buildRootTypographyCss(designSystem: UniversalDesignSystem): string {
  const lines: string[] = [];
  const fontFamilies = {
    ...designSystem.tokens.typography.families,
    ...designSystem.fonts.assignments,
  };

  for (const [token, family] of Object.entries(fontFamilies)) {
    if (family) {
      lines.push(
        `  --font-family-${token}: ${serializeFontFamilyValue(family)};`,
      );
    }
  }

  for (const [token, size] of Object.entries(
    designSystem.tokens.typography.sizes,
  )) {
    lines.push(`  --font-size-${token}: ${size};`);
  }

  for (const [token, lineHeight] of Object.entries(
    designSystem.tokens.typography.lineHeights,
  )) {
    lines.push(`  --line-height-${token}: ${lineHeight};`);
  }

  for (const [token, letterSpacing] of Object.entries(
    designSystem.tokens.typography.letterSpacing,
  )) {
    lines.push(`  --letter-spacing-${token}: ${letterSpacing};`);
  }

  for (const [token, weight] of Object.entries(
    designSystem.tokens.typography.weights,
  )) {
    lines.push(`  --font-weight-${token}: ${weight};`);
  }

  if (lines.length === 0) return "";

  const semanticTypographyCss = buildSemanticTypographyCss(designSystem);
  const rootTypographyVariables = [":root {", ...lines, "}"].join("\n");

  return [
    `/* Design System Typography */\n${rootTypographyVariables}`,
    semanticTypographyCss,
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
}

function buildRootColorsCss(
  designSystem: UniversalDesignSystem,
  siteSettings: SiteSettings | null,
): string {
  const cssVariables = buildResolvedThemeCssVariables(
    designSystem,
    siteSettings,
  );

  if (Object.keys(cssVariables).length === 0) return "";

  const colorLines = Object.entries(cssVariables).map(
    ([name, value]) => `  ${name}: ${value};`,
  );

  if (colorLines.length === 0) return "";

  const paletteLines = colorLines.filter(
    (line) => !/(--success|--warning|--error|--info):/.test(line),
  );
  const semanticLines = colorLines.filter((line) =>
    /(--success|--warning|--error|--info):/.test(line),
  );

  const output = ["/* Design System Colors */", ":root {"];

  if (paletteLines.length > 0) {
    output.push("  /* Palette Tokens */", ...paletteLines);
  }

  if (semanticLines.length > 0) {
    if (paletteLines.length > 0) {
      output.push("");
    }
    output.push("  /* Semantic Tokens */", ...semanticLines);
  }

  output.push("}");

  return output.join("\n");
}

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .trim();
}

function buildBaseCssArtifact(parts: {
  googleFontsCss: string;
  rootColorsCss: string;
  rootTypographyCss: string;
  globalStylesCss: string;
  keyframesCss: string;
  customFontsCss: string;
}): string {
  return [
    parts.googleFontsCss,
    parts.rootColorsCss,
    parts.rootTypographyCss,
    parts.globalStylesCss,
    parts.keyframesCss,
    parts.customFontsCss,
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function getCssHashOrGenerate(
  css: string,
  existingHash: string | undefined,
): string {
  if (existingHash && existingHash.trim().length > 0) return existingHash;
  return generateCSSHash(css);
}

export async function buildGeneratedDocumentCss(
  adapter: StylesStorageAdapter,
  breakpoints: NonNullable<NodeToHtmlDocumentOptions["breakpoints"]>,
): Promise<string> {
  const [pageIndex, layoutIndex, componentIndex] = await Promise.all([
    adapter.listPagesDSL(),
    adapter.listLayoutsDSL(),
    adapter.listComponentsDSL(),
  ]);
  const [pages, layouts, components] = await Promise.all([
    Promise.all(pageIndex.map((page) => adapter.getPageDSL(page.id))),
    Promise.all(layoutIndex.map((layout) => adapter.getLayoutDSL(layout.id))),
    Promise.all(
      componentIndex.map((component) => adapter.getComponentDSL(component.id)),
    ),
  ]);
  const allNodes = [
    ...pages.flatMap((page) =>
      page && Array.isArray(page.nodes) && page.nodes.length > 0
        ? page.nodes
        : [],
    ),
    ...layouts.flatMap((layout) =>
      layout && Array.isArray(layout.nodes) && layout.nodes.length > 0
        ? layout.nodes
        : [],
    ),
    ...components.flatMap((component) =>
      component && Array.isArray(component.nodes) && component.nodes.length > 0
        ? component.nodes
        : [],
    ),
  ];
  const responsiveCss = collectNodeStylesheet(allNodes, breakpoints);
  const motionCss = nodeTreeRequiresMotionStyles(allNodes)
    ? readAriaMotionCss().trim()
    : "";

  return [motionCss, responsiveCss].filter(Boolean).join("\n\n").trim();
}

function appendGeneratedDocumentCss(
  baseCss: string,
  documentCss: string,
): string {
  return [baseCss, documentCss]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n");
}

function assembleGlobalCss(input: {
  coreBaseCss: string;
  utilityCSS: string;
  customClassesCSS?: string;
  contextRulesCSS?: string;
  generatedDocumentCss?: string;
}): string {
  const minifiedUtilityCSS = input.utilityCSS
    ? minifyCss(input.utilityCSS)
    : "";

  return [
    input.coreBaseCss,
    minifiedUtilityCSS,
    input.customClassesCSS?.trim() ?? "",
    input.contextRulesCSS?.trim() ?? "",
    input.generatedDocumentCss?.trim() ?? "",
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function buildStageRenderStylesData(input: {
  storedRenderStyles: RenderStylesData;
  generatedDocumentCss: string;
}): RenderStylesData {
  const stored = input.storedRenderStyles;
  const coreBaseCss = (stored.baseCSS || "").trim();
  const utilityCSS = stored.utilityCSS || "";
  const customClassesCSS = stored.customClassesCSS || "";
  const generatedDocumentCss = input.generatedDocumentCss.trim();
  const stageGlobalCSS = assembleGlobalCss({
    coreBaseCss,
    utilityCSS,
    customClassesCSS,
    contextRulesCSS: stored.contextRulesCSS || "",
    generatedDocumentCss,
  });
  const stageBaseCSS = appendGeneratedDocumentCss(
    coreBaseCss,
    generatedDocumentCss,
  );

  return {
    ...stored,
    baseCSS: stageBaseCSS,
    baseCSSHash: generateCSSHash(stageBaseCSS),
    globalCSS: stageGlobalCSS,
    globalCSSHash: generateCSSHash(stageGlobalCSS),
  };
}

export function buildStoredRenderStylesData(
  designSystem: UniversalDesignSystem,
  siteSettings: SiteSettings | null,
): RenderStylesData {
  const customFontsLibrary =
    getCustomFontsLibraryFromUniversalDesignSystem(designSystem);
  const googleFontsCss = buildGoogleFontsImportCss(customFontsLibrary);
  const customClassesCSS = designSystem.artifacts.customClassesCSS ?? "";
  const contextRulesCSS = generateContextRulesCSS(
    designSystem.contextRules,
    resolveBreakpointWidthMapFromDesignSystem(designSystem),
  );
  const customFontsCSS = designSystem.artifacts.customFontsCSS ?? "";
  const fallbackBaseCss = buildBaseCssArtifact({
    googleFontsCss,
    rootColorsCss: buildRootColorsCss(designSystem, siteSettings),
    rootTypographyCss: buildRootTypographyCss(designSystem),
    globalStylesCss: buildGlobalStylesCss(designSystem),
    keyframesCss: generateKeyframesCSS(designSystem.animations),
    customFontsCss: customFontsCSS,
  });
  const baseCSS = designSystem.artifacts.baseCSS || fallbackBaseCss;
  const utilityCSS =
    designSystem.artifacts.utilityCSS ||
    designSystem.artifacts.compiledUnoCSS ||
    "";
  const globalCSS =
    designSystem.artifacts.globalCSS ||
    assembleGlobalCss({
      coreBaseCss: baseCSS.trim(),
      utilityCSS,
      customClassesCSS,
      contextRulesCSS,
    });

  return {
    baseCSS,
    baseCSSHash: getCssHashOrGenerate(
      baseCSS,
      designSystem.artifacts.baseCSSHash,
    ),
    utilityCSS,
    utilityCSSHash: getCssHashOrGenerate(
      utilityCSS,
      designSystem.artifacts.utilityCSSHash,
    ),
    customClassesCSS,
    contextRulesCSS,
    customFontsCSS,
    globalCSS,
    globalCSSHash: getCssHashOrGenerate(
      globalCSS,
      designSystem.artifacts.globalCSSHash,
    ),
    lastCompiled: designSystem.artifacts.lastCompiled ?? "",
    styleRevision: resolveSiteStyleRevision(siteSettings),
    utilityEngine: getSiteSettingsUtilityEngine(siteSettings),
  };
}

async function invalidateStoredPageRenderArtifacts(
  adapter: StylesStorageAdapter,
): Promise<number> {
  const pages = await adapter.listPagesDSL();
  const uniquePages = Array.from(
    new Map(pages.map((page) => [page.id, page])).values(),
  );

  await Promise.all(
    uniquePages.map(async (page) => {
      await Promise.all([
        deletePageSnapshots(page.slug ?? page.id, adapter),
        adapter.deletePageThumbnail(page.id),
      ]);
    }),
  );

  return uniquePages.length;
}

export async function safelyRefreshStyleArtifactsAfterMutation(
  adapter: StylesStorageAdapter,
  mutationTarget: string,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  try {
    await regenerateGlobalCSSArtifacts(adapter, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts: true,
      authorship,
    });
  } catch (error) {
    log("warn", "Render style refresh failed after style mutation", {
      mutationTarget,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureNavigationPresetClassesForAdapter(
  adapter: StylesStorageAdapter,
  authorship?: AuthorshipSaveContext,
): Promise<{ created: string[]; existing: string[] }> {
  const designSystem = await getDesignSystem(adapter);
  const presetClasses = createNavigationPresetClasses();
  const created: string[] = [];
  const existing: string[] = [];

  for (const [className, classDefinition] of Object.entries(presetClasses)) {
    if (designSystem.semanticClasses[className]) {
      existing.push(className);
      continue;
    }

    designSystem.semanticClasses[className] = classDefinition;
    created.push(className);
  }

  if (created.length === 0) {
    return { created, existing };
  }

  await saveDesignSystem(adapter, designSystem, authorship);
  await safelyRefreshStyleArtifactsAfterMutation(
    adapter,
    "navigation-preset-classes",
    authorship,
  );

  return { created, existing };
}

function patchBaseCssColorSection(
  existingBaseCss: string,
  rootColorsCss: string,
): string {
  const nextColors = rootColorsCss.trim();
  if (!nextColors) {
    return existingBaseCss;
  }

  if (DESIGN_SYSTEM_COLORS_CSS_SECTION.test(existingBaseCss)) {
    return existingBaseCss.replace(
      DESIGN_SYSTEM_COLORS_CSS_SECTION,
      nextColors,
    );
  }

  return [nextColors, existingBaseCss].filter(Boolean).join("\n\n");
}

function finalizeGlobalCSSArtifactsSnapshot(input: {
  designSystem: UniversalDesignSystem;
  siteSettings: SiteSettings | null;
  framework: ReturnType<typeof getSiteSettingsUtilityEngine>;
  rawBaseCss: string;
  generatedDocumentCss?: string;
  utilityCSS: string;
  utilityClasses: string[];
  customClassesCSS: string;
  contextRulesCSS?: string;
  customFontsCSS: string;
}): GlobalCSSArtifactsResult {
  const {
    designSystem,
    siteSettings,
    framework,
    rawBaseCss,
    generatedDocumentCss = "",
    utilityCSS,
    utilityClasses,
    customClassesCSS,
    contextRulesCSS = "",
    customFontsCSS,
  } = input;

  const resolvedCoreBaseCss = rawBaseCss.trim();
  const resolvedDocumentCss = generatedDocumentCss.trim();

  const globalCSS = assembleGlobalCss({
    coreBaseCss: resolvedCoreBaseCss,
    utilityCSS,
    customClassesCSS,
    contextRulesCSS,
    generatedDocumentCss: resolvedDocumentCss,
  });

  const cssSize = globalCSS.length;
  const cssSizeKB = (cssSize / 1024).toFixed(2);
  const WARNING_THRESHOLD = 500 * 1024;
  const ERROR_THRESHOLD = 2 * 1024 * 1024;

  if (cssSize > ERROR_THRESHOLD) {
    log("error", "CSS size exceeds 2MB limit - aborting", {
      size: `${cssSizeKB}KB`,
      limit: "2MB",
    });

    throw new Error(
      `Generated CSS (${cssSizeKB}KB) exceeds 2MB limit. Consider reducing utility classes or splitting styles.`,
    );
  }

  if (cssSize > WARNING_THRESHOLD) {
    log("warn", "CSS size exceeds 500KB - performance impact expected", {
      size: `${cssSizeKB}KB`,
    });
  }

  const minifiedUtilityCSS = utilityCSS ? minifyCss(utilityCSS) : "";
  const storedBaseCSS = appendGeneratedDocumentCss(
    resolvedCoreBaseCss,
    resolvedDocumentCss,
  );
  const baseCSSHash = generateCSSHash(storedBaseCSS);
  const utilityCSSHash = generateCSSHash(minifiedUtilityCSS);
  const globalCSSHash = generateCSSHash(globalCSS);

  const compiledDesignSystem = structuredClone(designSystem);

  compiledDesignSystem.artifacts.baseCSS = storedBaseCSS;
  compiledDesignSystem.artifacts.baseCSSHash = baseCSSHash;
  compiledDesignSystem.artifacts.compiledUnoCSS = minifiedUtilityCSS;
  compiledDesignSystem.artifacts.customClassesCSS = customClassesCSS;
  compiledDesignSystem.artifacts.customFontsCSS = customFontsCSS;
  compiledDesignSystem.artifacts.globalCSS = globalCSS;
  compiledDesignSystem.artifacts.globalCSSHash = globalCSSHash;
  compiledDesignSystem.artifacts.utilityCSS = minifiedUtilityCSS;
  compiledDesignSystem.artifacts.utilityCSSHash = utilityCSSHash;
  compiledDesignSystem.artifacts.unocssClasses = utilityClasses;
  compiledDesignSystem.artifacts.lastCompiled = new Date().toISOString();

  return {
    designSystem: compiledDesignSystem,
    globalCSSHash,
    cssSize: globalCSS.length,
    classCount: utilityClasses.length,
    lastCompiled: compiledDesignSystem.artifacts.lastCompiled,
    framework,
    styleRevision: resolveSiteStyleRevision(siteSettings),
    invalidatedPageCount: 0,
  };
}

export async function buildGlobalCSSArtifactsSnapshot(
  adapter: StylesStorageAdapter,
  options: BuildGlobalCSSArtifactsOptions = {},
): Promise<GlobalCSSArtifactsResult> {
  const [siteSettings, designSystem] = await Promise.all([
    adapter.getSiteSettings(),
    getDesignSystem(adapter),
  ]);

  const framework = getSiteSettingsUtilityEngine(siteSettings);

  if (options.colorsOnly) {
    const existingBaseCss = designSystem.artifacts.baseCSS?.trim() ?? "";

    if (!existingBaseCss) {
      log(
        "info",
        "colorsOnly CSS regen skipped — no stored base CSS; running full compile",
      );
      return buildGlobalCSSArtifactsSnapshot(adapter, {});
    }

    const rootColorsCss = buildRootColorsCss(designSystem, siteSettings);
    const rawBaseCss = patchBaseCssColorSection(existingBaseCss, rootColorsCss);
    const utilityCSS =
      designSystem.artifacts.utilityCSS ||
      designSystem.artifacts.compiledUnoCSS ||
      "";

    log("info", "colorsOnly CSS regen complete", {
      baseCssSize: `${(rawBaseCss.length / 1024).toFixed(2)}KB`,
    });

    return finalizeGlobalCSSArtifactsSnapshot({
      designSystem,
      siteSettings,
      framework,
      rawBaseCss,
      utilityCSS,
      utilityClasses: designSystem.artifacts.unocssClasses ?? [],
      customClassesCSS: designSystem.artifacts.customClassesCSS ?? "",
      contextRulesCSS: generateContextRulesCSS(
        designSystem.contextRules,
        resolveBreakpointWidthMapFromDesignSystem(designSystem),
      ),
      customFontsCSS: designSystem.artifacts.customFontsCSS ?? "",
    });
  }

  const customFontsLibrary =
    getCustomFontsLibraryFromUniversalDesignSystem(designSystem);
  const canonicalBreakpoints =
    resolveBreakpointDefinitionsFromDesignSystem(designSystem);
  const googleFontsCss = buildGoogleFontsImportCss(customFontsLibrary);
  const customFontsCSS = generateCustomFontsCSS(customFontsLibrary);
  const rootTypographyCSS = buildRootTypographyCss(designSystem);
  const rootColorsCss = buildRootColorsCss(designSystem, siteSettings);
  const globalStylesCss = buildGlobalStylesCss(designSystem);
  const resolvedTheme = resolveUserTheme(designSystem, siteSettings);
  const breakpointWidths =
    resolveBreakpointWidthMapFromDesignSystem(designSystem);
  const customClassesCSS = generateCustomClasses(
    designSystem.semanticClasses,
    breakpointWidths,
  );
  const contextRulesCSS = generateContextRulesCSS(
    designSystem.contextRules,
    breakpointWidths,
  );
  const generatedDocumentCss = await buildGeneratedDocumentCss(
    adapter,
    canonicalBreakpoints,
  );

  const rawBaseCss = buildBaseCssArtifact({
    googleFontsCss,
    rootColorsCss,
    rootTypographyCss: rootTypographyCSS,
    globalStylesCss,
    keyframesCss: generateKeyframesCSS(designSystem.animations),
    customFontsCss: customFontsCSS,
  });

  let utilityCSS = "";
  let utilityClasses: string[] = [];

  // Check if UnoCSS compilation is needed
  const darkMode = siteSettings?.darkMode ?? "media";

  if (framework === "unocss") {
    log("info", "Generating custom CSS for UnoCSS");

    // Import compilation utilities dynamically only when the utility engine is enabled.
    const { scanAllDSLForUnoCSS, extractTailwindClasses } =
      await import("../../lib/styles/extractContent");
    const { compileUnoCSS } = await import("../../lib/styles/compileUnoCSS");

    // Scan DSL content for utility classes
    const { htmlContent, utilityClasses: collectedUtilityClasses } =
      await scanAllDSLForUnoCSS(adapter, {
        additionalNodes: options.utilityNodes,
      });

    log("info", "Compiling custom CSS", {
      htmlLength: htmlContent.length,
      darkMode,
    });

    utilityCSS = await compileUnoCSS(
      htmlContent,
      "",
      "",
      darkMode,
      siteSettings?.unocssConfig,
      resolvedTheme,
      collectedUtilityClasses,
    );
    utilityCSS = utilityCSS.trim();

    // Extract class names for analytics
    utilityClasses = Array.from(
      new Set([
        ...extractTailwindClasses(htmlContent),
        ...collectedUtilityClasses,
      ]),
    ).sort();

    log("info", "UnoCSS compilation complete", {
      cssSize: `${(utilityCSS.length / 1024).toFixed(2)}KB`,
      classCount: utilityClasses.length,
    });
  } else {
    log("info", "Custom framework mode - using base CSS only");
  }

  return finalizeGlobalCSSArtifactsSnapshot({
    designSystem,
    siteSettings,
    framework,
    rawBaseCss,
    generatedDocumentCss,
    utilityCSS,
    utilityClasses,
    customClassesCSS,
    contextRulesCSS,
    customFontsCSS,
  });
}

export async function regenerateGlobalCSSArtifacts(
  adapter: StylesStorageAdapter,
  options: RegenerateGlobalCSSArtifactsOptions = {},
): Promise<Omit<GlobalCSSArtifactsResult, "designSystem">> {
  const result = await buildGlobalCSSArtifactsSnapshot(adapter, {
    colorsOnly: options.colorsOnly,
    utilityNodes: options.utilityNodes,
  });

  await saveDesignSystem(adapter, result.designSystem, options.authorship);

  let styleRevision = result.styleRevision;
  if (options.bumpStyleRevision === true) {
    const currentSettings = await adapter.getSiteSettings();
    const nextStyleRevision = createSiteStyleRevision();

    await persistSiteSettings(
      adapter,
      {
        ...(currentSettings ?? {}),
        styleRevision: nextStyleRevision,
        updated_at: Date.now(),
      },
      options.authorship
        ? { ...options.authorship, mutationKind: "save-site-settings" }
        : undefined,
    );

    styleRevision = nextStyleRevision;
  }

  const invalidatedPageCount =
    options.invalidatePageRenderArtifacts === true
      ? await invalidateStoredPageRenderArtifacts(adapter)
      : 0;

  return {
    globalCSSHash: result.globalCSSHash,
    cssSize: result.cssSize,
    classCount: result.classCount,
    lastCompiled: result.lastCompiled,
    framework: result.framework,
    styleRevision,
    invalidatedPageCount,
  };
}
