/**
 * Client-side effective capability checks (mirrors server requireOperation OR semantics).
 */

import { computed, type ComputedRef } from "vue";
import {
  CapabilitySchema,
  resolveEffectiveCapabilities,
  type Capability,
  type SessionUser,
} from "../../lib/auth/types";
import { resolveUserPermissionProfile } from "../../lib/authorship/permissionProfile";
import {
  getCapabilitiesForOperation,
  OperationIdSchema,
  type OperationId,
} from "../../lib/auth/capabilityOperations";
import { useUser } from "../features/Auth/composables/useUser";

export const FORBIDDEN_MESSAGES: Partial<Record<OperationId, string>> = {
  "save.page": "You do not have permission to edit pages.",
  "save.layout": "You do not have permission to edit layouts.",
  "save.component": "You do not have permission to edit components.",
  "nodes.mutate": "You do not have permission to edit page content.",
  "crud.createItem": "You do not have permission to create pages.",
  "crud.deleteItem": "You do not have permission to delete pages.",
  "crud.duplicateItem": "You do not have permission to duplicate pages.",
  "publishing.publish": "You do not have permission to publish content.",
  "publishing.batchPublish": "You do not have permission to publish content.",
  "pages.updateSeo": "You do not have permission to edit page SEO.",
  "pages.cover": "You do not have permission to change cover images.",
  "pages.removeCover": "You do not have permission to remove cover images.",
  "pages.reorderSections": "You do not have permission to reorder page sections.",
  "pages.revertVersion": "You do not have permission to restore page versions.",
  "pages.deleteVersion": "You do not have permission to delete page revisions.",
  "pages.bulkUpdate": "You do not have permission to update page hierarchy.",
  "pages.updatePolicy": "You do not have permission to manage page access policy.",
  "ordering.updateOrder": "You do not have permission to reorder pages.",
  "media.delete": "You do not have permission to delete media.",
  "library.installComponent": "You do not have permission to install CMS components.",
  "cms.collections.create":
    "You do not have permission to create collections.",
  "cms.collections.update":
    "You do not have permission to update collections.",
  "cms.collections.remove":
    "You do not have permission to delete collections.",
  "cms.collections.list": "You do not have permission to view collections.",
  "cms.entries.create": "You do not have permission to create entries.",
  "cms.entries.update": "You do not have permission to update entries.",
  "cms.entries.remove": "You do not have permission to delete entries.",
  "cms.entries.publish": "You do not have permission to publish entries.",
  "cms.entries.unpublish": "You do not have permission to unpublish entries.",
  "cms.entries.archive": "You do not have permission to archive entries.",
  "cms.revisions.list": "You do not have permission to view revisions.",
  "cms.revisions.get": "You do not have permission to view revisions.",
  "cms.revisions.restore":
    "You do not have permission to restore revisions.",
  "analytics.getSiteTraffic":
    "You do not have permission to view traffic metrics.",
  "analytics.getPagesTraffic":
    "You do not have permission to view traffic metrics.",
  "analytics.getPageTraffic":
    "You do not have permission to view traffic metrics.",
};

function parseOperationId(id: string): OperationId {
  return OperationIdSchema.parse(id);
}

function parseCapability(cap: string): Capability {
  return CapabilitySchema.parse(cap);
}

function resolveProfile(user: SessionUser | null) {
  if (!user) return null;
  return resolveUserPermissionProfile(user);
}

export interface UseCapabilitiesReturn {
  effectiveCapabilities: ComputedRef<Capability[]>;
  isReady: ComputedRef<boolean>;
  hasCapability: (capability: Capability) => boolean;
  canOperation: (operationId: OperationId) => boolean;
  getForbiddenMessage: (operationId: OperationId) => string;
}

export function getForbiddenMessageForOperation(operationId: OperationId): string {
  const parsedOperation = parseOperationId(operationId);
  return (
    FORBIDDEN_MESSAGES[parsedOperation] ??
    `You do not have permission for ${parsedOperation}.`
  );
}

export function useCapabilities(): UseCapabilitiesReturn {
  const { user, isLoading } = useUser();

  const isReady: ComputedRef<boolean> = computed(
    () => !isLoading.value && user.value !== null,
  );

  const effectiveCapabilities = computed(() => {
    const profile = resolveProfile(user.value);
    if (!profile) return [];
    return resolveEffectiveCapabilities(profile);
  });

  function hasCapability(capability: Capability): boolean {
    const parsed = parseCapability(capability);
    return effectiveCapabilities.value.includes(parsed);
  }

  function canOperation(operationId: OperationId): boolean {
    const parsedOperation = parseOperationId(operationId);
    const required = getCapabilitiesForOperation(parsedOperation);
    if (required.length === 0) return false;
    return required.some((capability) =>
      effectiveCapabilities.value.includes(capability),
    );
  }

  function getForbiddenMessage(operationId: OperationId): string {
    return getForbiddenMessageForOperation(operationId);
  }

  return {
    effectiveCapabilities,
    isReady,
    hasCapability,
    canOperation,
    getForbiddenMessage,
  };
}
