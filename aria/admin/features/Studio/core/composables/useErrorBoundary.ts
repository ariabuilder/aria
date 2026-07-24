import { ref, type Ref } from "vue";
import { toast } from "vue-sonner";
import type {
  PageDetailError,
  PageDetailErrorCode,
  PageDetailErrorSeverity,
} from "@/lib/errors/pageDetailErrors";

export interface UseErrorBoundaryReturn {
  /** The current error, or null when no error is present */
  currentError: Ref<PageDetailError | null>;
  clearError: () => void;
  /**
   * Internal error handler for page detail operations.
   * Sets the current error and shows a toast notification.
   */
  handleError: (
    code: PageDetailErrorCode,
    message: string,
    options?: {
      details?: string;
      severity?: PageDetailErrorSeverity;
      retry?: () => void | Promise<void>;
      context?: Record<string, unknown>;
    },
  ) => void;
}

/**
 * Composable that wraps the error handler to provide a page-detail-specific
 * error boundary. Exposes a single `currentError` ref (rather than.
 */
export function useErrorBoundary(): UseErrorBoundaryReturn {
  const currentError = ref<PageDetailError | null>(null);

  /**
   * Set the current error, push a toast notification, and optionally
   * attach a retry handler.
   */
  function handleError(
    code: PageDetailErrorCode,
    message: string,
    options?: {
      details?: string;
      severity?: PageDetailErrorSeverity;
      retry?: () => void | Promise<void>;
      context?: Record<string, unknown>;
    },
  ): void {
    const error: PageDetailError = {
      code,
      message,
      details: options?.details,
      severity: options?.severity ?? "error",
      retry: options?.retry,
      timestamp: new Date().toISOString(),
      context: options?.context,
    };

    currentError.value = error;

    toast.error(message, {
      description: options?.details,
      action: options?.retry
        ? {
            label: "Retry",
            onClick: options.retry as () => void,
          }
        : undefined,
    });
  }

  function clearError(): void {
    currentError.value = null;
  }

  return {
    currentError,
    clearError,
    handleError,
  };
}
