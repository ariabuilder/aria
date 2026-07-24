/**
 * Studio UI capability flags (named checks for views).
 */

import { computed, type ComputedRef } from "vue";
import { RolePresetSchema } from "../../lib/auth/types";
import { resolveUserPermissionProfile } from "../../lib/authorship/permissionProfile";
import type { OperationId } from "../../lib/auth/capabilityOperations";
import { useCapabilities } from "./useCapabilities";
import { useUser } from "../features/Auth/composables/useUser";
import {
  canEditItemInComposer,
  composerOperationForItemType,
  type StudioItemType,
} from "./useComposerAccess";

export interface UseStudioCapabilitiesReturn {
  isReady: ComputedRef<boolean>;
  canEditInComposer: ComputedRef<boolean>;
  canCreatePage: ComputedRef<boolean>;
  canDeletePage: ComputedRef<boolean>;
  canPublish: ComputedRef<boolean>;
  canUnpublish: ComputedRef<boolean>;
  canArchive: ComputedRef<boolean>;
  canUnarchive: ComputedRef<boolean>;
  canSchedule: ComputedRef<boolean>;
  canEditPageSeo: ComputedRef<boolean>;
  canEditPageStructure: ComputedRef<boolean>;
  canRevertPageVersion: ComputedRef<boolean>;
  canDeletePageVersion: ComputedRef<boolean>;
  canChangeCover: ComputedRef<boolean>;
  canRemoveCover: ComputedRef<boolean>;
  canManagePagePolicy: ComputedRef<boolean>;
  canUploadMedia: ComputedRef<boolean>;
  canDeleteMedia: ComputedRef<boolean>;
  canViewStudioMetrics: ComputedRef<boolean>;
  isContributor: ComputedRef<boolean>;
  canEditItemInComposer: (itemType: StudioItemType) => boolean;
  composerOperationForItem: (itemType: StudioItemType) => OperationId;
  getForbiddenMessage: (operationId: OperationId) => string;
}

export function useStudioCapabilities(): UseStudioCapabilitiesReturn {
  const { user } = useUser();
  const {
    isReady,
    canOperation,
    hasCapability,
    getForbiddenMessage,
  } = useCapabilities();

  const isContributor = computed(() => {
    if (!user.value) return false;
    const profile = resolveUserPermissionProfile(user.value);
    return RolePresetSchema.parse(profile.rolePreset) === "contributor";
  });

  const canEditInComposer = computed(() => canOperation("save.page"));

  const canCreatePage = computed(() => canOperation("crud.createItem"));
  const canDeletePage = computed(() => canOperation("crud.deleteItem"));
  const canPublish = computed(() => canOperation("publishing.publish"));
  const canUnpublish = computed(() => canOperation("publishing.unpublish"));
  const canArchive = computed(() => canOperation("publishing.archive"));
  const canUnarchive = computed(() => canOperation("publishing.unarchive"));
  const canSchedule = computed(() => canOperation("publishing.publish"));
  const canEditPageSeo = computed(() => canOperation("pages.updateSeo"));
  const canEditPageStructure = computed(() =>
    canOperation("pages.reorderSections"),
  );
  const canRevertPageVersion = computed(() =>
    canOperation("pages.revertVersion"),
  );
  const canDeletePageVersion = computed(() =>
    canOperation("pages.deleteVersion"),
  );
  const canChangeCover = computed(() => canOperation("pages.cover"));
  const canRemoveCover = computed(() => canOperation("pages.removeCover"));
  const canManagePagePolicy = computed(() =>
    canOperation("pages.getPolicy"),
  );
  const canUploadMedia = computed(() => canOperation("media.upload"));
  const canDeleteMedia = computed(() => canOperation("media.delete"));
  const canViewStudioMetrics = computed(() =>
    hasCapability("viewStudioMetrics"),
  );

  function canEditItemInComposerForType(itemType: StudioItemType): boolean {
    return canEditItemInComposer(canOperation, itemType);
  }

  function composerOperationForItem(itemType: StudioItemType): OperationId {
    return composerOperationForItemType(itemType);
  }

  return {
    isReady,
    canEditInComposer,
    canCreatePage,
    canDeletePage,
    canPublish,
    canUnpublish,
    canArchive,
    canUnarchive,
    canSchedule,
    canEditPageSeo,
    canEditPageStructure,
    canRevertPageVersion,
    canDeletePageVersion,
    canChangeCover,
    canRemoveCover,
    canManagePagePolicy,
    canUploadMedia,
    canDeleteMedia,
    canViewStudioMetrics,
    isContributor,
    canEditItemInComposer: canEditItemInComposerForType,
    composerOperationForItem,
    getForbiddenMessage,
  };
}
