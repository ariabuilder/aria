/**
 * Server middleware: context detection and session auth (`Astro.locals`).
 *
 * CSRF for form posts uses Aria's origin check (`src/middleware/originCheck.ts`);
 * Astro `security.checkOrigin` is off so public form-encoded OAuth endpoints can
 * be exempted. SameSite=Lax session cookies remain the CSRF backstop for JSON/actions.
 */

import { defineMiddleware } from "astro:middleware";
import { env as cloudflareWorkerEnv } from "cloudflare:workers";
import {
  getCloudflareEnv,
  type AriaCloudflareEnv,
  type RuntimeLocals,
} from "../aria/lib/cloudflare/env";
import { getSessionIdFromCookies, getAuthAdapterAsync } from "../aria/lib/auth";
import { log } from "../aria/lib/utils/logger";
import { resolveUploadsRedirectTarget } from "./middleware/uploadsRedirect";
import { serveUploadsFromR2Binding } from "./middleware/serveUploadsFromR2";
import { serveUploadsFromLocalFilesystem } from "./middleware/serveUploadsFromLocal";
import { getStorageAdapterAsync } from "../aria/lib/storage/getStorageAdapter";
import { isStagingHost } from "../aria/lib/seo/stagingGuard";
import { resolvePublicRedirect } from "./lib/redirectMiddleware";
import { maybeReconcileScheduledPublications } from "../aria/lib/publishing/scheduler/middleware";
import { normalizeContentLocalization } from "../aria/lib/localization/contentLocale";
import { resolvePublicLocalePath } from "../aria/lib/localization/publicRoutes";
import {
  crossOriginFormForbiddenResponse,
  isForbiddenCrossOriginFormRequest,
} from "./middleware/originCheck";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  if (isForbiddenCrossOriginFormRequest(context.request, url)) {
    return crossOriginFormForbiddenResponse(context.request);
  }
  const isIntegrationProtocolRoute =
    url.pathname === "/.well-known/aria-integrations" ||
    url.pathname.startsWith("/oauth/") ||
    url.pathname === "/oauth-device.css" ||
    url.pathname === "/oauth-device.js" ||
    url.pathname === "/oauth-device.html";
  const isAria = url.searchParams.has("aria");
  const isPreview = url.searchParams.has("preview");
  const runtimeLocals = context.locals as RuntimeLocals;
  runtimeLocals.assetOrigin = url.origin;
  if (!runtimeLocals.cfBindings) {
    runtimeLocals.cfBindings =
      cloudflareWorkerEnv as unknown as AriaCloudflareEnv;
  }
  const env = getCloudflareEnv(runtimeLocals);

  // Serve /uploads/* from the bound R2 bucket in every environment. One-click
  // deploys have no R2 public CDN URL, so the Worker is the delivery path for
  // uploaded media and thumbnails until R2_PUBLIC_URL is configured.
  if (url.pathname.startsWith("/uploads/")) {
    try {
      const servedFromR2 = await serveUploadsFromR2Binding({
        requestUrl: context.request.url,
        requestHeaders: context.request.headers,
        bucket: env?.aria_r2 as
          | Parameters<typeof serveUploadsFromR2Binding>[0]["bucket"]
          | undefined,
      });
      if (servedFromR2) {
        return servedFromR2;
      }
    } catch (error) {
      log("warn", "[middleware] Failed to serve uploads from R2 binding", {
        error: error instanceof Error ? error.message : String(error),
        pathname: url.pathname,
      });
    }

    try {
      const servedFromDisk = await serveUploadsFromLocalFilesystem({
        requestUrl: context.request.url,
      });
      if (servedFromDisk) {
        return servedFromDisk;
      }
    } catch (error) {
      log(
        "warn",
        "[middleware] Failed to serve uploads from local filesystem",
        {
          error: error instanceof Error ? error.message : String(error),
          pathname: url.pathname,
        },
      );
    }
  }

  try {
    const target = resolveUploadsRedirectTarget({
      requestUrl: context.request.url,
      r2PublicUrl:
        typeof env?.R2_PUBLIC_URL === "string" ? env.R2_PUBLIC_URL : undefined,
    });

    if (target) {
      return Response.redirect(target, 307);
    }
  } catch (error) {
    log("warn", "[middleware] Invalid R2_PUBLIC_URL for uploads redirect", {
      error: error instanceof Error ? error.message : String(error),
      r2PublicUrl:
        typeof env?.R2_PUBLIC_URL === "string" ? env.R2_PUBLIC_URL : "",
    });
  }

  // Add composer context to locals
  context.locals.composerContext = {
    isComposer: isAria && !isPreview,
    isStage: isAria && isPreview,
  };

  // The Cloudflare custom worker handles MCP before Astro. Node development
  // does not use that worker entrypoint, and Astro's public catch-all page can
  // otherwise claim /mcp before the endpoint module is dispatched.
  if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
    const { handleMcpRoute } =
      await import("../aria/admin/features/Agent/server/routes");
    return handleMcpRoute(context.request, runtimeLocals);
  }

  if (
    !url.pathname.startsWith("/admin") &&
    !url.pathname.startsWith("/_actions") &&
    url.pathname !== "/api" &&
    !url.pathname.startsWith("/api/") &&
    !isIntegrationProtocolRoute
  ) {
    try {
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      const localeRoute = resolvePublicLocalePath({
        pathname: url.pathname,
        settings: normalizeContentLocalization(settings?.localization?.content),
      });
      runtimeLocals.publicLocale = localeRoute.locale;
      runtimeLocals.publicLocalePathname = localeRoute.pathname;

      if (
        localeRoute.redirectPathname &&
        (context.request.method === "GET" || context.request.method === "HEAD")
      ) {
        const target = new URL(context.request.url);
        target.pathname = localeRoute.redirectPathname;
        return Response.redirect(target, 308);
      }
    } catch (error) {
      log("warn", "[middleware] Locale resolution failed", {
        error: error instanceof Error ? error.message : String(error),
        pathname: url.pathname,
      });
    }
  }

  if (
    !url.pathname.startsWith("/admin") &&
    !url.pathname.startsWith("/_actions") &&
    url.pathname !== "/api" &&
    !url.pathname.startsWith("/api/") &&
    !isIntegrationProtocolRoute
  ) {
    try {
      const redirectResponse = await resolvePublicRedirect(context.locals, url);
      if (redirectResponse) {
        return redirectResponse;
      }
    } catch (error) {
      log("warn", "[middleware] Redirect lookup failed", {
        error: error instanceof Error ? error.message : String(error),
        pathname: url.pathname,
      });
    }
  }

  // Populate user from session (if authenticated)
  // Only check auth for protected /admin routes AND only if a session cookie exists
  const publicAuthRoutes = [
    "/admin/login",
    "/admin/setup",
    "/admin/forgot-password",
    "/admin/reset-password",
  ];
  const isPublicAuthRoute = publicAuthRoutes.some(
    (route) => url.pathname === route,
  );
  const isAsset =
    url.pathname.includes("/assets/") ||
    url.pathname.includes("/uploads/") ||
    url.pathname.startsWith("/_astro/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/sitemap.xml" ||
    url.pathname === "/llms.txt" ||
    url.pathname === "/llms-full.txt" ||
    url.pathname === "/feed.xml" ||
    url.pathname.startsWith("/sitemap-") ||
    url.pathname === "/sitemap-images.xml" ||
    // Service workers (e.g. /admin/sw-thumbnails.js) must respond with the
    // raw JS bytes, never a 30x redirect to the login page, otherwise the
    // browser refuses to register them.
    url.pathname.endsWith("/sw-thumbnails.js");

  if (url.pathname.startsWith("/admin") && !isPublicAuthRoute && !isAsset) {
    try {
      const adapter = await getAuthAdapterAsync(context.locals);

      // Check if setup is required (no users exist)
      const userCount = await adapter.countUsers();
      if (userCount === 0) {
        return Response.redirect(new URL("/admin/setup", url.origin));
      }

      // Check for valid session
      const sessionId = getSessionIdFromCookies(context.cookies);
      if (!sessionId) {
        return Response.redirect(new URL("/admin/login", url.origin));
      }

      const user = await adapter.getSessionUser(sessionId);
      if (!user) {
        return Response.redirect(new URL("/admin/login", url.origin));
      }

      context.locals.user = user;
    } catch (error) {
      // Session invalid, expired, or DB not initialized - continue as anonymous
      log("error", "[middleware] Auth check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      context.locals.user = undefined;
    }
  }

  void maybeReconcileScheduledPublications(runtimeLocals);

  const response = await next();

  if (url.pathname === "/oauth-device.html") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
  }

  const shouldApplyStagingGuard =
    !url.pathname.startsWith("/admin") &&
    !url.pathname.startsWith("/_actions") &&
    url.pathname !== "/api" &&
    !url.pathname.startsWith("/api/") &&
    !isAsset &&
    url.pathname !== "/robots.txt" &&
    url.pathname !== "/sitemap.xml" &&
    url.pathname !== "/llms.txt" &&
    url.pathname !== "/llms-full.txt" &&
    url.pathname !== "/feed.xml" &&
    !url.pathname.startsWith("/sitemap-") &&
    url.pathname !== "/sitemap-images.xml";

  if (shouldApplyStagingGuard) {
    try {
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const requestHost = url.hostname;
      if (isStagingHost(requestHost, siteSettings?.siteUrl)) {
        response.headers.set("X-Robots-Tag", "noindex, nofollow");
      }
    } catch (error) {
      log("warn", "[middleware] Staging guard check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return response;
});
