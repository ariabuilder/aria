/**
 * Serves compiled UnoCSS + custom classes + fonts with aggressive edge caching for production performance. Cloudflare/Netlify/Vercel automatically cache.
 * @route GET /styles/global.css
 */

import type { APIRoute } from "astro";
import { buildGlobalCSSArtifactsSnapshot } from "../../../aria/actions/styles";
import { getAuthAdapterAsync, getSessionIdFromCookies } from "../../../aria/lib/auth";
import { getStorageAdapterAsync } from "../../../aria/lib/storage/getStorageAdapter";
import { readSessionUserFromLocals } from "../../../aria/lib/runtime/requestLocals";
import { log } from "../../../aria/lib/utils/logger";

export const GET: APIRoute = async ({ locals, request, cookies }) => {
  try {
    // Get storage adapter (works in both dev and production)
    const adapter = await getStorageAdapterAsync(locals);
    const url = new URL(request.url);
    const isPreviewRequest = url.searchParams.get("preview") === "1";

    let previewUser = readSessionUserFromLocals(locals);
    if (isPreviewRequest && !previewUser) {
      const sessionId = getSessionIdFromCookies(cookies);

      if (sessionId) {
        const authAdapter = await getAuthAdapterAsync(locals);
        previewUser = await authAdapter.getSessionUser(sessionId);
      }
    }

    if (isPreviewRequest && previewUser) {
      try {
        const freshSnapshot = await buildGlobalCSSArtifactsSnapshot(adapter);
        return new Response(freshSnapshot.designSystem.artifacts.globalCSS, {
          status: 200,
          headers: {
            "Content-Type": "text/css; charset=utf-8",
            "Cache-Control": "no-store, must-revalidate",
          },
        });
      } catch (previewCompileError) {
        const designSystem = await adapter.getDesignSystem();
        const storedGlobalCSS = designSystem?.artifacts.globalCSS;

        if (storedGlobalCSS) {
          log("warn", "Preview global CSS compile failed; serving stored artifacts", {
            error:
              previewCompileError instanceof Error
                ? previewCompileError.message
                : String(previewCompileError),
          });

          return new Response(storedGlobalCSS, {
            status: 200,
            headers: {
              "Content-Type": "text/css; charset=utf-8",
              "Cache-Control": "no-store, must-revalidate",
            },
          });
        }

        throw previewCompileError;
      }
    }

    // Load canonical design-system artifacts from storage
    const designSystem = await adapter.getDesignSystem();
    const globalCSS = designSystem?.artifacts.globalCSS;
    const globalCSSHash = designSystem?.artifacts.globalCSSHash;

    if (!globalCSS) {
      // No CSS generated yet - return empty CSS with instructions
      const fallbackCSS = `/* No global CSS generated yet. Please regenerate styles from the admin panel. */`;

      return new Response(fallbackCSS, {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-cache", // Don't cache empty CSS
        },
      });
    }

    // Check for conditional request (browser cache)
    const ifNoneMatch = request.headers.get("If-None-Match");
    const etag = `"${globalCSSHash}"`;

    if (ifNoneMatch === etag) {
      // Browser has current version - return 304 Not Modified
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
        },
      });
    }

    // Return CSS with aggressive caching headers
    return new Response(globalCSS, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        // Cache for 1 year (hash changes on updates)
        "Cache-Control": "public, max-age=31536000, immutable",
        // ETag for cache validation
        ETag: etag,
        // Optional: Add CORS headers if serving to external domains
        // 'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    log("error", "Error serving global CSS", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return error CSS with helpful message
    const errorCSS = `/* Error loading CSS: ${
      error instanceof Error ? error.message : "Unknown error"
    } */`;

    return new Response(errorCSS, {
      status: 500,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
};
