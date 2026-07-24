import { computed, type ComputedRef } from "vue";
import type { OperationId } from "../../../../lib/auth/capabilityOperations";
import { useCapabilities } from "@/composables/useCapabilities";

export interface UseCmsCapabilitiesReturn {
  canCreateCollection: ComputedRef<boolean>;
  canUpdateCollection: ComputedRef<boolean>;
  canDeleteCollection: ComputedRef<boolean>;
  canListCollections: ComputedRef<boolean>;
  canCreateEntry: ComputedRef<boolean>;
  canUpdateEntry: ComputedRef<boolean>;
  canDeleteEntry: ComputedRef<boolean>;
  canPublishEntry: ComputedRef<boolean>;
  canUnpublishEntry: ComputedRef<boolean>;
  canArchiveEntry: ComputedRef<boolean>;
  canListRevisions: ComputedRef<boolean>;
  canRestoreRevision: ComputedRef<boolean>;
  canCompareRevisions: ComputedRef<boolean>;
  canModerateComments: ComputedRef<boolean>;
  canReviewCmsEntry: ComputedRef<boolean>;
  getForbiddenMessage: (operationId: OperationId) => string;
}

export function useCmsCapabilities(): UseCmsCapabilitiesReturn {
  const { canOperation, getForbiddenMessage } = useCapabilities();

  const canCreateCollection = computed(() =>
    canOperation("cms.collections.create"),
  );
  const canUpdateCollection = computed(() =>
    canOperation("cms.collections.update"),
  );
  const canDeleteCollection = computed(() =>
    canOperation("cms.collections.remove"),
  );
  const canListCollections = computed(() =>
    canOperation("cms.collections.list"),
  );
  const canCreateEntry = computed(() => canOperation("cms.entries.create"));
  const canUpdateEntry = computed(() => canOperation("cms.entries.update"));
  const canDeleteEntry = computed(() => canOperation("cms.entries.remove"));
  const canPublishEntry = computed(() => canOperation("cms.entries.publish"));
  const canUnpublishEntry = computed(() =>
    canOperation("cms.entries.unpublish"),
  );
  const canArchiveEntry = computed(() => canOperation("cms.entries.archive"));
  const canListRevisions = computed(() => canOperation("cms.revisions.list"));
  const canRestoreRevision = computed(() =>
    canOperation("cms.revisions.restore"),
  );
  const canCompareRevisions = computed(() =>
    canOperation("cms.workflows.compareRevisions"),
  );
  const canModerateComments = computed(() =>
    canOperation("cms.comments.moderate"),
  );
  const canReviewCmsEntry = computed(() =>
    canOperation("cms.workflows.updateReview"),
  );

  return {
    canCreateCollection,
    canUpdateCollection,
    canDeleteCollection,
    canListCollections,
    canCreateEntry,
    canUpdateEntry,
    canDeleteEntry,
    canPublishEntry,
    canUnpublishEntry,
    canArchiveEntry,
    canListRevisions,
    canRestoreRevision,
    canCompareRevisions,
    canModerateComments,
    canReviewCmsEntry,
    getForbiddenMessage,
  };
}
