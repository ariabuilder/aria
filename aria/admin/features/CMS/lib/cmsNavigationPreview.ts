import { readonly, ref } from "vue";
import { z } from "zod";
import { COLLECTION_KINDS, ENTRY_STATUSES } from "../../../../lib/cms/constants";

const CmsCollectionNavigationPreviewSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    label: z.string(),
    kind: z.enum(COLLECTION_KINDS),
    iconClass: z.string().trim().min(1),
    itemCount: z.int().nonnegative(),
  })
  .strict();

const CmsEntryNavigationPreviewSchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    collectionName: z.string().trim().min(1),
    title: z.string(),
    slug: z.string().trim().min(1),
    status: z.enum(ENTRY_STATUSES),
  })
  .strict();

export type CmsCollectionNavigationPreview = z.infer<
  typeof CmsCollectionNavigationPreviewSchema
>;

export type CmsEntryNavigationPreview = z.infer<
  typeof CmsEntryNavigationPreviewSchema
>;

const activeCollectionPreview = ref<CmsCollectionNavigationPreview | null>(null);
const activeEntryPreview = ref<CmsEntryNavigationPreview | null>(null);

export function setCmsCollectionNavigationPreview(
  preview: CmsCollectionNavigationPreview,
): void {
  activeCollectionPreview.value =
    CmsCollectionNavigationPreviewSchema.parse(preview);
}

export function setCmsEntryNavigationPreview(
  preview: CmsEntryNavigationPreview,
): void {
  activeEntryPreview.value = CmsEntryNavigationPreviewSchema.parse(preview);
}

export function clearCmsEntryNavigationPreview(): void {
  activeEntryPreview.value = null;
}

export function useCmsNavigationPreview() {
  return {
    activeCollectionPreview: readonly(activeCollectionPreview),
    activeEntryPreview: readonly(activeEntryPreview),
  };
}
