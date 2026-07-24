import { ref, type Ref } from "vue";
import { toast } from "vue-sonner";
import type { AriaEntryRecord } from "../../../../lib/cms/schemas";
import type { CmsEntryRow } from "../lib/entryRow";
import { mapEntryRecordToRow } from "../lib/entryRow";
import { useCmsEntryHistory } from "./useCmsEntryHistory";

type EntryTransitionAction = "publish" | "unpublish" | "archive";
type EntryTransitionTarget = CmsEntryRow | AriaEntryRecord;

export interface UseCmsEntryActionsReturn {
  isDeleting: Ref<boolean>;
  isDuplicating: Ref<boolean>;
  isTransitioning: Ref<boolean>;
  deleteEntry: (
    row: CmsEntryRow,
    onSuccess?: () => void,
  ) => Promise<boolean>;
  deleteEntries: (
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ) => Promise<boolean>;
  duplicateEntry: (
    row: CmsEntryRow,
    onSuccess?: () => void,
  ) => Promise<boolean>;
  duplicateEntries: (
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ) => Promise<boolean>;
  publishEntry: (
    target: EntryTransitionTarget,
    onSuccess?: (record: AriaEntryRecord) => void,
    scheduledFor?: string,
  ) => Promise<boolean>;
  scheduleEntry: (
    target: EntryTransitionTarget,
    scheduledFor: string,
    onSuccess?: (record: AriaEntryRecord) => void,
  ) => Promise<boolean>;
  publishEntries: (
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ) => Promise<boolean>;
  unpublishEntry: (
    target: EntryTransitionTarget,
    onSuccess?: (record: AriaEntryRecord) => void,
  ) => Promise<boolean>;
  unpublishEntries: (
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ) => Promise<boolean>;
  archiveEntry: (
    target: EntryTransitionTarget,
    onSuccess?: (record: AriaEntryRecord) => void,
  ) => Promise<boolean>;
  archiveEntries: (
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ) => Promise<boolean>;
}

export function useCmsEntryActions(): UseCmsEntryActionsReturn {
  const isDeleting = ref(false);
  const isDuplicating = ref(false);
  const isTransitioning = ref(false);
  const entryHistory = useCmsEntryHistory();

  function transitionTargetToRow(target: EntryTransitionTarget): CmsEntryRow {
    return "entry" in target && "locales" in target
      ? mapEntryRecordToRow(target)
      : target;
  }

  async function deleteEntry(
    row: CmsEntryRow,
    onSuccess?: () => void,
  ): Promise<boolean> {
    isDeleting.value = true;
    try {
      const ok = await entryHistory.recordDeleteEntry({
        row,
        description: `Delete "${row.title}"`,
        afterRedo: onSuccess,
      });
      if (ok) toast.success(`Deleted "${row.title}"`);
      return ok;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry");
      return false;
    } finally {
      isDeleting.value = false;
    }
  }

  async function deleteEntries(
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (rows.length === 0) {
      return false;
    }
    isDeleting.value = true;
    try {
      const result = await entryHistory.recordDeleteEntriesBatch({
        rows,
        description:
          rows.length === 1
            ? `Delete "${rows[0]?.title ?? "entry"}"`
            : `Delete ${rows.length} entries`,
        afterRedo: onSuccess,
      });
      const succeeded = result.succeeded;
      if (succeeded > 0) {
        toast.success(
          succeeded === 1 ? "Entry deleted" : `${succeeded} entries deleted`,
        );
      }
      if (succeeded < rows.length) {
        toast.error(`Deleted ${succeeded} of ${rows.length} entries`);
      }
      return succeeded === rows.length;
    } finally {
      isDeleting.value = false;
    }
  }

  async function duplicateEntry(
    row: CmsEntryRow,
    onSuccess?: () => void,
  ): Promise<boolean> {
    isDuplicating.value = true;
    try {
      const record = await entryHistory.recordDuplicateEntry({
        row,
        description: `Duplicate "${row.title}"`,
        afterRedo: onSuccess,
      });
      if (record) toast.success(`Duplicated "${row.title}"`);
      return Boolean(record);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to duplicate entry",
      );
      return false;
    } finally {
      isDuplicating.value = false;
    }
  }

  async function duplicateEntries(
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (rows.length === 0) {
      return false;
    }
    isDuplicating.value = true;
    try {
      const result = await entryHistory.recordDuplicateEntriesBatch({
        rows,
        description:
          rows.length === 1
            ? `Duplicate "${rows[0]?.title ?? "entry"}"`
            : `Duplicate ${rows.length} entries`,
        afterRedo: onSuccess,
      });
      const succeeded = result.succeeded;
      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? "Entry duplicated"
            : `${succeeded} entries duplicated`,
        );
      }
      if (succeeded < rows.length) {
        toast.error(`Duplicated ${succeeded} of ${rows.length} entries`);
      }
      return succeeded === rows.length;
    } finally {
      isDuplicating.value = false;
    }
  }

  async function transitionEntry(
    action: EntryTransitionAction,
    target: EntryTransitionTarget,
    onSuccess?: (record: AriaEntryRecord) => void,
    scheduledFor?: string,
  ): Promise<boolean> {
    const row = transitionTargetToRow(target);
    isTransitioning.value = true;
    try {
      const record = await entryHistory.recordTransitionEntry({
        type:
          action === "publish"
            ? "publish-cms-entry"
            : action === "unpublish"
              ? "unpublish-cms-entry"
              : "archive-cms-entry",
        target,
        scheduledFor,
        description:
          action === "publish"
            ? scheduledFor
              ? `Schedule "${row.title}"`
              : `Publish "${row.title}"`
            : action === "unpublish"
              ? `Unpublish "${row.title}"`
              : `Archive "${row.title}"`,
        afterRedo: onSuccess,
      });
      if (!record) return false;
      toast.success(
        action === "publish"
          ? scheduledFor
            ? `Scheduled "${row.title}"`
            : `Published "${row.title}"`
          : action === "unpublish"
            ? `Unpublished "${row.title}"`
            : `Archived "${row.title}"`,
      );
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} entry`);
      return false;
    } finally {
      isTransitioning.value = false;
    }
  }

  async function transitionEntries(
    action: EntryTransitionAction,
    rows: readonly CmsEntryRow[],
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (rows.length === 0) {
      return false;
    }

    const actionLabels = {
      publish: "published",
      unpublish: "unpublished",
      archive: "archived",
    } as const;

    isTransitioning.value = true;
    try {
      const result = await entryHistory.recordTransitionEntriesBatch({
        type:
          action === "publish"
            ? "publish-cms-entry"
            : action === "unpublish"
              ? "unpublish-cms-entry"
              : "archive-cms-entry",
        rows,
        description:
          rows.length === 1
            ? `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} "${
                rows[0]?.title ?? "entry"
              }"`
            : `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} ${
                rows.length
              } entries`,
        afterRedo: onSuccess,
      });
      const succeeded = result.succeeded;

      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? `Entry ${actionLabels[action]}`
            : `${succeeded} entries ${actionLabels[action]}`,
        );
      }
      if (succeeded < rows.length) {
        toast.error(
          `${actionLabels[action][0]?.toUpperCase() ?? ""}${actionLabels[
            action
          ].slice(1)} ${succeeded} of ${rows.length} entries`,
        );
      }
      return succeeded === rows.length;
    } finally {
      isTransitioning.value = false;
    }
  }

  return {
    isDeleting,
    isDuplicating,
    isTransitioning,
    deleteEntry,
    deleteEntries,
    duplicateEntry,
    duplicateEntries,
    publishEntry: (target, onSuccess, scheduledFor) =>
      transitionEntry("publish", target, onSuccess, scheduledFor),
    scheduleEntry: (target, scheduledFor, onSuccess) =>
      transitionEntry("publish", target, onSuccess, scheduledFor),
    publishEntries: (rows, onSuccess) =>
      transitionEntries("publish", rows, onSuccess),
    unpublishEntry: (row, onSuccess) =>
      transitionEntry("unpublish", row, onSuccess),
    unpublishEntries: (rows, onSuccess) =>
      transitionEntries("unpublish", rows, onSuccess),
    archiveEntry: (row, onSuccess) => transitionEntry("archive", row, onSuccess),
    archiveEntries: (rows, onSuccess) =>
      transitionEntries("archive", rows, onSuccess),
  };
}
