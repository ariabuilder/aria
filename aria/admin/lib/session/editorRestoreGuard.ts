import type { ComposerRouteTarget } from "@/lib/router/composerRouteTarget";
import type { ItemType } from "@/types/app";
import type { PageDSL } from "../../../lib/types/nodes";

export interface SessionEditorRestoreInput {
  composerTarget: ComposerRouteTarget | null;
  currentItemType: ItemType;
  currentPage: PageDSL | null | undefined;
}

/**
 * Skip restoring page blocks / currentPage whenever a composer deep link is
 * present. Server compose pins are authoritative for version; sessionStorage
 * must not rehydrate a stale expectedVersion into the editor.
 */
export function shouldSkipSessionEditorContentRestore(
  input: SessionEditorRestoreInput,
): boolean {
  return input.composerTarget !== null;
}
