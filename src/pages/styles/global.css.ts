/**
 * Serves compiled UnoCSS + custom classes + fonts with aggressive edge caching for production performance. Cloudflare/Netlify/Vercel automatically cache.
 * @route GET /styles/global.css
 */

import type { APIRoute } from "astro";
import { getStorageAdapterAsync } from "../../../aria/lib/storage/getStorageAdapter";
import { log } from "../../../aria/lib/utils/logger";

export const GET: APIRoute = async ({ locals, request }) => {
  try {
    // Get storage adapter (works in both dev and production)
    const adapter = await getStorageAdapterAsync(locals);
    const url = new URL(request.url);
    const isPreviewRequest = url.searchParams.get("preview") === "1";

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
    const requestedVersion = url.searchParams.get("v");
    const hasMatchingVersion = requestedVersion === globalCSSHash;

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
        "Cache-Control": isPreviewRequest
          ? "no-store, must-revalidate"
          : hasMatchingVersion
            ? "public, max-age=31536000, immutable"
            : "no-cache, must-revalidate",
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
