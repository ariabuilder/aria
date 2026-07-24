const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
] as const;

const PUBLIC_OAUTH_FORM_ROUTES = new Set([
  "/oauth/device/authorization",
  "/oauth/token",
  "/oauth/revoke",
]);

function hasFormLikeContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return FORM_CONTENT_TYPES.some((candidate) => normalized.includes(candidate));
}

function isPublicOAuthFormSubmission(request: Request, url: URL): boolean {
  return (
    request.method === "POST" &&
    PUBLIC_OAUTH_FORM_ROUTES.has(url.pathname) &&
    request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/x-www-form-urlencoded") === true
  );
}

/**
 * Mirrors Astro's SSR origin check while allowing the form-encoded
 * public OAuth protocol endpoints. Signed-in OAuth decisions are.
 */
export function isForbiddenCrossOriginFormRequest(
  request: Request,
  url = new URL(request.url),
): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  if (isPublicOAuthFormSubmission(request, url)) return false;

  const isSameOrigin = request.headers.get("origin") === url.origin;
  const contentType = request.headers.get("content-type");
  if (contentType !== null) {
    return hasFormLikeContentType(contentType) && !isSameOrigin;
  }
  return !isSameOrigin;
}

export function crossOriginFormForbiddenResponse(request: Request): Response {
  return new Response(
    `Cross-site ${request.method} form submissions are forbidden`,
    { status: 403 },
  );
}
