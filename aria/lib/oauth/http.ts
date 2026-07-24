export class OAuthProtocolError extends Error {
  constructor(
    readonly error: string,
    readonly status = 400,
    readonly description?: string,
  ) {
    super(description ?? error);
  }
}

export function oauthHeaders(options: { cors?: boolean } = {}): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...(options.cors ? { "Access-Control-Allow-Origin": "*" } : {}),
  });
}

export function oauthJson(
  value: unknown,
  options: { status?: number; cors?: boolean } = {},
): Response {
  return Response.json(value, {
    status: options.status ?? 200,
    headers: oauthHeaders({ cors: options.cors }),
  });
}

export function oauthEmptyResponse(options: { cors?: boolean } = {}): Response {
  return new Response(null, {
    status: 200,
    headers: oauthHeaders({ cors: options.cors }),
  });
}

export function oauthErrorResponse(
  cause: unknown,
  options: { cors?: boolean } = {},
): Response {
  const error =
    cause instanceof OAuthProtocolError
      ? cause
      : cause instanceof Error && cause.message === "OAUTH_DISABLED"
        ? new OAuthProtocolError("invalid_request", 404)
        : cause instanceof Error && cause.message === "OAUTH_ISSUER_MISMATCH"
          ? new OAuthProtocolError("invalid_request", 421)
          : cause instanceof Error &&
              (cause.message === "OAUTH_CANONICAL_ORIGIN_UNAVAILABLE" ||
                cause.message === "OAUTH_CANONICAL_ORIGIN_INVALID")
            ? new OAuthProtocolError("temporarily_unavailable", 503)
            : new OAuthProtocolError(
                "server_error",
                500,
                "The authorization server could not complete the request",
              );
  return oauthJson(
    {
      error: error.error,
      ...(error.description ? { error_description: error.description } : {}),
    },
    { status: error.status, cors: options.cors },
  );
}

export async function readOAuthRequestBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  if (contentType.includes("application/json")) {
    try {
      const value = await request.json();
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Normalized below.
    }
  }
  throw new OAuthProtocolError(
    "invalid_request",
    400,
    "Use a form-encoded or JSON object request body",
  );
}

export function publicOAuthOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store",
    },
  });
}
