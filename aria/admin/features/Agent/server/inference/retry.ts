import {
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_RETRY_BASE_DELAY_MS,
  PROVIDER_RETRY_MAX_DELAY_MS,
} from "./types";

/**
 * Error codes the router considers retryable.
 * Non-retryable errors (FORBIDDEN, NOT_FOUND, INVALID_INPUT) should
 * propagate immediately without consuming retry budget.
 */
export const RETRYABLE_ERROR_CODES = new Set<string>([
  "PROVIDER_ERROR",
  "TIMEOUT",
  "STREAM_ERROR",
  "RATE_LIMITED",
]);

export interface RouterRetryableError {
  code: string;
  message: string;
}

export function isRetryableError(
  error: unknown,
): error is RouterRetryableError {
  if (typeof error !== "object" || error === null) return false;
  const err = error as Record<string, unknown>;
  return (
    typeof err.code === "string" &&
    RETRYABLE_ERROR_CODES.has(err.code) &&
    typeof err.message === "string"
  );
}

/**
 * Exponential backoff delay for a given attempt number.
 * attempt 2 → 1_000ms, attempt 3 → 3_000ms (capped at MAX_DELAY).
 */
export function retryBackoffMs(attempt: number): number {
  const delay = PROVIDER_RETRY_BASE_DELAY_MS * Math.pow(3, attempt - 2);
  return Math.min(delay, PROVIDER_RETRY_MAX_DELAY_MS);
}

/**
 * Wait for the backoff period.
 * Returns `true` if the wait was aborted (caller should abort).
 */
export async function waitForRetryBackoff(
  attempt: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const delay = retryBackoffMs(attempt);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * Decide whether to retry based on attempt count and error type.
 */
export function shouldRetry(attempt: number, error: unknown): boolean {
  if (attempt >= PROVIDER_MAX_ATTEMPTS) return false;
  return isRetryableError(error);
}
