/**
 * Composer entry capability checks (mirrors save.* / nodes.* server gates).
 */

import { z } from "zod";
import {
  OperationIdSchema,
  type OperationId,
} from "../../lib/auth/capabilityOperations";

export const StudioItemTypeSchema = z.enum(["page", "layout", "component"]);
export type StudioItemType = z.infer<typeof StudioItemTypeSchema>;

const COMPOSER_OPERATION_BY_ITEM_TYPE: Record<StudioItemType, OperationId> = {
  page: "save.page",
  layout: "save.layout",
  component: "save.component",
};

export function composerOperationForItemType(
  itemType: StudioItemType,
): OperationId {
  const parsedType = StudioItemTypeSchema.parse(itemType);
  return OperationIdSchema.parse(
    COMPOSER_OPERATION_BY_ITEM_TYPE[parsedType],
  );
}

export function canEditItemInComposer(
  canOperation: (operationId: OperationId) => boolean,
  itemType: StudioItemType,
): boolean {
  return canOperation(composerOperationForItemType(itemType));
}

export const CONTRIBUTOR_LANDING_PATH = "/media" as const;

export const CONTRIBUTOR_PAGES_EMPTY_DESCRIPTION =
  "Your role can add CMS content and upload media. Page editing requires Content Editor or higher." as const;

export const CONTRIBUTOR_COMPOSER_DENIED_MESSAGE =
  "Your role cannot edit pages in the composer. Use Components or Media instead." as const;
