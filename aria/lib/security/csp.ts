import { z } from "zod";
import type { CompiledAnalyticsCspRequirements } from "../analytics/compileAnalyticsScripts";
import type { PageDSL } from "../types/nodes";
import {
  CustomCodeAnalysisSchema,
  type CustomCodeAnalysis,
} from "./analyzeCustomCode";

const CspDirectiveValuesSchema = z.array(z.string());

export const CspSourceRequirementsSchema = z.object({
  scriptSrc: CspDirectiveValuesSchema,
  connectSrc: CspDirectiveValuesSchema,
  imgSrc: CspDirectiveValuesSchema,
  frameSrc: CspDirectiveValuesSchema,
  styleSrc: CspDirectiveValuesSchema,
  fontSrc: CspDirectiveValuesSchema,
  mediaSrc: CspDirectiveValuesSchema,
  usesInlineScript: z.boolean(),
  usesInlineStyle: z.boolean(),
});

export type CspSourceRequirements = z.infer<typeof CspSourceRequirementsSchema>;

export const EffectiveCspPlanSchema = z.object({
  directives: z.object({
    defaultSrc: CspDirectiveValuesSchema,
    baseUri: CspDirectiveValuesSchema,
    frameAncestors: CspDirectiveValuesSchema,
    objectSrc: CspDirectiveValuesSchema,
    scriptSrc: CspDirectiveValuesSchema,
    connectSrc: CspDirectiveValuesSchema,
    imgSrc: CspDirectiveValuesSchema,
    frameSrc: CspDirectiveValuesSchema,
    fontSrc: CspDirectiveValuesSchema,
    styleSrc: CspDirectiveValuesSchema,
    mediaSrc: CspDirectiveValuesSchema,
  }),
  riskFlags: z.object({
    hasInlineScript: z.boolean(),
    hasInlineEventHandlers: z.boolean(),
    hasUnknownScriptOrigin: z.boolean(),
    hasUnknownFrameOrigin: z.boolean(),
    hasCustomCode: z.boolean(),
  }),
  warnings: z.array(z.string()),
});

export type EffectiveCspPlan = z.infer<typeof EffectiveCspPlanSchema>;

type PageHeadSettings = NonNullable<NonNullable<PageDSL["settings"]>["head"]>;

type RenderPipelineInput = {
  framework?: "unocss" | "custom";
  customFrameworkURL?: string;
  requiresIconifyRuntime?: boolean;
  /** Inline JSON-LD blocks injected during public page rendering. */
  includesStructuredDataJsonLd?: boolean;
  globalCSSEnabled?: boolean;
  customFonts?: {
    googleFonts?: Record<
      string,
      { id: string; family: string; variants: string[]; googleFontsURL: string }
    >;
  };
  darkMode?: "media" | "class" | "disabled";
};

function addUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("?") ||
    trimmed.startsWith("#")
  ) {
    return "'self'";
  }

  if (trimmed.startsWith("//")) {
    try {
      return new URL(`https:${trimmed}`).origin;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("data:")) return "data:";
  if (trimmed.startsWith("blob:")) return "blob:";

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function createEmptyCspRequirements(): CspSourceRequirements {
  return {
    scriptSrc: [],
    connectSrc: [],
    imgSrc: [],
    frameSrc: [],
    styleSrc: [],
    fontSrc: [],
    mediaSrc: [],
    usesInlineScript: false,
    usesInlineStyle: false,
  };
}

export function mergeCspRequirements(
  target: CspSourceRequirements,
  source: CspSourceRequirements,
): void {
  addValues(target.scriptSrc, source.scriptSrc);
  addValues(target.connectSrc, source.connectSrc);
  addValues(target.imgSrc, source.imgSrc);
  addValues(target.frameSrc, source.frameSrc);
  addValues(target.styleSrc, source.styleSrc);
  addValues(target.fontSrc, source.fontSrc);
  addValues(target.mediaSrc, source.mediaSrc);
  target.usesInlineScript ||= source.usesInlineScript;
  target.usesInlineStyle ||= source.usesInlineStyle;
}

function addValues(target: string[], values: readonly string[]): void {
  for (const value of values) {
    addUnique(target, value);
  }
}

export function analyzeStructuredHead(
  head: PageHeadSettings | undefined,
): CspSourceRequirements {
  const requirements = createEmptyCspRequirements();
  if (!head) return requirements;

  for (const script of head.scripts ?? []) {
    if (typeof script.src === "string") {
      const origin = normalizeOrigin(script.src);
      if (origin) addUnique(requirements.scriptSrc, origin);
    }
    if (typeof script.content === "string" && script.content.trim()) {
      requirements.usesInlineScript = true;
    }
  }

  for (const link of head.links ?? []) {
    if (link.rel === "stylesheet") {
      const origin = normalizeOrigin(link.href);
      if (origin) addUnique(requirements.styleSrc, origin);
    }

    if (link.rel === "preload") {
      const origin = normalizeOrigin(link.href);
      if (!origin) continue;

      switch (link.as) {
        case "font":
          addUnique(requirements.fontSrc, origin);
          break;
        case "image":
          addUnique(requirements.imgSrc, origin);
          break;
        case "script":
          addUnique(requirements.scriptSrc, origin);
          break;
        case "style":
          addUnique(requirements.styleSrc, origin);
          break;
      }
    }
  }

  return CspSourceRequirementsSchema.parse(requirements);
}

export function analyzeRenderPipelineRequirements(
  input: RenderPipelineInput,
): CspSourceRequirements {
  const requirements = createEmptyCspRequirements();

  if (!input.globalCSSEnabled) {
    if (input.framework === "unocss") {
      addUnique(requirements.scriptSrc, "https://cdn.jsdelivr.net");
      requirements.usesInlineScript = true;
    } else if (input.framework === "custom") {
      const origin = normalizeOrigin(input.customFrameworkURL);
      if (origin) {
        addUnique(requirements.styleSrc, origin);
      }
    } else {
      addUnique(requirements.scriptSrc, "https://cdn.tailwindcss.com");
    }
  }

  if (input.customFonts?.googleFonts) {
    const googleFonts = Object.values(input.customFonts.googleFonts);
    if (googleFonts.length > 0) {
      addUnique(requirements.styleSrc, "https://fonts.googleapis.com");
      addUnique(requirements.fontSrc, "https://fonts.gstatic.com");
    }
  }

  if (input.includesStructuredDataJsonLd) {
    // Published pages always embed inline application/ld+json scripts.
    requirements.usesInlineScript = true;
  }

  if (input.darkMode === "class") {
    requirements.usesInlineScript = true;
  }

  return CspSourceRequirementsSchema.parse(requirements);
}

export function planEffectiveCsp(input: {
  analytics: CompiledAnalyticsCspRequirements;
  customCode: CustomCodeAnalysis;
  structuredHead?: CspSourceRequirements;
  renderPipeline?: CspSourceRequirements;
}): EffectiveCspPlan {
  const analytics = CspSourceRequirementsSchema.parse(input.analytics);
  const customCode = CustomCodeAnalysisSchema.parse(input.customCode);
  const structuredHead = CspSourceRequirementsSchema.parse(
    input.structuredHead ?? createEmptyCspRequirements(),
  );
  const renderPipeline = CspSourceRequirementsSchema.parse(
    input.renderPipeline ?? createEmptyCspRequirements(),
  );

  const directives: EffectiveCspPlan["directives"] = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'", "https:", "wss:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    frameSrc: ["'self'"],
    fontSrc: ["'self'", "data:", "https:"],
    styleSrc: ["'self'", "'unsafe-inline'", "https:"],
    mediaSrc: ["'self'", "blob:", "https:"],
  };

  addValues(directives.scriptSrc, analytics.scriptSrc);
  addValues(directives.scriptSrc, structuredHead.scriptSrc);
  addValues(directives.scriptSrc, renderPipeline.scriptSrc);
  addValues(directives.scriptSrc, customCode.scriptSrc);

  addValues(directives.connectSrc, analytics.connectSrc);
  addValues(directives.connectSrc, structuredHead.connectSrc);
  addValues(directives.connectSrc, renderPipeline.connectSrc);
  addValues(directives.connectSrc, customCode.connectSrc);

  addValues(directives.imgSrc, analytics.imgSrc);
  addValues(directives.imgSrc, structuredHead.imgSrc);
  addValues(directives.imgSrc, renderPipeline.imgSrc);
  addValues(directives.imgSrc, customCode.imgSrc);

  addValues(directives.frameSrc, analytics.frameSrc);
  addValues(directives.frameSrc, structuredHead.frameSrc);
  addValues(directives.frameSrc, renderPipeline.frameSrc);
  addValues(directives.frameSrc, customCode.frameSrc);

  addValues(directives.fontSrc, analytics.fontSrc);
  addValues(directives.fontSrc, structuredHead.fontSrc);
  addValues(directives.fontSrc, renderPipeline.fontSrc);
  addValues(directives.fontSrc, customCode.fontSrc);

  addValues(directives.styleSrc, analytics.styleSrc);
  addValues(directives.styleSrc, structuredHead.styleSrc);
  addValues(directives.styleSrc, renderPipeline.styleSrc);
  addValues(directives.styleSrc, customCode.styleSrc);

  addValues(directives.mediaSrc, analytics.mediaSrc);
  addValues(directives.mediaSrc, structuredHead.mediaSrc);
  addValues(directives.mediaSrc, renderPipeline.mediaSrc);
  addValues(directives.mediaSrc, customCode.mediaSrc);

  const hasInlineScript =
    analytics.usesInlineScript ||
    structuredHead.usesInlineScript ||
    renderPipeline.usesInlineScript ||
    customCode.inlineScripts > 0 ||
    customCode.inlineEventHandlers > 0;

  if (hasInlineScript) {
    addUnique(directives.scriptSrc, "'unsafe-inline'");
  }

  const hasInlineStyle =
    analytics.usesInlineStyle ||
    structuredHead.usesInlineStyle ||
    renderPipeline.usesInlineStyle ||
    customCode.inlineStyles > 0;

  if (hasInlineStyle) {
    addUnique(directives.styleSrc, "'unsafe-inline'");
  }

  const warnings = [...customCode.warnings];
  if (analytics.usesInlineScript) {
    warnings.push(
      "Built-in analytics configuration includes inline bootstrap scripts.",
    );
  }
  if (structuredHead.usesInlineScript) {
    warnings.push("Page head settings include inline scripts.");
  }
  if (renderPipeline.usesInlineScript) {
    warnings.push("Render pipeline requires inline runtime script support.");
  }

  const plan: EffectiveCspPlan = {
    directives,
    riskFlags: {
      hasInlineScript,
      hasInlineEventHandlers: customCode.inlineEventHandlers > 0,
      hasUnknownScriptOrigin: customCode.unknownPatterns.some((pattern) =>
        pattern.includes(":script src:"),
      ),
      hasUnknownFrameOrigin: customCode.unknownPatterns.some((pattern) =>
        pattern.includes(":iframe src:"),
      ),
      hasCustomCode:
        customCode.inlineScripts > 0 ||
        customCode.inlineEventHandlers > 0 ||
        customCode.inlineStyles > 0 ||
        customCode.scriptSrc.length > 0 ||
        customCode.frameSrc.length > 0 ||
        customCode.styleSrc.length > 0 ||
        customCode.imgSrc.length > 0 ||
        customCode.mediaSrc.length > 0,
    },
    warnings: Array.from(new Set(warnings)),
  };

  return EffectiveCspPlanSchema.parse(plan);
}

export function serializeCspHeaderValue(plan: EffectiveCspPlan): string {
  const parsedPlan = EffectiveCspPlanSchema.parse(plan);

  return Object.entries(parsedPlan.directives)
    .map(([key, values]) => {
      if (values.length === 0) return "";
      const directiveName = key.replace(
        /[A-Z]/g,
        (match) => `-${match.toLowerCase()}`,
      );
      return `${directiveName} ${values.join(" ")}`;
    })
    .filter(Boolean)
    .join("; ");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderCspMetaTag(plan: EffectiveCspPlan): string {
  const headerValue = serializeCspHeaderValue(plan);
  return `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(headerValue)}">`;
}
