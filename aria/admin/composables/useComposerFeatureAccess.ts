/**
 * Combines role capabilities with feature flags for Composer entry.
 */

import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../../lib/features";
import {
  CONTRIBUTOR_COMPOSER_DENIED_MESSAGE,
  type StudioItemType,
} from "./useComposerAccess";
import { useStudioCapabilities } from "./useStudioCapabilities";

export function useComposerFeatureAccess() {
  const caps = useStudioCapabilities();

  function canEnterComposerForItem(itemType: StudioItemType): boolean {
    if (!isComposerItemFeatureEnabled(itemType)) {
      return false;
    }

    if (!caps.isReady.value) {
      return true;
    }

    return caps.canEditItemInComposer(itemType);
  }

  function getComposerEntryBlockedMessage(
    itemType: StudioItemType,
  ): string | null {
    const featureMessage = getComposerItemFeatureDisabledMessage(itemType);
    if (featureMessage) {
      return featureMessage;
    }

    if (caps.isReady.value && !caps.canEditItemInComposer(itemType)) {
      return caps.isContributor.value
        ? CONTRIBUTOR_COMPOSER_DENIED_MESSAGE
        : caps.getForbiddenMessage(caps.composerOperationForItem(itemType));
    }

    return null;
  }

  return {
    canEnterComposerForItem,
    getComposerEntryBlockedMessage,
    isComposerItemFeatureEnabled,
  };
}
