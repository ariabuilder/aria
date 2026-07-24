import type { ApiErrorCode } from "./schemas";

export type ApiHttpErrorOptions = {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  headers?: HeadersInit;
};

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  readonly headers: Headers;

  constructor(options: ApiHttpErrorOptions) {
    super(options.message);
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.headers = new Headers(options.headers);
  }
}

export function apiRequestId(_request: Request): string {
  return crypto.randomUUID();
}

function baseHeaders(requestId: string): Headers {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Aria-Request-Id": requestId,
  });
}

export function apiJson(
  requestId: string,
  data: unknown,
  options: { status?: number; headers?: HeadersInit } = {},
): Response {
  const headers = baseHeaders(requestId);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  return Response.json(
    { success: true, data },
    { status: options.status ?? 200, headers },
  );
}

export function apiErrorResponse(requestId: string, error: unknown): Response {
  const normalized = normalizeApiError(error);
  const headers = baseHeaders(requestId);
  normalized.headers.forEach((value, key) => headers.set(key, value));
  return Response.json(
    {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined
          ? {}
          : { details: normalized.details }),
      },
    },
    { status: normalized.status, headers },
  );
}

export function normalizeApiError(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) return error;
  const actionError = error as {
    code?: unknown;
    message?: unknown;
    issues?: unknown;
  };
  const message =
    typeof actionError?.message === "string" ? actionError.message : "Request failed";
  switch (actionError?.code) {
    case "BAD_REQUEST":
      return new ApiHttpError({
        status: 422,
        code: "validation_failed",
        message,
        details: actionError.issues,
      });
    case "UNAUTHORIZED":
      return new ApiHttpError({ status: 401, code: "unauthorized", message });
    case "FORBIDDEN":
      if (message.includes("Collection access policy")) {
        return new ApiHttpError({
          status: 404,
          code: "not_found",
          message: "Resource not found",
        });
      }
      return new ApiHttpError({ status: 403, code: "forbidden", message });
    case "NOT_FOUND":
      return new ApiHttpError({ status: 404, code: "not_found", message });
    case "CONFLICT":
      return new ApiHttpError({ status: 409, code: "conflict", message });
    default:
      return new ApiHttpError({
        status: 500,
        code: "internal_error",
        message: "An internal error occurred",
      });
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "Content-Type must be application/json",
    });
  }
  try {
    return await request.json();
  } catch {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "Request body is not valid JSON",
    });
  }
}

export function entryEtag(version: string): string {
  const safeVersion = version.replace(/["\\]/gu, "");
  return `"aria-entry-${safeVersion}"`;
}

export function requireEntryIfMatch(request: Request): string {
  const value = request.headers.get("If-Match");
  if (!value) {
    throw new ApiHttpError({
      status: 428,
      code: "precondition_required",
      message: "If-Match is required",
    });
  }
  if (value.includes(",") || value === "*" || value.startsWith("W/")) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "If-Match must contain exactly one strong Aria entry ETag",
    });
  }
  const match = /^"aria-entry-(.+)"$/u.exec(value);
  if (!match?.[1]) {
    throw new ApiHttpError({
      status: 400,
      code: "bad_request",
      message: "If-Match must be an Aria entry ETag",
    });
  }
  return match[1];
}
