/**
 * Registry of all error codes used in the Page Detail View UX. A consistent set
 * of error identifiers, a union type for all codes, and the full error interface.
 */

export const PAGE_DETAIL_ERROR_CODES = {
  METRICS_COMPUTATION_FAILED: "METRICS_COMPUTATION_FAILED",
  METRICS_CACHE_INVALID: "METRICS_CACHE_INVALID",
  METRICS_HASH_MISMATCH: "METRICS_HASH_MISMATCH",

  ACTIVITY_LOG_FAILED: "ACTIVITY_LOG_FAILED",
  ACTIVITY_NOT_FOUND: "ACTIVITY_NOT_FOUND",
  ACTIVITY_FETCH_FAILED: "ACTIVITY_FETCH_FAILED",

  SECTION_REORDER_FAILED: "SECTION_REORDER_FAILED",
  SECTION_NOT_FOUND: "SECTION_NOT_FOUND",
  INVALID_SECTION_ORDER: "INVALID_SECTION_ORDER",
  SECTION_VISIBILITY_TOGGLE_FAILED: "SECTION_VISIBILITY_TOGGLE_FAILED",

  MEDIA_FETCH_FAILED: "MEDIA_FETCH_FAILED",

  VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
  REVERT_FAILED: "REVERT_FAILED",
  SNAPSHOT_CORRUPTED: "SNAPSHOT_CORRUPTED",
  VERSION_FETCH_FAILED: "VERSION_FETCH_FAILED",
  VERSION_DELETE_FAILED: "VERSION_DELETE_FAILED",

  INLINE_EDIT_SAVE_FAILED: "INLINE_EDIT_SAVE_FAILED",
  OPTIMISTIC_UPDATE_ROLLED_BACK: "OPTIMISTIC_UPDATE_ROLLED_BACK",
  INLINE_EDIT_CONFLICT: "INLINE_EDIT_CONFLICT",

  PRELOAD_FAILED: "PRELOAD_FAILED",
  PREVIEW_TIMEOUT: "PREVIEW_TIMEOUT",

  PAGE_NOT_FOUND: "PAGE_NOT_FOUND",
  PAGE_LOAD_FAILED: "PAGE_LOAD_FAILED",
  PAGE_SAVE_FAILED: "PAGE_SAVE_FAILED",

  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

/** Union type of all valid page detail error codes */
export type PageDetailErrorCode = (typeof PAGE_DETAIL_ERROR_CODES)[keyof typeof PAGE_DETAIL_ERROR_CODES];

export type PageDetailErrorSeverity = "critical" | "error" | "warning" | "info";

export interface PageDetailError {
  code: PageDetailErrorCode;
  message: string;
  details?: string;
  severity: PageDetailErrorSeverity;
  retry?: () => void | Promise<void>;
  /** ISO-8601 timestamp when the error occurred */
  timestamp: string;
  /** Arbitrary contextual data attached to the error */
  context?: Record<string, unknown>;
}
