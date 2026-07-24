import type { PageCmsRoutingImpact } from "../../../../../lib/pages/cmsTemplatePolicy";

export type PageDeleteRoutingUnbindPatch = {
  collectionId: string;
  patch: {
    templatePageId?: null;
    listPageId?: null;
  };
};

export function buildPageDeleteRoutingUnbindPatches(
  impact: PageCmsRoutingImpact,
): PageDeleteRoutingUnbindPatch[] {
  const patches = new Map<string, PageDeleteRoutingUnbindPatch["patch"]>();

  for (const collection of impact.templateCollections) {
    patches.set(collection.id, {
      ...patches.get(collection.id),
      templatePageId: null,
    });
  }

  for (const collection of impact.listCollections) {
    patches.set(collection.id, {
      ...patches.get(collection.id),
      listPageId: null,
    });
  }

  return [...patches.entries()].map(([collectionId, patch]) => ({
    collectionId,
    patch,
  }));
}
