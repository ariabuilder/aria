import { ActionError } from "astro:actions";

import type { CmsErrorCode } from "./constants";
import { CmsServiceError } from "./errors";

function mapCmsCodeToActionCode(
  code: CmsErrorCode,
):
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "INTERNAL_SERVER_ERROR" {
  switch (code) {
    case "VALIDATION_ERROR":
    case "SCHEMA_ERROR":
      return "BAD_REQUEST";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "CONFLICT":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "UNAUTHORIZED":
      return "UNAUTHORIZED";
    case "RATE_LIMITED":
    case "INTERNAL":
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

export function throwCmsActionError(code: CmsErrorCode, message: string): never {
  throw new ActionError({
    code: mapCmsCodeToActionCode(code),
    message,
  });
}

export function rethrowCmsError(error: unknown): never {
  if (error instanceof CmsServiceError) {
    throwCmsActionError(error.code, error.message);
  }

  if (error instanceof Error) {
    if (error.message.includes("version conflict")) {
      throwCmsActionError("CONFLICT", error.message);
    }
    throwCmsActionError("INTERNAL", error.message);
  }

  throwCmsActionError("INTERNAL", "Unexpected CMS error");
}
