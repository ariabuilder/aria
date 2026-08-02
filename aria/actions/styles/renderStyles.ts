import { defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { getRuntimeKVNamespace } from "../../lib/cloudflare/env";
import { resolveBreakpointDefinitionsFromDesignSystem } from "../../lib/styles/universalDesignSystem";
import { requireAuth } from "../_shared";
import { resolveSiteStyleRevision } from "../../lib/storage/adapter";
import {
  endPerformanceTracking,
  generateCSSHash,
  getDesignSystem,
  log,
  startPerformanceTracking,
  type StylesStorageAdapter,
} from "./_shared";
import {
  buildGeneratedDocumentStyleBands,
  buildStageRenderStylesData,
  buildStoredRenderStylesData,
} from "./globalCssArtifacts";

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

const RENDER_STYLES_CACHE_VERSION = 2;
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

export const getRenderStylesAction = defineAction({
  accept: "json",
  handler: async (_, context) => {
    await requireAuth(context);

    const operation = "getRenderStyles";
    startPerformanceTracking(operation);

    try {
      const adapter = await getStorageAdapterAsync(context.locals);
      const [siteSettings, contentState] = await Promise.all([
        adapter.getSiteSettings(),
        typeof adapter.getContentSiteState === "function"
          ? adapter.getContentSiteState()
          : Promise.resolve(null),
      ]);
      const styleRevision = resolveSiteStyleRevision(siteSettings);
      const contentSignature =
        contentState?.currentRevisionId ??
        (await buildRenderStylesContentSignature(adapter));

      // Design changes bump `styleRevision`; content actions atomically bump
      // the single content revision. This avoids three collection scans for
      // every cache lookup.
      const cacheKV = getRenderStylesCacheKV(context);
      const cacheKey = buildRenderStylesCacheKey(
        styleRevision,
        contentSignature,
      );

      const memoryCached = getMemoryCachedRenderStyles(cacheKey);
      if (memoryCached) {
        const duration = endPerformanceTracking(operation);
        log("info", "Render styles loaded (memory cache hit)", {
          duration: `${duration}ms`,
          styleRevision,
          contentSignature,
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
              contentSignature,
              cacheKey,
            });
            return { success: true, data: cached };
          }
        }
      }

      const designSystem = await getDesignSystem(adapter);
      const generatedStyleBands = await buildGeneratedDocumentStyleBands(
        adapter,
        resolveBreakpointDefinitionsFromDesignSystem(designSystem),
      );
      const storedRenderStyles = buildStoredRenderStylesData(
        designSystem,
        siteSettings,
      );
      const renderStyles = buildStageRenderStylesData({
        storedRenderStyles,
        generatedDocumentCss: generatedStyleBands.generatedDocumentCss,
        rendererBaseFragment: generatedStyleBands.rendererBaseFragment,
      });

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
        contentSignature,
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
