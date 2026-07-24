import type { AriaCollection } from "../../../../lib/cms/schemas";
import { isCoverImageField } from "../../../../lib/cms/systemFields";

export function collectionSupportsBody(
  collection: AriaCollection | null | undefined,
): boolean {
  return collection?.supports.includes("body") === true;
}

export function collectionSupportsCover(
  collection: AriaCollection | null | undefined,
): boolean {
  return (
    collection?.supports.includes("cover") === true ||
    collection?.schema.fields.some(isCoverImageField) === true
  );
}

export function collectionSupportsRevisions(
  collection: AriaCollection | null | undefined,
): boolean {
  return collection?.supports.includes("revisions") === true;
}

export function collectionSupportsScheduling(
  collection: AriaCollection | null | undefined,
): boolean {
  return collection?.supports.includes("scheduling") === true;
}
