export type MediaLifecycleErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_SERVER_ERROR";

export class MediaLifecycleError extends Error {
  readonly code: MediaLifecycleErrorCode;

  constructor(code: MediaLifecycleErrorCode, message: string) {
    super(message);
    this.name = "MediaLifecycleError";
    this.code = code;
  }
}
