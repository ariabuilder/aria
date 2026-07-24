import { actions } from "astro:actions";
import { z } from "zod";

import { useHistory, type OperationType } from "@/features/History";
import { log } from "@/lib/utils/logger";
import {
  AriaEntryRecordSchema,
  CreateEntryRequestSchema,
  UpdateEntryRequestSchema,
  type AriaEntryRecord,
} from "../../../../lib/cms/schemas";
import {
  ArchiveEntryRequestSchema,
  DeleteEntryRequestSchema,
  DuplicateEntryRequestSchema,
  GetEntryRequestSchema,
  PublishEntryRequestSchema,
  RestoreEntrySnapshotRequestSchema,
  UnpublishEntryRequestSchema,
} from "../../../../lib/cms/actionSchemas";
import { mapEntryRecordToRow, type CmsEntryRow } from "../lib/entryRow";
import { withCmsActionTimeout } from "../lib/actionTimeout";

const CmsHistoryOperationTypeSchema = z.enum([
  "create-cms-entry",
  "update-cms-entry",
  "delete-cms-entry",
  "delete-cms-entries-batch",
  "duplicate-cms-entry",
  "duplicate-cms-entries-batch",
  "publish-cms-entry",
  "unpublish-cms-entry",
  "archive-cms-entry",
  "restore-cms-entry-revision",
]);

const CmsHistoryMetadataSchema = z
  .object({
    type: CmsHistoryOperationTypeSchema,
    description: z.string().trim().min(1),
  })
  .strict();

type CmsHistoryOperationType = z.infer<typeof CmsHistoryOperationTypeSchema>;
type CreateEntryInput = z.infer<typeof CreateEntryRequestSchema>;
type UpdateEntryInput = z.infer<typeof UpdateEntryRequestSchema>;
type TransitionInput =
  | z.infer<typeof PublishEntryRequestSchema>
  | z.infer<typeof UnpublishEntryRequestSchema>
  | z.infer<typeof ArchiveEntryRequestSchema>;
type TransitionEntryTarget = CmsEntryRow | AriaEntryRecord;

interface CmsHistoryCallbacks {
  redo: () => Promise<void>;
  undo: () => Promise<void>;
}

interface CmsHistoryExecuteOptions {
  throwOnFailure?: boolean;
}

interface RecordCreateEntryInput {
  payload: CreateEntryInput;
  description: string;
  afterRedo?: (record: AriaEntryRecord) => Promise<void> | void;
  afterUndo?: () => Promise<void> | void;
}

interface RecordUpdateEntryInput {
  payload: UpdateEntryInput;
  description: string;
  afterRedo?: (record: AriaEntryRecord) => Promise<void> | void;
  afterUndo?: (record: AriaEntryRecord) => Promise<void> | void;
}

interface RecordDeleteEntryInput {
  row: CmsEntryRow;
  description: string;
  afterRedo?: () => Promise<void> | void;
  afterUndo?: (record: AriaEntryRecord) => Promise<void> | void;
}

interface RecordDeleteEntriesBatchInput {
  rows: readonly CmsEntryRow[];
  description: string;
  afterRedo?: () => Promise<void> | void;
  afterUndo?: () => Promise<void> | void;
}

interface RecordDuplicateEntryInput {
  row: CmsEntryRow;
  description: string;
  afterRedo?: (record: AriaEntryRecord) => Promise<void> | void;
  afterUndo?: () => Promise<void> | void;
}

interface RecordDuplicateEntriesBatchInput {
  rows: readonly CmsEntryRow[];
  description: string;
  afterRedo?: () => Promise<void> | void;
  afterUndo?: () => Promise<void> | void;
}

interface RecordTransitionEntryInput {
  type: "publish-cms-entry" | "unpublish-cms-entry" | "archive-cms-entry";
  target: TransitionEntryTarget;
  description: string;
  scheduledFor?: string;
  afterRedo?: (record: AriaEntryRecord) => Promise<void> | void;
  afterUndo?: (record: AriaEntryRecord) => Promise<void> | void;
}

interface RecordTransitionEntriesBatchInput {
  type: "publish-cms-entry" | "unpublish-cms-entry" | "archive-cms-entry";
  rows: readonly CmsEntryRow[];
  description: string;
  afterRedo?: () => Promise<void> | void;
  afterUndo?: () => Promise<void> | void;
}

export interface CmsBatchResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

function cmsActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

async function getEntrySnapshot(
  row: Pick<CmsEntryRow, "id" | "collectionId">,
): Promise<AriaEntryRecord> {
  const payload = GetEntryRequestSchema.parse({
    collectionId: row.collectionId,
    idOrSlug: row.id,
    include: ["relations"],
  });
  const { data, error } = await withCmsActionTimeout(
    actions.cms.entries.get(payload),
    "Load entry snapshot",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to load entry"));
  }
  return AriaEntryRecordSchema.parse(data);
}

async function deleteEntry(row: CmsEntryRow): Promise<void> {
  const payload = DeleteEntryRequestSchema.parse({
    collectionId: row.collectionId,
    id: row.id,
  });
  const { error } = await withCmsActionTimeout(
    actions.cms.entries.remove(payload),
    "Delete entry",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to delete entry"));
  }
}

async function restoreEntrySnapshot(
  snapshot: AriaEntryRecord,
  expectedVersion: string | undefined,
  message: string,
): Promise<AriaEntryRecord> {
  const payload = RestoreEntrySnapshotRequestSchema.parse({
    collectionId: snapshot.entry.collectionId,
    snapshot,
    expectedVersion,
    message,
  });
  const { data, error } = await withCmsActionTimeout(
    actions.cms.entries.restoreSnapshot(payload),
    "Restore entry",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to restore entry"));
  }
  return AriaEntryRecordSchema.parse(data);
}

async function createEntry(payload: CreateEntryInput): Promise<AriaEntryRecord> {
  const parsedPayload = CreateEntryRequestSchema.parse(payload);
  const { data, error } = await withCmsActionTimeout(
    actions.cms.entries.create(parsedPayload),
    "Create entry",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to create entry"));
  }
  return AriaEntryRecordSchema.parse(data);
}

async function updateEntry(payload: UpdateEntryInput): Promise<AriaEntryRecord> {
  const parsedPayload = UpdateEntryRequestSchema.parse(payload);
  const { data, error } = await withCmsActionTimeout(
    actions.cms.entries.update(parsedPayload),
    "Update entry",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to update entry"));
  }
  return AriaEntryRecordSchema.parse(data);
}

async function duplicateEntry(row: CmsEntryRow): Promise<AriaEntryRecord> {
  const payload = DuplicateEntryRequestSchema.parse({
    collectionId: row.collectionId,
    id: row.id,
  });
  const { data, error } = await withCmsActionTimeout(
    actions.cms.entries.duplicate(payload),
    "Duplicate entry",
  );
  if (error) {
    throw new Error(cmsActionErrorMessage(error, "Failed to duplicate entry"));
  }
  return AriaEntryRecordSchema.parse(data);
}

async function transitionEntry(
  type: RecordTransitionEntryInput["type"],
  payload: TransitionInput,
): Promise<AriaEntryRecord> {
  const result =
    type === "publish-cms-entry"
      ? await withCmsActionTimeout(
          actions.cms.entries.publish(PublishEntryRequestSchema.parse(payload)),
          "Publish entry",
        )
      : type === "unpublish-cms-entry"
        ? await withCmsActionTimeout(
            actions.cms.entries.unpublish(
              UnpublishEntryRequestSchema.parse(payload),
            ),
            "Unpublish entry",
          )
        : await withCmsActionTimeout(
            actions.cms.entries.archive(ArchiveEntryRequestSchema.parse(payload)),
            "Archive entry",
          );
  if (result.error) {
    throw new Error(
      cmsActionErrorMessage(result.error, "Failed to update entry status"),
    );
  }
  return AriaEntryRecordSchema.parse(result.data);
}

function transitionPayload(
  target: TransitionEntryTarget,
  version: string,
  type: RecordTransitionEntryInput["type"],
  scheduledFor?: string,
): TransitionInput {
  const row = transitionTargetToRow(target);
  const basePayload = {
    collectionId: row.collectionId,
    id: row.id,
    version,
  };
  return type === "publish-cms-entry"
    ? PublishEntryRequestSchema.parse({
        ...basePayload,
        ...(scheduledFor ? { scheduledFor } : {}),
      })
    : type === "unpublish-cms-entry"
      ? UnpublishEntryRequestSchema.parse(basePayload)
      : ArchiveEntryRequestSchema.parse(basePayload);
}

function isEntryRecord(target: TransitionEntryTarget): target is AriaEntryRecord {
  return "entry" in target && "locales" in target;
}

function transitionTargetToRow(target: TransitionEntryTarget): CmsEntryRow {
  return isEntryRecord(target) ? mapEntryRecordToRow(target) : target;
}

async function getTransitionSnapshot(
  target: TransitionEntryTarget,
): Promise<AriaEntryRecord> {
  return isEntryRecord(target) ? target : getEntrySnapshot(target);
}

export function useCmsEntryHistory() {
  const { execute } = useHistory();

  async function executeCmsOperation(
    metadata: { type: CmsHistoryOperationType; description: string },
    callbacks: CmsHistoryCallbacks,
    options: CmsHistoryExecuteOptions = {},
  ): Promise<boolean> {
    const parsedMetadata = CmsHistoryMetadataSchema.safeParse(metadata);
    if (!parsedMetadata.success) {
      log("warn", "[CMS] Invalid history metadata", {
        issues: parsedMetadata.error.issues,
      });
      return false;
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      redo: callbacks.redo,
      undo: callbacks.undo,
    });

    if (!result.success) {
      log("warn", "[CMS] History operation failed", {
        type: parsedMetadata.data.type,
        description: parsedMetadata.data.description,
        error: result.error?.message,
      });
      if (options.throwOnFailure) {
        throw result.error ?? new Error("History operation failed");
      }
      return false;
    }

    return true;
  }

  async function recordCreateEntry(
    input: RecordCreateEntryInput,
  ): Promise<AriaEntryRecord | null> {
    const payload = CreateEntryRequestSchema.parse(input.payload);
    let created: AriaEntryRecord | null = null;
    const succeeded = await executeCmsOperation(
      {
        type: "create-cms-entry",
        description: input.description,
      },
      {
        redo: async () => {
          created = await createEntry(payload);
          await input.afterRedo?.(created);
        },
        undo: async () => {
          if (!created) return;
          await deleteEntry(mapEntryRecordToRow(created));
          await input.afterUndo?.();
        },
      },
    );

    return succeeded ? created : null;
  }

  async function recordUpdateEntry(
    input: RecordUpdateEntryInput,
  ): Promise<AriaEntryRecord | null> {
    let payload = UpdateEntryRequestSchema.parse(input.payload);
    const snapshot = await getEntrySnapshot({
      id: payload.id,
      collectionId: payload.collectionId,
    });
    let updated: AriaEntryRecord | null = null;
    let undoExpectedVersion: string | undefined;

    const succeeded = await executeCmsOperation(
      {
        type: "update-cms-entry",
        description: input.description,
      },
      {
        redo: async () => {
          updated = await updateEntry(payload);
          undoExpectedVersion = updated.entry.version;
          await input.afterRedo?.(updated);
        },
        undo: async () => {
          const restored = await restoreEntrySnapshot(
            snapshot,
            undoExpectedVersion,
            "Undo entry update",
          );
          payload = {
            ...payload,
            version: restored.entry.version,
          };
          await input.afterUndo?.(restored);
        },
      },
      { throwOnFailure: true },
    );

    return succeeded ? updated : null;
  }

  async function recordDeleteEntry(
    input: RecordDeleteEntryInput,
  ): Promise<boolean> {
    const snapshot = await getEntrySnapshot(input.row);
    let undoExpectedVersion: string | undefined;

    return executeCmsOperation(
      {
        type: "delete-cms-entry",
        description: input.description,
      },
      {
        redo: async () => {
          await deleteEntry(input.row);
          undoExpectedVersion = undefined;
          await input.afterRedo?.();
        },
        undo: async () => {
          const restored = await restoreEntrySnapshot(
            snapshot,
            undoExpectedVersion,
            "Undo entry delete",
          );
          undoExpectedVersion = restored.entry.version;
          await input.afterUndo?.(restored);
        },
      },
    );
  }

  async function recordDeleteEntriesBatch(
    input: RecordDeleteEntriesBatchInput,
  ): Promise<CmsBatchResult> {
    const snapshots: AriaEntryRecord[] = [];
    const errors: string[] = [];
    for (const row of input.rows) {
      try {
        snapshots.push(await getEntrySnapshot(row));
      } catch (error) {
        errors.push(`${row.title}: ${cmsActionErrorMessage(error, "Snapshot failed")}`);
      }
    }

    if (snapshots.length === 0) {
      return { succeeded: 0, failed: input.rows.length, errors };
    }

    const deletedIds = new Set<string>();
    const succeeded = await executeCmsOperation(
      {
        type: "delete-cms-entries-batch",
        description: input.description,
      },
      {
        redo: async () => {
          deletedIds.clear();
          for (const snapshot of snapshots) {
            try {
              await deleteEntry(mapEntryRecordToRow(snapshot));
              deletedIds.add(snapshot.entry.id);
            } catch (error) {
              errors.push(
                `${snapshot.locales[0]?.title ?? snapshot.entry.id}: ${cmsActionErrorMessage(
                  error,
                  "Delete failed",
                )}`,
              );
            }
          }
          await input.afterRedo?.();
          if (deletedIds.size === 0) {
            throw new Error(errors[0] ?? "Failed to delete selected entries");
          }
        },
        undo: async () => {
          for (const snapshot of [...snapshots].reverse()) {
            if (!deletedIds.has(snapshot.entry.id)) continue;
            await restoreEntrySnapshot(snapshot, undefined, "Undo entry delete");
          }
          await input.afterUndo?.();
        },
      },
    );

    if (!succeeded) {
      return {
        succeeded: 0,
        failed: input.rows.length,
        errors: errors.length > 0 ? errors : ["Batch delete failed"],
      };
    }

    return {
      succeeded: deletedIds.size,
      failed: input.rows.length - deletedIds.size,
      errors,
    };
  }

  async function recordDuplicateEntry(
    input: RecordDuplicateEntryInput,
  ): Promise<AriaEntryRecord | null> {
    let duplicated: AriaEntryRecord | null = null;
    const succeeded = await executeCmsOperation(
      {
        type: "duplicate-cms-entry",
        description: input.description,
      },
      {
        redo: async () => {
          duplicated = await duplicateEntry(input.row);
          await input.afterRedo?.(duplicated);
        },
        undo: async () => {
          if (!duplicated) return;
          await deleteEntry(mapEntryRecordToRow(duplicated));
          await input.afterUndo?.();
        },
      },
    );

    return succeeded ? duplicated : null;
  }

  async function recordDuplicateEntriesBatch(
    input: RecordDuplicateEntriesBatchInput,
  ): Promise<CmsBatchResult> {
    const duplicated: AriaEntryRecord[] = [];
    const errors: string[] = [];
    const succeeded = await executeCmsOperation(
      {
        type: "duplicate-cms-entries-batch",
        description: input.description,
      },
      {
        redo: async () => {
          duplicated.length = 0;
          for (const row of input.rows) {
            try {
              duplicated.push(await duplicateEntry(row));
            } catch (error) {
              errors.push(
                `${row.title}: ${cmsActionErrorMessage(error, "Duplicate failed")}`,
              );
            }
          }
          await input.afterRedo?.();
          if (duplicated.length === 0) {
            throw new Error(errors[0] ?? "Failed to duplicate selected entries");
          }
        },
        undo: async () => {
          for (const record of [...duplicated].reverse()) {
            await deleteEntry(mapEntryRecordToRow(record));
          }
          await input.afterUndo?.();
        },
      },
    );

    if (!succeeded) {
      return {
        succeeded: 0,
        failed: input.rows.length,
        errors: errors.length > 0 ? errors : ["Batch duplicate failed"],
      };
    }

    return {
      succeeded: duplicated.length,
      failed: input.rows.length - duplicated.length,
      errors,
    };
  }

  async function recordTransitionEntry(
    input: RecordTransitionEntryInput,
  ): Promise<AriaEntryRecord | null> {
    const snapshot = await getTransitionSnapshot(input.target);
    let nextVersion = snapshot.entry.version;
    let transitioned: AriaEntryRecord | null = null;
    let undoExpectedVersion: string | undefined;

    const succeeded = await executeCmsOperation(
      {
        type: input.type,
        description: input.description,
      },
      {
        redo: async () => {
          transitioned = await transitionEntry(
            input.type,
            transitionPayload(
              snapshot,
              nextVersion,
              input.type,
              input.scheduledFor,
            ),
          );
          undoExpectedVersion = transitioned.entry.version;
          await input.afterRedo?.(transitioned);
        },
        undo: async () => {
          const restored = await restoreEntrySnapshot(
            snapshot,
            undoExpectedVersion,
            "Undo entry status change",
          );
          nextVersion = restored.entry.version;
          await input.afterUndo?.(restored);
        },
      },
    );

    return succeeded ? transitioned : null;
  }

  async function recordTransitionEntriesBatch(
    input: RecordTransitionEntriesBatchInput,
  ): Promise<CmsBatchResult> {
    const snapshots: AriaEntryRecord[] = [];
    const errors: string[] = [];
    for (const row of input.rows) {
      try {
        snapshots.push(await getEntrySnapshot(row));
      } catch (error) {
        errors.push(`${row.title}: ${cmsActionErrorMessage(error, "Snapshot failed")}`);
      }
    }

    const transitioned = new Map<string, AriaEntryRecord>();
    const nextVersions = new Map(
      snapshots.map((snapshot) => [snapshot.entry.id, snapshot.entry.version]),
    );
    const succeeded = await executeCmsOperation(
      {
        type: input.type,
        description: input.description,
      },
      {
        redo: async () => {
          transitioned.clear();
          for (const snapshot of snapshots) {
            try {
              const row = input.rows.find((item) => item.id === snapshot.entry.id);
              const version =
                nextVersions.get(snapshot.entry.id) ??
                row?.version ??
                snapshot.entry.version;
              const record = await transitionEntry(
                input.type,
                transitionPayload(
                  { ...mapEntryRecordToRow(snapshot), version },
                  version,
                  input.type,
                ),
              );
              transitioned.set(snapshot.entry.id, record);
              nextVersions.set(snapshot.entry.id, record.entry.version);
            } catch (error) {
              errors.push(
                `${snapshot.locales[0]?.title ?? snapshot.entry.id}: ${cmsActionErrorMessage(
                  error,
                  "Status change failed",
                )}`,
              );
            }
          }
          await input.afterRedo?.();
          if (transitioned.size === 0) {
            throw new Error(errors[0] ?? "Failed to update selected entries");
          }
        },
        undo: async () => {
          for (const snapshot of [...snapshots].reverse()) {
            const latest = transitioned.get(snapshot.entry.id);
            if (!latest) continue;
            const restored = await restoreEntrySnapshot(
              snapshot,
              latest.entry.version,
              "Undo entry status change",
            );
            nextVersions.set(snapshot.entry.id, restored.entry.version);
          }
          await input.afterUndo?.();
        },
      },
    );

    if (!succeeded) {
      return {
        succeeded: 0,
        failed: input.rows.length,
        errors: errors.length > 0 ? errors : ["Batch status update failed"],
      };
    }

    return {
      succeeded: transitioned.size,
      failed: input.rows.length - transitioned.size,
      errors,
    };
  }

  return {
    executeCmsOperation,
    recordCreateEntry,
    recordUpdateEntry,
    recordDeleteEntry,
    recordDeleteEntriesBatch,
    recordDuplicateEntry,
    recordDuplicateEntriesBatch,
    recordTransitionEntry,
    recordTransitionEntriesBatch,
  };
}
