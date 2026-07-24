import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import {
  AriaEntryRecordSchema,
  type AriaEntryRecord,
  type AriaEntryRevision,
} from "../../../../lib/cms/schemas";
import {
  ListRevisionsRequestSchema,
  ListRevisionsResponseSchema,
  RestoreRevisionRequestSchema,
} from "../../../../lib/cms/actionSchemas";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { withCmsActionTimeout } from "../lib/actionTimeout";

export interface UseEntryRevisionsReturn {
  revisions: Ref<AriaEntryRevision[]>;
  isLoadingRevisions: Ref<boolean>;
  isRestoringRevision: Ref<boolean>;
  hasLoadedRevisions: Ref<boolean>;
  revisionError: Ref<string | null>;
  loadRevisions: (input: {
    collectionId: string;
    entryId: string;
  }) => Promise<void>;
  restoreRevision: (input: {
    collectionId: string;
    entryId: string;
    revisionId: string;
    expectedVersion: string;
  }) => Promise<AriaEntryRecord | null>;
  resetRevisions: () => void;
}

export function useEntryRevisions(): UseEntryRevisionsReturn {
  const revisions = ref<AriaEntryRevision[]>([]);
  const isLoadingRevisions = ref(false);
  const isRestoringRevision = ref(false);
  const hasLoadedRevisions = ref(false);
  const revisionError = ref<string | null>(null);

  function resetRevisions(): void {
    revisions.value = [];
    revisionError.value = null;
    isLoadingRevisions.value = false;
    isRestoringRevision.value = false;
    hasLoadedRevisions.value = false;
  }

  async function loadRevisions(input: {
    collectionId: string;
    entryId: string;
  }): Promise<void> {
    const payload = ListRevisionsRequestSchema.parse({
      collectionId: input.collectionId,
      entryId: input.entryId,
      page: 1,
      limit: 20,
    });

    isLoadingRevisions.value = true;
    revisionError.value = null;
    try {
      const { data, error } = await withCmsActionTimeout(
        actions.cms.revisions.list(payload),
        "Load revisions",
      );
      if (error) {
        if (handleActionResultForbidden({ error }, "cms.revisions.list")) {
          revisionError.value =
            "You do not have permission to view revisions.";
          return;
        }
        revisionError.value = error.message ?? "Failed to load revisions";
        return;
      }

      const parsed = ListRevisionsResponseSchema.parse(data);
      revisions.value = parsed.revisions;
      hasLoadedRevisions.value = true;
    } catch (err) {
      revisionError.value =
        err instanceof Error ? err.message : "Failed to load revisions";
    } finally {
      isLoadingRevisions.value = false;
    }
  }

  async function restoreRevision(input: {
    collectionId: string;
    entryId: string;
    revisionId: string;
    expectedVersion: string;
  }): Promise<AriaEntryRecord | null> {
    const payload = RestoreRevisionRequestSchema.parse(input);

    isRestoringRevision.value = true;
    try {
      const { data, error } = await withCmsActionTimeout(
        actions.cms.revisions.restore(payload),
        "Restore revision",
      );
      if (error) {
        if (handleActionResultForbidden({ error }, "cms.revisions.restore")) {
          return null;
        }
        toast.error(error.message ?? "Failed to restore revision");
        return null;
      }

      const record = AriaEntryRecordSchema.parse(data);
      toast.success("Revision restored");
      return record;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore revision",
      );
      return null;
    } finally {
      isRestoringRevision.value = false;
    }
  }

  return {
    revisions,
    isLoadingRevisions,
    isRestoringRevision,
    hasLoadedRevisions,
    revisionError,
    loadRevisions,
    restoreRevision,
    resetRevisions,
  };
}
