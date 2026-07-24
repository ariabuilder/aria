import type { ComponentDSL } from "../types/nodes";
import { buildComponentSnapshotAdminUrl } from "./componentSnapshots";
import { buildComponentThumbnailAdminUrlWhenStored } from "./componentThumbnails";

export interface ComponentPreviewInventoryFields {
  snapshotUrl: string;
  thumbnailUrl?: string;
}

export function enrichComponentWithPreviewUrls(
  component: Pick<ComponentDSL, "id" | "updatedAt">,
  styleRevision: string | null,
  storedThumbnailKeys: ReadonlySet<string> = new Set(),
): ComponentPreviewInventoryFields {
  return {
    snapshotUrl: buildComponentSnapshotAdminUrl(
      component.id,
      component.updatedAt ?? null,
      styleRevision,
    ),
    thumbnailUrl: buildComponentThumbnailAdminUrlWhenStored(
      storedThumbnailKeys,
      component.id,
      component.updatedAt ?? null,
      styleRevision,
    ),
  };
}

export function enrichComponentsWithPreviewUrls<
  T extends Pick<ComponentDSL, "id" | "updatedAt">,
>(
  components: readonly T[],
  styleRevision: string | null,
  storedThumbnailKeys: ReadonlySet<string> = new Set(),
): Array<T & ComponentPreviewInventoryFields> {
  return components.map((component) => ({
    ...component,
    ...enrichComponentWithPreviewUrls(
      component,
      styleRevision,
      storedThumbnailKeys,
    ),
  }));
}
