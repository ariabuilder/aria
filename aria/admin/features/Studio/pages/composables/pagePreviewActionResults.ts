import { z } from "zod";

import { log } from "@/lib/utils/logger";
import type { SiteSettings } from "@/lib/storage/adapter";
import { BuilderNodeSchema } from "@/lib/schemas/nodes";
import { unwrapSettingsActionResult } from "@/composables/settingsActionResults";

type ActionEnvelope =
  | {
      data?: unknown;
      error?: { message?: string | undefined } | null;
    }
  | null
  | undefined;

const ActionErrorSchema = z
  .looseObject({
    message: z.string().optional(),
  });

const PagePreviewComposeSchema = z
  .looseObject({
    pageBlocks: z.array(BuilderNodeSchema),
    pageMetadata: z
      .looseObject({
        settings: z
          .looseObject({
            cssVariables: z.record(z.string(), z.string()).optional(),
          }).optional(),
      }).optional(),
  });

const PagePreviewGlobalCssResultSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z
      .looseObject({
        globalCSS: z.string(),
      }),
  }),
  z.object({
    success: z.literal(false),
    error: ActionErrorSchema.optional(),
  }),
]);

const PagePreviewRenderStylesResultSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z
      .looseObject({
        baseCSS: z.string(),
        baseCSSHash: z.string(),
        customClassesCSS: z.string(),
        customFontsCSS: z.string(),
        globalCSS: z.string(),
        globalCSSHash: z.string(),
        lastCompiled: z.string(),
        styleRevision: z.string(),
        utilityCSS: z.string(),
        utilityCSSHash: z.string(),
        utilityEngine: z.enum(["unocss", "custom"]),
      }),
  }),
  z.object({
    success: z.literal(false),
    error: ActionErrorSchema.optional(),
  }),
]);

export interface PagePreviewComposeData {
  pageBlocks: z.infer<typeof BuilderNodeSchema>[];
  pageCssVariables: Record<string, string>;
}

export interface PagePreviewRenderStylesData {
  baseCSS: string;
  baseCSSHash: string;
  customClassesCSS: string;
  customFontsCSS: string;
  globalCSS: string;
  globalCSSHash: string;
  lastCompiled: string;
  styleRevision: string;
  utilityCSS: string;
  utilityCSSHash: string;
  utilityEngine: "unocss" | "custom";
}

export type PagePreviewActionResult<TData> =
  | { success: true; data: TData }
  | { success: false; data: TData; error: string };

export function unwrapPagePreviewComposeResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): PagePreviewActionResult<PagePreviewComposeData> {
  if (result?.error?.message) {
    return {
      success: false,
      data: { pageBlocks: [], pageCssVariables: {} },
      error: result.error.message,
    };
  }

  const parsed = PagePreviewComposeSchema.safeParse(result?.data);

  if (!parsed.success) {
    log("warn", "[Studio/PagePreview] Invalid compose response", {
      ...context,
      issues: parsed.error.issues,
    });
    return {
      success: false,
      data: { pageBlocks: [], pageCssVariables: {} },
      error: fallbackMessage,
    };
  }

  return {
    success: true,
    data: {
      pageBlocks: parsed.data.pageBlocks,
      pageCssVariables: parsed.data.pageMetadata?.settings?.cssVariables ?? {},
    },
  };
}

export function unwrapPagePreviewSettingsResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): PagePreviewActionResult<SiteSettings | null> {
  if (result?.error?.message) {
    return {
      success: false,
      data: null,
      error: result.error.message,
    };
  }

  try {
    return {
      success: true,
      data: unwrapSettingsActionResult(result?.data),
    };
  } catch (error) {
    log("warn", "[Studio/PagePreview] Invalid settings response", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      data: null,
      error: fallbackMessage,
    };
  }
}

export function unwrapPagePreviewGlobalCssResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): PagePreviewActionResult<string> {
  if (result?.error?.message) {
    return {
      success: false,
      data: "",
      error: result.error.message,
    };
  }

  const parsed = PagePreviewGlobalCssResultSchema.safeParse(result?.data);

  if (!parsed.success) {
    log("warn", "[Studio/PagePreview] Invalid global CSS response", {
      ...context,
      issues: parsed.error.issues,
    });
    return {
      success: false,
      data: "",
      error: fallbackMessage,
    };
  }

  if (!parsed.data.success) {
    return {
      success: false,
      data: "",
      error: parsed.data.error?.message ?? fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsed.data.data.globalCSS,
  };
}

export function unwrapPagePreviewRenderStylesResult(
  result: ActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): PagePreviewActionResult<PagePreviewRenderStylesData> {
  if (result?.error?.message) {
    return {
      success: false,
      data: {
        baseCSS: "",
        baseCSSHash: "",
        customClassesCSS: "",
        customFontsCSS: "",
        globalCSS: "",
        globalCSSHash: "",
        lastCompiled: "",
        styleRevision: "",
        utilityCSS: "",
        utilityCSSHash: "",
        utilityEngine: "custom",
      },
      error: result.error.message,
    };
  }

  const parsed = PagePreviewRenderStylesResultSchema.safeParse(result?.data);

  if (!parsed.success) {
    log("warn", "[Studio/PagePreview] Invalid render styles response", {
      ...context,
      issues: parsed.error.issues,
    });
    return {
      success: false,
      data: {
        baseCSS: "",
        baseCSSHash: "",
        customClassesCSS: "",
        customFontsCSS: "",
        globalCSS: "",
        globalCSSHash: "",
        lastCompiled: "",
        styleRevision: "",
        utilityCSS: "",
        utilityCSSHash: "",
        utilityEngine: "custom",
      },
      error: fallbackMessage,
    };
  }

  if (!parsed.data.success) {
    return {
      success: false,
      data: {
        baseCSS: "",
        baseCSSHash: "",
        customClassesCSS: "",
        customFontsCSS: "",
        globalCSS: "",
        globalCSSHash: "",
        lastCompiled: "",
        styleRevision: "",
        utilityCSS: "",
        utilityCSSHash: "",
        utilityEngine: "custom",
      },
      error: parsed.data.error?.message ?? fallbackMessage,
    };
  }

  return {
    success: true,
    data: parsed.data.data,
  };
}
