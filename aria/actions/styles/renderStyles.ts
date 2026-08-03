import { defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { getRuntimeKVNamespace } from "../../lib/cloudflare/env";
import type { UniversalDesignSystem } from "../../lib/styles/universalDesignSystem";
import { requireAuth } from "../_shared";
import {
  getSiteSettingsUtilityEngine,
  resolveSiteStyleRevision,
  type SiteSettings,
} from "../../lib/storage/adapter";
import {
  endPerformanceTracking,
  generateCSSHash,
  getDesignSystem,
  log,
  startPerformanceTracking,
  type StylesStorageAdapter,
} from "./_shared";

const RenderStylesDataSchema = z.object({
  baseCSS: z.string(),
  baseCSSHash: z.string(),
  utilityCSS: z.string(),
  utilityCSSHash: z.string(),
  customClassesCSS: z.string(),
  contextRulesCSS: z.string().optional(),
  customFontsCSS: z.string(),
  globalCSS: z.string(),
  globalCSSHash: z.string(),
  lastCompiled: z.string(),
  styleRevision: z.string(),
  utilityEngine: z.enum(["unocss", "custom"]),
});

export type RenderStylesData = z.infer<typeof RenderStylesDataSchema>;

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete?(key: string): Promise<void>;
};

const RENDER_STYLES_CACHE_VERSION = 3;
const STORED_RENDER_STYLES_SIGNATURE = "stored-artifacts";
const RENDER_STYLES_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h
const RENDER_STYLES_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5m
const renderStylesMemoryCache = new Map<
  string,
  { data: RenderStylesData; expiresAt: number }
>();

function getRenderStylesCacheKV(
  context: ActionAPIContext,
): KVNamespaceLike | undefined {
  return getRuntimeKVNamespace(context.locals, "aria_cache");
}

export function buildRenderStylesCacheKey(
  styleRevision: string,
  contentSignature: string,
): string {
  return `render-styles:v${RENDER_STYLES_CACHE_VERSION}:${styleRevision}:${contentSignature}`;
}

function tryParseCachedRenderStyles(raw: string): RenderStylesData | null {
  try {
    const parsed = RenderStylesDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function getMemoryCachedRenderStyles(
  cacheKey: string,
): RenderStylesData | null {
  const cached = renderStylesMemoryCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    renderStylesMemoryCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setMemoryCachedRenderStyles(
  cacheKey: string,
  data: RenderStylesData,
): void {
  renderStylesMemoryCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + RENDER_STYLES_MEMORY_CACHE_TTL_MS,
  });
}

function stableContentSignaturePayload(items: {
  pages: Awaited<ReturnType<StylesStorageAdapter["listPagesDSL"]>>;
  layouts: Awaited<ReturnType<StylesStorageAdapter["listLayoutsDSL"]>>;
  components: Awaited<ReturnType<StylesStorageAdapter["listComponentsDSL"]>>;
}): string {
  const normalize = (item: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    version?: unknown;
    updatedAt?: unknown;
    updated_at?: unknown;
    status?: unknown;
    layout?: unknown;
  }) =>
    [
      String(item.id ?? item.slug ?? item.name ?? ""),
      String(item.version ?? ""),
      String(item.updatedAt ?? item.updated_at ?? ""),
      String(item.status ?? ""),
      String(item.layout ?? ""),
    ].join(":");

  return JSON.stringify({
    pages: items.pages.map(normalize).sort(),
    layouts: items.layouts.map(normalize).sort(),
    components: items.components.map(normalize).sort(),
  });
}

export async function buildRenderStylesContentSignature(
  adapter: StylesStorageAdapter,
): Promise<string> {
  const state =
    typeof adapter.getContentSiteState === "function"
      ? await adapter.getContentSiteState()
      : null;
  if (state?.currentRevisionId) {
    return state.currentRevisionId;
  }

  // A database created before content-revision state exists can still render
  // styles correctly. This fallback is deliberately temporary and read-heavy;
  // normal installations use the single revision read above.
  const [pages, layouts, components] = await Promise.all([
    adapter.listPagesDSL(),
    adapter.listLayoutsDSL(),
    adapter.listComponentsDSL(),
  ]);

  return generateCSSHash(
    stableContentSignaturePayload({ pages, layouts, components }),
  );
}

const STORED_RENDER_STYLE_SEGMENTS = [
  "artifacts-base-css",
  "artifacts-custom-classes-css",
  "artifacts-custom-fonts-css",
  "artifacts-compiled-unocss",
  "artifacts-global-css",
  "artifacts-utility-css",
  "artifacts-meta",
] as const;

function getCssHash(css: string, storedHash: string | undefined): string {
  return storedHash?.trim() || generateCSSHash(css);
}

/**
 * Builds the Stage payload from already-compiled storage artifacts only.
 * Current page-responsive rules are generated inside Stage from its active
 * node tree, so a read action must never scan every persisted surface.
 */
export function buildPersistedRenderStylesData(
  designSystem: UniversalDesignSystem,
  siteSettings: SiteSettings | null,
): RenderStylesData {
  const artifacts = designSystem.artifacts;
  const baseCSS = artifacts.baseCSS ?? "";
  const utilityCSS =
    artifacts.utilityCSS || artifacts.compiledUnoCSS || "";
  const customClassesCSS = artifacts.customClassesCSS ?? "";
  const customFontsCSS = artifacts.customFontsCSS ?? "";
  const globalCSS =
    artifacts.globalCSS ||
    [baseCSS, utilityCSS, customClassesCSS]
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n");

  return {
    baseCSS,
    baseCSSHash: getCssHash(baseCSS, artifacts.baseCSSHash),
    utilityCSS,
    utilityCSSHash: getCssHash(utilityCSS, artifacts.utilityCSSHash),
    customClassesCSS,
    customFontsCSS,
    globalCSS,
    globalCSSHash: getCssHash(globalCSS, artifacts.globalCSSHash),
    lastCompiled: artifacts.lastCompiled ?? "",
    styleRevision: resolveSiteStyleRevision(siteSettings),
    utilityEngine: getSiteSettingsUtilityEngine(siteSettings),
  };
}

async function getPersistedRenderStylesDesignSystem(
  adapter: StylesStorageAdapter,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystemSegments(STORED_RENDER_STYLE_SEGMENTS)) ??
    (await getDesignSystem(adapter))
  );
}

export const getRenderStylesAction = defineAction({
  accept: "json",
  handler: async (_, context) => {
    await requireAuth(context);

    const operation = "getRenderStyles";
    startPerformanceTracking(operation);

    try {
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const styleRevision = resolveSiteStyleRevision(siteSettings);
      const cacheKV = getRenderStylesCacheKV(context);
      const cacheKey = buildRenderStylesCacheKey(
        styleRevision,
        STORED_RENDER_STYLES_SIGNATURE,
      );

      const memoryCached = getMemoryCachedRenderStyles(cacheKey);
      if (memoryCached) {
        const duration = endPerformanceTracking(operation);
        log("info", "Render styles loaded (memory cache hit)", {
          duration: `${duration}ms`,
          styleRevision,
          cacheKey,
        });
        return { success: true, data: memoryCached };
      }

      if (cacheKV) {
        const cachedRaw = await cacheKV.get(cacheKey);
        if (cachedRaw) {
          const cached = tryParseCachedRenderStyles(cachedRaw);
          if (cached) {
            setMemoryCachedRenderStyles(cacheKey, cached);
            const duration = endPerformanceTracking(operation);
            log("info", "Render styles loaded (cache hit)", {
              duration: `${duration}ms`,
              styleRevision,
              cacheKey,
            });
            return { success: true, data: cached };
          }
        }
      }

      const designSystem = await getPersistedRenderStylesDesignSystem(adapter);
      const renderStyles = buildPersistedRenderStylesData(
        designSystem,
        siteSettings,
      );

      const parsed = RenderStylesDataSchema.parse(renderStyles);
      setMemoryCachedRenderStyles(cacheKey, parsed);

      if (cacheKV) {
        try {
          await cacheKV.put(cacheKey, JSON.stringify(parsed), {
            expirationTtl: RENDER_STYLES_CACHE_TTL_SECONDS,
          });
        } catch (cacheError) {
          // Cache writes are best-effort — log and move on so the request
          // still succeeds even if `aria_cache` is degraded.
          log("warn", "Failed to write render styles cache entry", {
            cacheKey,
            error:
              cacheError instanceof Error
                ? cacheError.message
                : String(cacheError),
          });
        }
      }

      const duration = endPerformanceTracking(operation);
      log("info", "Render styles loaded", {
        duration: `${duration}ms`,
        utilityEngine: renderStyles.utilityEngine,
        baseCssSize: renderStyles.baseCSS.length,
        utilityCssSize: renderStyles.utilityCSS.length,
        styleRevision,
        cached: false,
      });

      return { success: true, data: parsed };
    } catch (error) {
      endPerformanceTracking(operation);
      log("error", "Failed to get render styles", { error });
      return {
        success: false,
        error: {
          code: "GET_RENDER_STYLES_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get render styles",
        },
      };
    }
  },
});
