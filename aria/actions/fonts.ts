/**
 * Astro actions for managing custom fonts and Google Fonts integration. Supports
 * uploading custom fonts (stored in R2/local) and enabling/disabling Google Fonts.
 */

import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import type { ActionAPIContext } from "astro:actions";
import type { StorageAdapter } from "../lib/storage/adapter";
import {
  createDefaultUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../lib/styles/universalDesignSystem";
import type { CustomFont, GoogleFont } from "../lib/types/classes";
import { buildGoogleFontsURL } from "../lib/styles/generateCustomCSS";
import { resolveUniqueFontStoragePath } from "../lib/media/utils/font-filenames";
import { requireAuth, resolveAuthorizedMutation } from "./_shared";
import type { AuthorshipSaveContext } from "./_shared";
import { persistDesignSystem } from "./_designSystemPersist";
import { log as baseLog } from "../lib/utils/logger";

interface GoogleFontMeta {
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
}

interface CustomFontEntry extends CustomFont {
  id: string;
  name: string;
  family: string;
  url?: string;
  format?: string;
  weight?: string;
  style?: string;
  uploadedAt: string;
}

interface AdapterWithSaveMedia extends StorageAdapter {
  saveMedia: (
    path: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      alt?: string;
      [key: string]: unknown;
    },
  ) => Promise<string>;
}

const FontDiscoveryAssetSchema = z.object({
  path: z.string().min(1),
  url: z.string().min(1),
  size: z.number().nonnegative(),
  contentType: z.string().optional(),
  createdAt: z.string(),
});

// In-memory cache for Google Fonts list (loaded from bundled JSON)
let googleFontsCache: GoogleFontMeta[] | null = null;

// Popular Google Fonts (for sorting - these appear first)
const POPULAR_FONTS = new Set([
  "Outfit",
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Source Sans Pro",
  "Raleway",
  "Nunito",
  "Work Sans",
  "DM Sans",
  "Space Grotesk",
  "Manrope",
  "Plus Jakarta Sans",
  "Bricolage Grotesque",
  "Instrument Serif",
  "Geist",
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
]);

async function getAdapter(context: ActionAPIContext): Promise<StorageAdapter> {
  return getStorageAdapterAsync(context.locals);
}

async function getDesignSystem(
  adapter: StorageAdapter,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystem()) ?? createDefaultUniversalDesignSystem()
  );
}

async function saveDesignSystem(
  adapter: StorageAdapter,
  designSystem: UniversalDesignSystem,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  await persistDesignSystem(adapter, designSystem, authorship);
}

async function refreshRenderStylesAfterFontMutation(
  adapter: StorageAdapter,
  mutationTarget: string,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  try {
    const stylesModule = await import("./styles");
    await stylesModule.regenerateGlobalCSSArtifacts(adapter, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts: true,
      authorship,
    });
  } catch (error) {
    baseLog("warn", "[fonts] Render style refresh failed", {
      mutationTarget,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Determine font format from file extension
 */
function getFontFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
    default:
      return "woff2";
  }
}

/**
 * Validate font file type
 */
function isValidFontFile(filename: string): boolean {
  const validExtensions = ["woff2", "woff", "ttf", "otf", "eot"];
  const ext = filename.split(".").pop()?.toLowerCase();
  return validExtensions.includes(ext || "");
}

function generateFontFamily(name: string): string {
  // Remove special characters and normalize spaces
  return name
    .replace(/\.[^.]+$/, "") // Remove extension
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Infer font category from font family name The bundled JSON doesn't include
 * category, so we infer it from naming patterns. This is a.
 */
function inferFontCategory(family: string): string {
  const lower = family.toLowerCase();

  if (
    lower.includes("mono") ||
    lower.includes("code") ||
    lower.includes("console") ||
    lower.includes("courier") ||
    lower.includes("fira code") ||
    lower.includes("jetbrains")
  ) {
    return "monospace";
  }

  if (
    lower.includes("script") ||
    lower.includes("hand") ||
    lower.includes("cursive") ||
    lower.includes("brush") ||
    lower.includes("dancing") ||
    lower.includes("pacifico") ||
    lower.includes("caveat") ||
    lower.includes("satisfy") ||
    lower.includes("sacramento")
  ) {
    return "handwriting";
  }

  if (
    lower.includes("display") ||
    lower.includes("poster") ||
    lower.includes("black") ||
    lower.includes("ultra") ||
    lower.includes("impact") ||
    lower.includes("abril") ||
    lower.includes("bebas") ||
    lower.includes("lobster") ||
    lower.includes("righteous")
  ) {
    return "display";
  }

  if (
    (lower.includes("serif") && !lower.includes("sans")) ||
    lower.includes("times") ||
    lower.includes("georgia") ||
    lower.includes("garamond") ||
    lower.includes("bodoni") ||
    lower.includes("didot") ||
    lower.includes("playfair") ||
    lower.includes("merriweather") ||
    lower.includes("lora") ||
    lower.includes("crimson") ||
    lower.includes("libre baskerville") ||
    lower.includes("cormorant") ||
    lower.includes("eb garamond") ||
    lower.includes("noto serif") ||
    lower.includes("source serif") ||
    lower.includes("pt serif") ||
    lower.includes("roboto slab") ||
    lower.includes("bitter")
  ) {
    return "serif";
  }

  // Default to sans-serif (most common)
  return "sans-serif";
}

function inferUploadedFontFamilyFromFilename(filename: string): string {
  return generateFontFamily(filename)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrlPath(value: string): string {
  try {
    const pathname = new URL(value, "http://localhost").pathname;
    return pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function areEquivalentFontUrls(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  return normalizeUrlPath(left) === normalizeUrlPath(right);
}

function getFontUrls(font: {
  url?: string;
  formats?: Array<{ url?: string }>;
}): string[] {
  return Array.from(
    new Set(
      [font.url, ...(font.formats ?? []).map((format) => format.url)]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function deriveMediaPathFromFontUrl(fontUrl: string): string | null {
  try {
    const pathname = new URL(fontUrl, "http://localhost").pathname;
    if (pathname.startsWith("/uploads/")) {
      return pathname.replace(/^\/uploads\//, "");
    }

    return pathname.replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

async function listDiscoveredUploadedFonts(
  adapter: StorageAdapter,
): Promise<CustomFontEntry[]> {
  const files = await adapter.listMedia();

  return files
    .map((file) => FontDiscoveryAssetSchema.safeParse(file))
    .filter(
      (
        result,
      ): result is z.ZodSafeParseSuccess<
        z.infer<typeof FontDiscoveryAssetSchema>
      > => result.success,
    )
    .map((result) => result.data)
    .filter((file) => isValidFontFile(file.path))
    .map((file) => {
      const filename = file.path.split("/").pop() || file.path;
      const family = inferUploadedFontFamilyFromFilename(filename);
      return {
        id: `media-${file.path}`,
        name: family,
        family,
        url: file.url,
        format: getFontFormat(filename),
        formats: [
          {
            format: getFontFormat(filename),
            url: file.url,
          },
        ],
        weight: "400",
        style: "normal",
        uploadedAt: file.createdAt,
      } satisfies CustomFontEntry;
    });
}

function mergeDiscoveredAndRegisteredFonts(
  discoveredFonts: CustomFontEntry[],
  registeredFonts: Array<[string, CustomFontEntry]>,
): CustomFontEntry[] {
  const mergedFonts = new Map<string, CustomFontEntry>();
  const matchedRegisteredIds = new Set<string>();

  for (const discoveredFont of discoveredFonts) {
    const registeredMatch = registeredFonts.find(([registeredId, font]) => {
      if (matchedRegisteredIds.has(registeredId)) {
        return false;
      }

      const registeredUrls = getFontUrls(font);
      const discoveredUrls = getFontUrls(discoveredFont);

      if (
        registeredUrls.length > 0 &&
        discoveredUrls.some((url) =>
          registeredUrls.some((registeredUrl) =>
            areEquivalentFontUrls(registeredUrl, url),
          ),
        )
      ) {
        return true;
      }
    });

    if (registeredMatch) {
      const [registeredId, registeredFont] = registeredMatch;
      matchedRegisteredIds.add(registeredId);
      mergedFonts.set(registeredId, {
        ...discoveredFont,
        ...registeredFont,
        id: registeredId,
        url: registeredFont.url || discoveredFont.url,
        formats:
          registeredFont.formats.length > 0
            ? registeredFont.formats
            : discoveredFont.formats,
        format: registeredFont.format || discoveredFont.format,
        uploadedAt: registeredFont.uploadedAt || discoveredFont.uploadedAt,
      });
      continue;
    }

    mergedFonts.set(discoveredFont.id, discoveredFont);
  }

  for (const [registeredId, registeredFont] of registeredFonts) {
    if (!matchedRegisteredIds.has(registeredId)) {
      mergedFonts.set(registeredId, registeredFont);
    }
  }

  return Array.from(mergedFonts.values());
}

const ListGoogleFontsInputSchema = z
  .object({
    search: z.string().optional(),
    category: z
      .enum([
        "all",
        "sans-serif",
        "serif",
        "display",
        "handwriting",
        "monospace",
      ])
      .optional(),
    limit: z.number().min(1).max(500).optional(),
    offset: z.int().min(0).optional(),
  })
  .optional();

const EnableGoogleFontInputSchema = z.object({
  family: z.string(),
  variants: z.array(z.string()).optional(),
});

const DisableGoogleFontInputSchema = z.object({
  fontId: z.string(),
});

export async function handleListGoogleFonts(
  input: z.infer<typeof ListGoogleFontsInputSchema>,
  context: ActionAPIContext,
): Promise<unknown> {
  await requireAuth(context);

  try {
    // Check in-memory cache first
    if (googleFontsCache) {
      return filterFonts(googleFontsCache, input);
    }

    // Load from bundled JSON file
    const { default: bundledFonts } =
      await import("../lib/fonts/google-fonts.json");

    // Transform to our format (bundled JSON has {family, variants})
    const fonts: GoogleFontMeta[] = bundledFonts.map(
      (font: { family: string; variants: string[] }) => ({
        family: font.family,
        variants: font.variants,
        subsets: ["latin"], // Default subset
        // Infer category from font name (not perfect but works for most cases)
        category: inferFontCategory(font.family),
      }),
    );

    // Cache in memory
    googleFontsCache = fonts;

    return filterFonts(fonts, input);
  } catch (error) {
    baseLog("error", "[fonts.listGoogle] Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load Google Fonts",
    });
  }
}

export async function handleGetFontConfig(
  _input: void,
  context: ActionAPIContext,
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  await requireAuth(context);

  try {
    const adapter = await getAdapter(context);
    const designSystem = await getDesignSystem(adapter);
    const discoveredFonts = await listDiscoveredUploadedFonts(adapter);
    const registeredFonts = Object.entries(
      designSystem.fonts.uploaded,
    ) as Array<[string, CustomFontEntry]>;

    return {
      success: true,
      data: {
        customFonts: mergeDiscoveredAndRegisteredFonts(
          discoveredFonts,
          registeredFonts,
        ),
        enabledGoogleFonts: Object.values(designSystem.fonts.google),
      },
    };
  } catch (error) {
    baseLog("error", "[fonts.getConfig] Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get font configuration",
    });
  }
}

export async function handleEnableGoogleFont(
  input: z.infer<typeof EnableGoogleFontInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean; font: GoogleFont }> {
  const { family, variants } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "fonts.enableGoogle",
    "save-styles",
  );

  try {
    const adapter = await getAdapter(context);
    const designSystem = await getDesignSystem(adapter);

    const fontId = `google-${family.toLowerCase().replace(/\s+/g, "-")}`;
    const selectedVariants = variants || ["regular", "500", "700"];

    designSystem.fonts.google[fontId] = {
      id: fontId,
      family,
      variants: selectedVariants,
      googleFontsURL: generateGoogleFontsURL(family, selectedVariants),
    };

    await saveDesignSystem(adapter, designSystem, authorship);
    await refreshRenderStylesAfterFontMutation(
      adapter,
      `font:google:${fontId}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `font:google:${fontId}`,
      },
      context,
    );

    return {
      success: true,
      font: designSystem.fonts.google[fontId],
    };
  } catch (error) {
    if (error instanceof ActionError) throw error;
    baseLog("error", "[fonts.enableGoogle] Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to enable Google Font",
    });
  }
}

export async function handleDisableGoogleFont(
  input: z.infer<typeof DisableGoogleFontInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean }> {
  const { fontId } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "fonts.disableGoogle",
    "save-styles",
  );

  try {
    const adapter = await getAdapter(context);
    const designSystem = await getDesignSystem(adapter);

    if (!designSystem.fonts.google[fontId]) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Font not found",
      });
    }

    delete designSystem.fonts.google[fontId];
    await saveDesignSystem(adapter, designSystem, authorship);
    await refreshRenderStylesAfterFontMutation(
      adapter,
      `font:google:${fontId}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `font:google:${fontId}`,
      },
      context,
    );

    return { success: true };
  } catch (error) {
    if (error instanceof ActionError) throw error;
    baseLog("error", "[fonts.disableGoogle] Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to disable Google Font",
    });
  }
}

export const fonts = {
  /**
   * List all Google Fonts
   *
   * Reads from bundled google-fonts.json (no API key required).
   * Contains 1,899 fonts from Google Fonts catalog.
   */
  listGoogle: defineAction({
    accept: "json",
    input: ListGoogleFontsInputSchema,
    handler: handleListGoogleFonts,
  }),

  /**
   * Get current font configuration
   *
   * Returns custom fonts and enabled Google Fonts from styles.json
   */
  getConfig: defineAction({
    accept: "json",
    handler: handleGetFontConfig,
  }),

  /**
   * Upload a custom font file
   *
   * Stores font in uploads (local/R2) and registers in styles.json
   */
  uploadCustom: defineAction({
    accept: "form",
    input: z.object({
      file: z.instanceof(File),
      name: z.string().optional(),
      weight: z.string().optional(),
      style: z.enum(["normal", "italic"]).optional(),
    }),
    handler: async ({ file, name, weight, style }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "fonts.uploadCustom",
        "save-styles",
      );

      if (!isValidFontFile(file.name)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            "Invalid font file type. Supported: woff2, woff, ttf, otf, eot",
        });
      }

      try {
        const adapter = await getAdapter(context);

        // Upload font file to /uploads/fonts/
        const filename = await resolveUniqueFontStoragePath(
          (path) => adapter.getMedia(path),
          file.name,
        );
        const buffer = Buffer.from(await file.arrayBuffer());

        // Use saveMedia for uploading
        let url: string;
        if (typeof adapter.saveMedia === "function") {
          url = await (adapter as AdapterWithSaveMedia).saveMedia(
            filename,
            buffer,
            {
              contentType: file.type || "font/woff2",
            },
          );
        } else {
          // Fallback to uploadMedia
          const fontFile = new File([buffer], filename, { type: file.type });
          url = await adapter.uploadMedia(fontFile);
        }

        const fontId = `custom-${Date.now()}`;
        const fontName = name || generateFontFamily(file.name);
        const fontEntry: CustomFontEntry = {
          id: fontId,
          name: fontName,
          family: fontName,
          url,
          format: getFontFormat(file.name),
          formats: [
            {
              format: getFontFormat(file.name),
              url,
            },
          ],
          weight: weight || "400",
          style: style || "normal",
          uploadedAt: new Date().toISOString(),
        };

        const designSystem = await getDesignSystem(adapter);
        designSystem.fonts.uploaded[fontId] = fontEntry;
        await saveDesignSystem(adapter, designSystem, authorship);
        await refreshRenderStylesAfterFontMutation(
          adapter,
          `font:custom:${fontId}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `font:custom:${fontId}`,
          },
          context,
        );

        return {
          success: true,
          font: fontEntry,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        baseLog("error", "[fonts.uploadCustom] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload font",
        });
      }
    },
  }),

  /**
   * Delete a custom font
   *
   * Removes font file from storage and entry from styles.json
   */
  deleteCustom: defineAction({
    accept: "json",
    input: z.object({
      fontId: z.string(),
    }),
    handler: async ({ fontId }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "fonts.deleteCustom",
        "save-styles",
      );
      try {
        const adapter = await getAdapter(context);
        const designSystem = await getDesignSystem(adapter);

        const registeredFonts = Object.entries(
          designSystem.fonts.uploaded,
        ) as Array<[string, CustomFontEntry]>;
        const directRegisteredMatch = registeredFonts.find(
          ([registeredId]) => registeredId === fontId,
        );
        const mediaPathFromId = fontId.startsWith("media-")
          ? fontId.slice("media-".length)
          : null;

        if (!directRegisteredMatch && !mediaPathFromId) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Font not found",
          });
        }

        const matchingAsset = mediaPathFromId
          ? (await adapter.listMedia()).find(
              (asset) => asset.path === mediaPathFromId,
            )
          : null;
        const fontUrls = directRegisteredMatch
          ? getFontUrls(directRegisteredMatch[1])
          : matchingAsset
            ? [matchingAsset.url]
            : [];
        const selectedRegisteredId = directRegisteredMatch?.[0] ?? null;
        const matchedRegisteredIds = registeredFonts
          .filter(([, font]) => {
            if (directRegisteredMatch) {
              return getFontUrls(font).some((url) =>
                fontUrls.some((selectedUrl) =>
                  areEquivalentFontUrls(url, selectedUrl),
                ),
              );
            }

            if (!matchingAsset) {
              return false;
            }

            return getFontUrls(font).some((url) =>
              areEquivalentFontUrls(url, matchingAsset.url),
            );
          })
          .map(([registeredId]) => registeredId);

        if (
          selectedRegisteredId &&
          !matchedRegisteredIds.includes(selectedRegisteredId)
        ) {
          matchedRegisteredIds.unshift(selectedRegisteredId);
        }

        for (const registeredId of matchedRegisteredIds) {
          delete designSystem.fonts.uploaded[registeredId];
        }

        const remainingRegisteredFonts = Object.values(
          designSystem.fonts.uploaded,
        ) as CustomFontEntry[];
        const shouldDeleteFile =
          fontUrls.length > 0
            ? !remainingRegisteredFonts.some((font) =>
                getFontUrls(font).some((url) =>
                  fontUrls.some((selectedUrl) =>
                    areEquivalentFontUrls(url, selectedUrl),
                  ),
                ),
              )
            : Boolean(mediaPathFromId);

        // Try to delete the font file (best effort)
        try {
          if (!shouldDeleteFile) {
            return { success: true };
          }

          let filePath = mediaPathFromId ?? null;

          if (!filePath && fontUrls.length > 0) {
            const mediaAssets = await adapter.listMedia();
            const matchingMediaAsset = mediaAssets.find((asset) =>
              fontUrls.some((fontUrl) =>
                areEquivalentFontUrls(fontUrl, asset.url),
              ),
            );

            filePath = matchingMediaAsset?.path ?? null;
          }

          if (!filePath && fontUrls.length > 0) {
            filePath =
              fontUrls
                .map((fontUrl) => deriveMediaPathFromFontUrl(fontUrl))
                .find((candidate): candidate is string => Boolean(candidate)) ??
              null;
          }

          if (filePath) {
            await adapter.deleteMedia(filePath);
          }
        } catch (deleteError) {
          console.warn(
            "[fonts.deleteCustom] Could not delete font file:",
            deleteError,
          );
        }
        await saveDesignSystem(adapter, designSystem, authorship);
        await refreshRenderStylesAfterFontMutation(
          adapter,
          `font:custom:${matchedRegisteredIds[0] || fontId}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `font:custom:${matchedRegisteredIds[0] || fontId}`,
          },
          context,
        );

        return { success: true };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        baseLog("error", "[fonts.deleteCustom] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete font",
        });
      }
    },
  }),

  /**
   * Rename a custom font label
   *
   * Updates the display name shown in the admin UI without changing the
   * underlying CSS font-family assignment.
   */
  renameCustom: defineAction({
    accept: "json",
    input: z.object({
      fontId: z.string(),
      name: z.string().min(1).max(120),
    }),
    handler: async ({ fontId, name }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "fonts.renameCustom",
        "save-styles",
      );

      try {
        const adapter = await getAdapter(context);
        const designSystem = await getDesignSystem(adapter);
        const font = designSystem.fonts.uploaded[fontId] as
          | CustomFontEntry
          | undefined;

        if (!font) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Custom font not found",
          });
        }

        const trimmedName = name.trim();
        if (!trimmedName) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Font name is required",
          });
        }

        font.name = trimmedName;
        await saveDesignSystem(adapter, designSystem, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `font:custom:rename:${fontId}`,
          },
          context,
        );

        return {
          success: true,
          font,
        };
      } catch (error) {
        if (error instanceof ActionError) {
          throw error;
        }

        baseLog("error", "[fonts.renameCustom] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to rename font",
        });
      }
    },
  }),

  /**
   * Enable a Google Font for use in the Composer
   */
  enableGoogle: defineAction({
    accept: "json",
    input: EnableGoogleFontInputSchema,
    handler: handleEnableGoogleFont,
  }),

  /**
   * Disable a Google Font
   */
  disableGoogle: defineAction({
    accept: "json",
    input: DisableGoogleFontInputSchema,
    handler: handleDisableGoogleFont,
  }),

  /**
   * Update enabled Google Font variants
   */
  updateGoogleVariants: defineAction({
    accept: "json",
    input: z.object({
      fontId: z.string(),
      variants: z.array(z.string()),
    }),
    handler: async ({ fontId, variants }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "fonts.updateGoogleVariants",
        "save-styles",
      );

      try {
        const adapter = await getAdapter(context);
        const designSystem = await getDesignSystem(adapter);

        if (!designSystem.fonts.google[fontId]) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Font not found",
          });
        }

        const font = designSystem.fonts.google[fontId];
        font.variants = variants;
        font.googleFontsURL = generateGoogleFontsURL(font.family, variants);

        await saveDesignSystem(adapter, designSystem, authorship);
        await refreshRenderStylesAfterFontMutation(
          adapter,
          `font:google:${fontId}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `font:google:${fontId}`,
          },
          context,
        );

        return {
          success: true,
          font,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        baseLog("error", "[fonts.updateGoogleVariants] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update font variants",
        });
      }
    },
  }),
};

function filterFonts(
  fonts: GoogleFontMeta[],
  input?: {
    search?: string;
    category?: string;
    limit?: number;
    offset?: number;
  },
) {
  let filtered = fonts.slice();

  if (input?.search) {
    const search = input.search.toLowerCase();
    filtered = filtered.filter((f) => f.family.toLowerCase().includes(search));
  }

  if (input?.category && input.category !== "all") {
    filtered = filtered.filter((f) => f.category === input.category);
  }

  // Sort: popular fonts first, then alphabetically
  filtered.sort((a, b) => {
    const aPopular = POPULAR_FONTS.has(a.family);
    const bPopular = POPULAR_FONTS.has(b.family);
    if (aPopular && !bPopular) return -1;
    if (!aPopular && bPopular) return 1;
    return a.family.localeCompare(b.family);
  });

  const total = filtered.length;
  const offset = input?.offset ?? 0;
  const limit = input?.limit ?? total;
  filtered = filtered.slice(offset, offset + limit);

  return {
    success: true,
    fonts: filtered,
    total,
    offset,
    limit,
    hasMore: offset + filtered.length < total,
  };
}

function generateGoogleFontsURL(family: string, variants: string[]): string {
  const normalizedVariants = variants.map((variant) => {
    if (variant === "regular") return "400";
    if (variant === "italic") return "400italic";
    return variant;
  });

  return buildGoogleFontsURL(family, normalizedVariants);
}
