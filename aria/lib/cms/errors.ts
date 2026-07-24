import type { CmsErrorCode } from "./constants";

export class CmsServiceError extends Error {
  readonly code: CmsErrorCode;

  constructor(code: CmsErrorCode, message: string) {
    super(message);
    this.name = "CmsServiceError";
    this.code = code;
  }
}
