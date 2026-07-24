import { log } from "@/lib/utils/logger";

import {
  ContentSyncApplyResponseSchema,
  ContentSyncHistoryResponseSchema,
  ContentSyncPlanResponseSchema,
  ContentSyncStatusResponseSchema,
  type ContentSyncApplyResponse,
  type ContentSyncHistoryResponse,
  type ContentSyncPlanResponse,
  type ContentSyncStatusData,
} from "@/lib/content-sync/schema";

interface ContentSyncTransportErrorLike {
  message?: string;
}

interface ContentSyncTransportResult {
  data?: unknown;
  error?: ContentSyncTransportErrorLike | null;
}

function getTransportErrorMessage(
  result: ContentSyncTransportResult,
  fallback: string,
): string {
  return result.error?.message ?? fallback;
}

export function unwrapContentSyncStatusResult(
  result: ContentSyncTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ContentSyncStatusData }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(
        result,
        "Failed to load content sync status.",
      ),
    };
  }

  const parsedResult = ContentSyncStatusResponseSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[ContentSync] Invalid status response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: "Failed to load content sync status.",
    };
  }

  return {
    success: true,
    data: parsedResult.data.data,
  };
}

export function unwrapContentSyncHistoryResult(
  result: ContentSyncTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ContentSyncHistoryResponse }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(
        result,
        "Failed to load content sync history.",
      ),
    };
  }

  const parsedResult = ContentSyncHistoryResponseSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[ContentSync] Invalid history response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: "Failed to load content sync history.",
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}

export function unwrapContentSyncPlanResult(
  result: ContentSyncTransportResult,
  context: Record<string, unknown> = {},
):
  | {
      success: true;
      data: Extract<ContentSyncPlanResponse, { success: true }>["data"];
    }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(
        result,
        "Failed to generate content sync dry-run.",
      ),
    };
  }

  const parsedResult = ContentSyncPlanResponseSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[ContentSync] Invalid plan response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: "Received invalid content sync plan response.",
    };
  }

  const planData = parsedResult.data;
  if (planData.success === false) {
    return {
      success: false,
      error:
        planData.error.message || "Failed to generate content sync dry-run.",
    };
  }

  return {
    success: true,
    data: planData.data,
  };
}

export function unwrapContentSyncApplyResult(
  result: ContentSyncTransportResult,
  context: Record<string, unknown> = {},
):
  | {
      success: true;
      data: Extract<ContentSyncApplyResponse, { success: true }>["data"];
    }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(
        result,
        "Failed to apply content sync plan.",
      ),
    };
  }

  const parsedResult = ContentSyncApplyResponseSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[ContentSync] Invalid apply response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: "Received invalid content sync apply response.",
    };
  }

  const applyData = parsedResult.data;
  if (applyData.success === false) {
    return {
      success: false,
      error:
        applyData.error.message || "Failed to apply content sync plan.",
    };
  }

  return {
    success: true,
    data: applyData.data,
  };
}
