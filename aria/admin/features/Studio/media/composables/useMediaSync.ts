import { computed, ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import {
  unwrapMediaSyncApplyResult,
  unwrapMediaSyncHistoryResult,
  unwrapMediaSyncPlanResult,
} from "./mediaActionResults";
import {
  type SyncPlan,
  type SyncHistoryJob,
  type SyncDirection,
  type ConflictPolicy,
} from "../types/media-sync";
import { formatFileSize, getSyncAssetName } from "../utils/media-formatters";
import type { MediaAsset } from "../types/media";

interface UseMediaSyncOptions {
  assets: Ref<MediaAsset[]>;
  formatUploadedAt: (value?: string) => string;
  refreshAssets: () => Promise<void>;
}

export function useMediaSync(options: UseMediaSyncOptions) {
  const isSyncDialogOpen = ref(false);
  const syncDirection = ref<SyncDirection>("push");
  const syncConflictPolicy = ref<ConflictPolicy>("newest-wins");
  const syncIncludeDeletes = ref(false);
  const isPlanningSync = ref(false);
  const isApplyingSync = ref(false);
  const syncError = ref<string | null>(null);
  const syncNotice = ref<string | null>(null);
  const syncPlan = ref<SyncPlan | null>(null);
  const syncPlanJobId = ref<string | null>(null);
  const syncHistoryJobs = ref<SyncHistoryJob[]>([]);
  const isSyncStatusLoading = ref(false);
  const syncFilter = ref<"all" | "changes" | "conflicts">("all");

  const lastSyncLabel = computed(() => {
    const last = syncHistoryJobs.value[0];
    if (!last) return "Last Sync: Never";

    const finished = last.finishedAt ?? last.createdAt;
    const timestamp = options.formatUploadedAt(finished);
    return `Last Sync: ${timestamp}`;
  });

  const syncPrimaryLabel = computed(() => {
    if (isPlanningSync.value) return "Preparing Sync...";
    if (isApplyingSync.value) return "Syncing...";
    return "Sync Media";
  });

  const hasSyncConflicts = computed(() => {
    return (syncPlan.value?.summary.conflicted ?? 0) > 0;
  });

  const syncSummaryText = computed(() => {
    if (!syncPlan.value) return "Ready to sync.";

    const summary = syncPlan.value.summary;
    return `${summary.created} new, ${summary.updated} updated, ${summary.skipped} unchanged`;
  });

  const syncIncomingCount = computed(() => {
    if (!syncPlan.value) return 0;
    const summary = syncPlan.value.summary;
    return summary.created + summary.updated + summary.deleted;
  });

  const syncHasExecutableChanges = computed(() => {
    if (!syncPlan.value) return false;
    const summary = syncPlan.value.summary;
    return summary.created + summary.updated + summary.deleted > 0;
  });

  const syncConsoleId = computed(() => {
    if (!syncPlanJobId.value) return "Pending";
    return `#${syncPlanJobId.value.slice(0, 8).toUpperCase()}`;
  });

  const syncFilteredItems = computed(() => {
    if (!syncPlan.value) return [];

    const items = syncPlan.value.items;
    if (syncFilter.value === "conflicts") {
      return items.filter((item) => item.action === "conflict");
    }

    if (syncFilter.value === "changes") {
      return items.filter(
        (item) =>
          item.action === "create" ||
          item.action === "update" ||
          item.action === "delete",
      );
    }

    return items;
  });

  const syncPreviewItems = computed(() => {
    return syncFilteredItems.value.slice(0, 80);
  });

  const syncHasPreviewItems = computed(() => {
    return syncPreviewItems.value.length > 0;
  });

  const syncPlannedSizeByPath = computed(() => {
    const sizes = new Map<string, number>();

    for (const item of syncPreviewItems.value) {
      const size = item.sourceSizeBytes ?? item.targetSizeBytes;
      if (typeof size === "number") {
        sizes.set(item.logicalPath, size);
      }
    }

    return sizes;
  });

  const mediaSizeByPath = computed(() => {
    return new Map(options.assets.value.map((asset) => [asset.id, asset.size]));
  });

  const mediaSizeByFilename = computed(() => {
    const buckets = new Map<string, number[]>();

    for (const asset of options.assets.value) {
      const filename = asset.id.split("/").pop() || asset.id;
      const existing = buckets.get(filename) ?? [];
      existing.push(asset.size);
      buckets.set(filename, existing);
    }

    const uniqueSizes = new Map<string, number>();
    for (const [filename, sizes] of buckets.entries()) {
      if (sizes.length === 1) {
        uniqueSizes.set(filename, sizes[0]);
      }
    }

    return uniqueSizes;
  });

  function getSyncAssetSize(logicalPath: string): string {
    const plannedSize = syncPlannedSizeByPath.value.get(logicalPath);

    if (typeof plannedSize === "number") {
      return formatFileSize(plannedSize);
    }

    const byPath = mediaSizeByPath.value.get(logicalPath);
    if (typeof byPath === "number") {
      return formatFileSize(byPath);
    }

    const filename = getSyncAssetName(logicalPath);
    const byFilename = mediaSizeByFilename.value.get(filename);
    if (typeof byFilename === "number") {
      return formatFileSize(byFilename);
    }

    return "--";
  }

  function resetSyncFlow(): void {
    syncError.value = null;
    syncNotice.value = null;
    syncPlan.value = null;
    syncPlanJobId.value = null;
  }

  function openSyncDialog(): void {
    resetSyncFlow();
    syncConflictPolicy.value = "newest-wins";
    isSyncDialogOpen.value = true;
  }

  function closeSyncDialog(): void {
    if (isPlanningSync.value || isApplyingSync.value) return;
    isSyncDialogOpen.value = false;
    resetSyncFlow();
  }

  async function loadSyncHistory(): Promise<void> {
    isSyncStatusLoading.value = true;

    try {
      const { data, error } = await actions.media.sync.history({
        mode: "apply",
        limit: 5,
      });

      const result = unwrapMediaSyncHistoryResult(
        { data, error },
        {
          source: "useMediaSync.loadSyncHistory",
          mode: "apply",
          limit: 5,
        },
      );

      if (!result.success) {
        syncHistoryJobs.value = [];
        return;
      }

      syncHistoryJobs.value = result.data.jobs;
    } catch (err) {
      log("error", "[MediaView] Failed to load sync history", {
        error: err instanceof Error ? err.message : String(err),
      });
      syncHistoryJobs.value = [];
    } finally {
      isSyncStatusLoading.value = false;
    }
  }

  async function runSyncPlan(options?: {
    conflictPolicy?: ConflictPolicy;
    includeDeletes?: boolean;
  }): Promise<boolean> {
    if (isPlanningSync.value || isApplyingSync.value) return false;

    isPlanningSync.value = true;
    resetSyncFlow();

    const effectiveConflictPolicy =
      options?.conflictPolicy ?? syncConflictPolicy.value;
    const effectiveIncludeDeletes =
      options?.includeDeletes ?? syncIncludeDeletes.value;

    try {
      const { data, error } = await actions.media.sync.plan({
        direction: syncDirection.value,
        conflictPolicy: effectiveConflictPolicy,
        includeDeletes: effectiveIncludeDeletes,
      });

      const result = unwrapMediaSyncPlanResult(
        { data, error },
        {
          source: "useMediaSync.runSyncPlan",
          direction: syncDirection.value,
          conflictPolicy: effectiveConflictPolicy,
          includeDeletes: effectiveIncludeDeletes,
        },
      );

      if (!result.success) {
        syncError.value = result.error;
        return false;
      }

      syncConflictPolicy.value = effectiveConflictPolicy;
      syncIncludeDeletes.value = effectiveIncludeDeletes;
      syncPlan.value = result.data.plan;
      syncPlanJobId.value = result.data.jobId;

      if (result.data.plan.summary.total === 0) {
        syncNotice.value = "Everything is already in sync.";
      }

      return true;
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : "Sync plan failed";
      log("error", "[MediaView] Failed to generate sync plan", {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      isPlanningSync.value = false;
    }
  }

  async function applySyncPlan(): Promise<void> {
    if (isApplyingSync.value || !syncPlanJobId.value) return;

    if (!syncHasExecutableChanges.value) {
      syncNotice.value = "No changes to apply. Everything is already in sync.";
      return;
    }

    isApplyingSync.value = true;
    syncError.value = null;

    try {
      const { data, error } = await actions.media.sync.apply({
        jobId: syncPlanJobId.value,
        idempotencyKey: crypto.randomUUID(),
      });

      const result = unwrapMediaSyncApplyResult(
        { data, error },
        {
          source: "useMediaSync.applySyncPlan",
          jobId: syncPlanJobId.value,
        },
      );

      if (!result.success) {
        syncError.value = result.error;
        return;
      }

      const summary = result.data.summary;

      if (result.data.status !== "completed") {
        syncError.value =
          "Sync finished with failures. Review summary and retry.";
      } else if (summary.conflicted > 0) {
        syncNotice.value = `${summary.conflicted} file${summary.conflicted === 1 ? "" : "s"} still need review.`;
      } else {
        syncNotice.value = "Sync complete. Your media is up to date.";
      }

      await options.refreshAssets();
      await loadSyncHistory();
    } catch (err) {
      syncError.value =
        err instanceof Error ? err.message : "Sync apply failed";
      log("error", "[MediaView] Failed to apply sync plan", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      isApplyingSync.value = false;
    }
  }

  async function startSmartSync(): Promise<void> {
    if (!isSyncDialogOpen.value) {
      openSyncDialog();
    }

    const planned = await runSyncPlan({
      conflictPolicy: "newest-wins",
      includeDeletes: false,
    });

    if (!planned || !syncPlan.value) return;

    if (!syncHasExecutableChanges.value) {
      syncNotice.value = "No changes to apply. Everything is already in sync.";
      return;
    }

    if (syncPlan.value.summary.conflicted > 0) {
      syncNotice.value =
        "We synced what we could safely. Review a few files to finish.";
      return;
    }

    await applySyncPlan();
  }

  async function openSyncConsole(): Promise<void> {
    openSyncDialog();
    await runSyncPlan({
      conflictPolicy: "newest-wins",
      includeDeletes: false,
    });
  }

  async function resolveConflictsWith(
    policy: "local-wins" | "remote-wins",
  ): Promise<void> {
    const planned = await runSyncPlan({
      conflictPolicy: policy,
      includeDeletes: syncIncludeDeletes.value,
    });

    if (!planned) return;
    await applySyncPlan();
  }

  return {
    isSyncDialogOpen,
    syncPlan,
    syncDirection,
    syncIncludeDeletes,
    isPlanningSync,
    isApplyingSync,
    syncError,
    syncNotice,
    isSyncStatusLoading,
    syncFilter,
    lastSyncLabel,
    syncPrimaryLabel,
    hasSyncConflicts,
    syncSummaryText,
    syncIncomingCount,
    syncConsoleId,
    syncPreviewItems,
    syncHasPreviewItems,
    getSyncAssetSize,
    loadSyncHistory,
    runSyncPlan,
    applySyncPlan,
    startSmartSync,
    openSyncConsole,
    resolveConflictsWith,
    closeSyncDialog,
  };
}
