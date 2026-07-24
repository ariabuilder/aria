import { computed, onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import {
  type ContentSyncDirection,
  type ContentSyncHistoryJob,
  type ContentSyncPlan,
  type ContentSyncPlanItem,
  type ContentSyncStatusData,
} from "@/lib/content-sync/schema";
import {
  unwrapContentSyncApplyResult,
  unwrapContentSyncHistoryResult,
  unwrapContentSyncPlanResult,
  unwrapContentSyncStatusResult,
} from "./contentSyncActionResults";

type ContentSyncConsoleFilter = "all" | "ready" | "conflicts";

function formatStatusLabel(status?: ContentSyncStatusData["status"]): string {
  switch (status) {
    case "in-sync":
      return "In Sync";
    case "ahead":
      return "Ahead";
    case "behind":
      return "Behind";
    case "diverged":
      return "Diverged";
    default:
      return "Unknown";
  }
}

function formatSyncCopy(status?: ContentSyncStatusData["status"]): string {
  switch (status) {
    case "in-sync":
      return "Local and remote are aligned.";
    case "ahead":
      return "Local is ahead of remote.";
    case "behind":
      return "Remote has newer content.";
    case "diverged":
      return "Local and remote have diverged.";
    default:
      return "Sync state is not available yet.";
  }
}

function formatSyncTimestamp(value?: string | null): string {
  if (!value) return "Last Sync: Never";

  try {
    return `Last Sync: ${new Date(value).toLocaleString()}`;
  } catch {
    return "Last Sync: Unknown";
  }
}

function revisionId(value?: string | null): string {
  return value ? value.slice(0, 8).toUpperCase() : "Pending";
}

export function useContentSync() {
  const isSyncDialogOpen = ref(false);
  const syncDirection = ref<ContentSyncDirection>("push");
  const syncFilter = ref<ContentSyncConsoleFilter>("all");
  const overrideDifferences = ref(false);
  const isStatusLoading = ref(false);
  const isPlanning = ref(false);
  const isApplying = ref(false);
  const status = ref<ContentSyncStatusData | null>(null);
  const history = ref<ContentSyncHistoryJob[]>([]);
  const plan = ref<ContentSyncPlan | null>(null);
  const planJobId = ref<string | null>(null);
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const selectedItemKeys = ref<string[]>([]);

  const statusLabel = computed(() => formatStatusLabel(status.value?.status));
  const statusCopy = computed(() => formatSyncCopy(status.value?.status));
  const lastSyncLabel = computed(() => {
    const latestCompletedAt =
      history.value[0]?.finishedAt ??
      status.value?.latestSuccessfulSync?.completedAt ??
      null;
    return formatSyncTimestamp(latestCompletedAt);
  });
  const syncPrimaryLabel = computed(() => {
    if (isPlanning.value) return "Preparing...";
    if (isApplying.value) return "Applying...";
    return "SYNC SYSTEM";
  });
  const hasPlan = computed(() => Boolean(plan.value && planJobId.value));
  const previewItems = computed(() =>
    (plan.value?.items ?? []).filter((item) => item.action !== "skip"),
  );
  const selectableItems = computed(() =>
    previewItems.value.filter(
      (item) =>
        item.action === "create" ||
        item.action === "update" ||
        item.action === "delete",
    ),
  );
  const selectedItems = computed(() => {
    const selectedIds = new Set(selectedItemKeys.value);
    return selectableItems.value.filter((item) =>
      selectedIds.has(itemKey(item)),
    );
  });
  const selectedCount = computed(() => selectedItems.value.length);
  const allSelectableSelected = computed(() => {
    return (
      selectableItems.value.length > 0 &&
      selectedCount.value === selectableItems.value.length
    );
  });
  const hasConflicts = computed(() =>
    previewItems.value.some((item) => item.action === "conflict"),
  );
  const syncIncomingCount = computed(() => {
    if (!plan.value) return 0;
    return (
      plan.value.summary.created +
      plan.value.summary.updated +
      plan.value.summary.deleted
    );
  });
  const syncConflictCount = computed(() => plan.value?.summary.conflicted ?? 0);
  const syncSummaryText = computed(() => {
    if (!plan.value) {
      return "Open the console to preview a push or pull before applying changes.";
    }

    const summary = plan.value.summary;
    return `${summary.created} new, ${summary.updated} updated, ${summary.deleted} deleted`;
  });
  const isPlanFresh = computed(() => {
    if (!plan.value || !status.value) return false;

    return (
      status.value.localRevision?.revisionId ===
        plan.value.localRevision?.revisionId &&
      status.value.remoteRevision?.revisionId ===
        plan.value.remoteRevision?.revisionId
    );
  });
  const stalePlanMessage = computed(() => {
    if (!plan.value) return null;
    if (isPlanFresh.value) return null;
    return "Local or remote changed after planning. Run Dry-Run again before applying.";
  });
  const canApply = computed(() => {
    return hasPlan.value && selectedCount.value > 0 && isPlanFresh.value;
  });
  const planSummary = computed(() => {
    return {
      total: previewItems.value.length,
      ready: selectableItems.value.length,
      selected: selectedCount.value,
      conflicts: previewItems.value.filter((item) => item.action === "conflict")
        .length,
      skipped: previewItems.value.filter((item) => item.action === "skip")
        .length,
    };
  });
  const syncConflictPolicy = computed(() => {
    if (!overrideDifferences.value) {
      return "newest-wins" as const;
    }

    return syncDirection.value === "push"
      ? ("local-wins" as const)
      : ("remote-wins" as const);
  });
  const applyDisabledReason = computed(() => {
    if (!plan.value) {
      return "Preview changes before applying.";
    }

    if (!isPlanFresh.value) {
      return "The preview is out of date. Preview changes again.";
    }

    if (selectedCount.value > 0) {
      return null;
    }

    if (hasConflicts.value) {
      return overrideDifferences.value
        ? "Choose at least one change to apply."
        : syncDirection.value === "push"
          ? "Some items only exist on Cloudflare. Turn on 'Include deletions on Cloudflare' if you want to remove them there."
          : "Some items only exist locally. Turn on 'Include deletions locally' if you want to remove them here.";
    }

    return "Choose at least one change to apply.";
  });
  const syncFilteredItems = computed(() => {
    if (syncFilter.value === "ready") {
      return selectableItems.value;
    }

    if (syncFilter.value === "conflicts") {
      return previewItems.value.filter((item) => item.action === "conflict");
    }

    return previewItems.value;
  });
  const syncPreviewItems = computed(() => syncFilteredItems.value);
  const syncHasPreviewItems = computed(() => syncPreviewItems.value.length > 0);

  function itemKey(
    item:
      | Pick<ContentSyncPlanItem, "resourceType" | "resourceId" | "action">
      | {
          id?: string;
          resourceType: string;
          resourceId: string;
          action: string;
        },
  ): string {
    return "id" in item && typeof item.id === "string"
      ? item.id
      : `${item.resourceType}:${item.resourceId}:${item.action}`;
  }

  function resetSyncFlow(): void {
    error.value = null;
    notice.value = null;
    plan.value = null;
    planJobId.value = null;
    selectedItemKeys.value = [];
    syncFilter.value = "all";
  }

  function syncSelectionWithPlan(nextPlan: ContentSyncPlan | null): void {
    if (!nextPlan) {
      selectedItemKeys.value = [];
      return;
    }

    selectedItemKeys.value = nextPlan.items
      .filter(
        (item) =>
          item.action === "create" ||
          item.action === "update" ||
          item.action === "delete",
      )
      .map((item) => itemKey(item));
  }

  function toggleItemSelection(itemKeyValue: string): void {
    const next = new Set(selectedItemKeys.value);
    if (next.has(itemKeyValue)) {
      next.delete(itemKeyValue);
    } else {
      next.add(itemKeyValue);
    }
    selectedItemKeys.value = [...next];
  }

  function toggleSelectAll(): void {
    if (allSelectableSelected.value) {
      selectedItemKeys.value = [];
      return;
    }

    selectedItemKeys.value = selectableItems.value.map((item) => itemKey(item));
  }

  async function loadStatus(): Promise<void> {
    isStatusLoading.value = true;

    try {
      const { data, error: actionError } = await actions.contentSync.status({});
      const result = unwrapContentSyncStatusResult(
        { data, error: actionError },
        {
          source: "useContentSync.loadStatus",
        },
      );

      if (!result.success) {
        status.value = null;
        return;
      }

      status.value = result.data;
    } catch (err) {
      log("error", "[ContentSync] Failed to load sync status", {
        error: err instanceof Error ? err.message : String(err),
      });
      status.value = null;
    } finally {
      isStatusLoading.value = false;
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const { data, error: actionError } = await actions.contentSync.history({
        mode: "apply",
        limit: 5,
      });

      const result = unwrapContentSyncHistoryResult(
        { data, error: actionError },
        {
          source: "useContentSync.loadHistory",
          mode: "apply",
          limit: 5,
        },
      );

      if (!result.success) {
        history.value = [];
        return;
      }

      history.value = result.data.jobs;
    } catch (err) {
      log("error", "[ContentSync] Failed to load history", {
        error: err instanceof Error ? err.message : String(err),
      });
      history.value = [];
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([loadStatus(), loadHistory()]);
  }

  async function openSyncConsole(): Promise<void> {
    isSyncDialogOpen.value = true;
    syncFilter.value = "all";
    error.value = null;
    notice.value = null;
  }

  function closeSyncDialog(): void {
    if (isPlanning.value || isApplying.value) return;

    isSyncDialogOpen.value = false;
    resetSyncFlow();
  }

  async function runPlan(direction?: ContentSyncDirection): Promise<boolean> {
    if (isPlanning.value || isApplying.value) return false;

    isPlanning.value = true;
    error.value = null;
    notice.value = null;

    if (direction) {
      syncDirection.value = direction;
    }

    try {
      const { data, error: actionError } = await actions.contentSync.plan({
        direction: syncDirection.value,
        conflictPolicy: syncConflictPolicy.value,
      });

      const result = unwrapContentSyncPlanResult(
        { data, error: actionError },
        {
          source: "useContentSync.runPlan",
          direction: syncDirection.value,
          conflictPolicy: syncConflictPolicy.value,
        },
      );

      if (!result.success) {
        error.value = result.error;
        return false;
      }

      plan.value = result.data.plan;
      planJobId.value = result.data.job.id;
      syncSelectionWithPlan(result.data.plan);

      await loadStatus();

      if (result.data.plan.summary.total === 0) {
        notice.value = "Everything is already in sync.";
      } else if (
        result.data.plan.summary.conflicted > 0 &&
        !overrideDifferences.value
      ) {
        notice.value =
          syncDirection.value === "push"
            ? "Some items only exist on Cloudflare. Turn on 'Include deletions on Cloudflare' if local should remove them there."
            : "Some items only exist locally. Turn on 'Include deletions locally' if remote should remove them here.";
      } else {
        notice.value = null;
      }

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Dry-run failed";
      log("error", "[ContentSync] Failed to generate sync plan", {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      isPlanning.value = false;
    }
  }

  async function setDirection(direction: ContentSyncDirection): Promise<void> {
    if (syncDirection.value === direction) {
      return;
    }

    syncDirection.value = direction;

    if (hasPlan.value) {
      await runPlan();
    }
  }

  async function setOverrideDifferences(nextValue: boolean): Promise<void> {
    if (overrideDifferences.value === nextValue) {
      return;
    }

    overrideDifferences.value = nextValue;

    if (hasPlan.value) {
      await runPlan();
    }
  }

  async function applyPlan(): Promise<boolean> {
    if (isApplying.value || !planJobId.value) return false;

    await loadStatus();

    if (selectedCount.value === 0) {
      notice.value =
        applyDisabledReason.value ??
        "No changes to apply. Everything is already in sync.";
      return false;
    }

    if (!isPlanFresh.value) {
      error.value = stalePlanMessage.value;
      return false;
    }

    isApplying.value = true;
    error.value = null;

    try {
      const { data, error: actionError } = await actions.contentSync.apply({
        jobId: planJobId.value,
        idempotencyKey: crypto.randomUUID(),
        selectedItemKeys: selectedItemKeys.value,
      });

      const result = unwrapContentSyncApplyResult(
        { data, error: actionError },
        {
          source: "useContentSync.applyPlan",
          jobId: planJobId.value,
        },
      );

      if (!result.success) {
        const message = result.error;

        if (/stale/i.test(message)) {
          error.value =
            "Dry-run is stale. Refresh status and run a new dry-run before applying.";
        } else {
          error.value = message;
        }

        return false;
      }

      const summary = result.data.summary;

      if (summary.failed > 0) {
        error.value =
          "Apply finished with failures. Review the latest history before retrying.";
      } else if (summary.conflicted > 0) {
        notice.value = `${summary.conflicted} item${summary.conflicted === 1 ? "" : "s"} still need manual review.`;
      } else {
        notice.value =
          "Content sync complete. Local and remote are up to date.";
      }

      plan.value = null;
      planJobId.value = null;
      selectedItemKeys.value = [];
      await refresh();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Apply failed";
      error.value = /stale/i.test(message)
        ? "Dry-run is stale. Refresh status and run a new dry-run before applying."
        : message;
      log("error", "[ContentSync] Failed to apply sync plan", {
        error: message,
      });
      return false;
    } finally {
      isApplying.value = false;
    }
  }

  onMounted(() => {
    void refresh();
  });

  return {
    isSyncDialogOpen,
    syncDirection,
    syncFilter,
    overrideDifferences,
    isStatusLoading,
    isPlanning,
    isApplying,
    status,
    history,
    plan,
    planJobId,
    error,
    notice,
    statusLabel,
    statusCopy,
    lastSyncLabel,
    syncPrimaryLabel,
    hasPlan,
    hasConflicts,
    syncIncomingCount,
    syncConflictCount,
    syncSummaryText,
    isPlanFresh,
    planSummary,
    previewItems,
    syncPreviewItems,
    syncHasPreviewItems,
    selectableItems,
    selectedItemKeys,
    selectedCount,
    allSelectableSelected,
    applyDisabledReason,
    stalePlanMessage,
    canApply,
    refresh,
    runPlan,
    applyPlan,
    openSyncConsole,
    closeSyncDialog,
    setDirection,
    setOverrideDifferences,
    toggleItemSelection,
    toggleSelectAll,
    itemKey,
    syncConflictPolicy,
    revisionId,
  };
}
