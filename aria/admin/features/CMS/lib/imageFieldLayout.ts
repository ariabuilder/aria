import type { FieldSchema } from "../../../../lib/cms/schemas";
import { isCoverImageField } from "../../../../lib/cms/systemFields";

export type CmsImageFieldLayout = "cover" | "compact";

export function cmsImageFieldLayout(field: FieldSchema): CmsImageFieldLayout {
  return isCoverImageField(field) ? "cover" : "compact";
}
