import {
  ComposerItemTypeSchema,
  type ComposerItemType,
  FeatureFlagIdSchema,
} from "./schemas";
import { isFeatureEnabled } from "./resolve";

export const LAYOUT_COMPOSER_DISABLED_MESSAGE =
  "Layout editing isn't available yet." as const;

const COMPOSER_ITEM_FEATURE_FLAG: Partial<
  Record<ComposerItemType, (typeof FeatureFlagIdSchema.options)[number]>
> = {
  layout: "studio.layouts",
};

export function isComposerItemFeatureEnabled(
  itemType: ComposerItemType,
): boolean {
  const parsedItemType = ComposerItemTypeSchema.parse(itemType);
  const flagId = COMPOSER_ITEM_FEATURE_FLAG[parsedItemType];
  if (!flagId) {
    return true;
  }

  return isFeatureEnabled(flagId);
}

export function getComposerItemFeatureDisabledMessage(
  itemType: ComposerItemType,
): string | null {
  const parsedItemType = ComposerItemTypeSchema.parse(itemType);
  if (isComposerItemFeatureEnabled(parsedItemType)) {
    return null;
  }

  if (parsedItemType === "layout") {
    return LAYOUT_COMPOSER_DISABLED_MESSAGE;
  }

  return "This editor mode isn't available yet.";
}
