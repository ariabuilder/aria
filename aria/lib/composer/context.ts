/**
 * Client-side and server-side utilities to detect whether code is running
 * in the Composer (main editor) or Stage (preview iframe).
 */

/**
 * Check if running in Composer (main editor window)
 *
 * @returns true if in Composer context (?aria=edit without &preview=true)
 */
export function isComposer(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("aria") && !params.has("preview");
}

/**
 * Check if running in Stage (preview iframe)
 *
 * @returns true if in Stage context (?aria=edit&preview=true)
 */
export function isStage(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("aria") && params.has("preview");
}

/**
 * Server-side helper to get Composer context from a Request object
 *
 * Use this in Astro middleware, actions, or API routes to detect context
 * on the server.
 *
 * @param request - The incoming Request object
 * @returns Object with isComposer and isStage booleans
 *
 * @example
 * ```typescript
 * // In Astro middleware
 * const context = getComposerContext(Astro.request);
 * if (context.isComposer) {
 *   // Load editor assets
 * }
 * ```
 */
export function getComposerContext(request: Request) {
  const url = new URL(request.url);
  const isAria = url.searchParams.has("aria");
  const isPreview = url.searchParams.has("preview");

  return {
    isComposer: isAria && !isPreview,
    isStage: isAria && isPreview,
  };
}
