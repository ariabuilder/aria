import { z } from "zod";
import { COLLECTION_KINDS } from "../../../../lib/cms/constants";
import type { CollectionKind } from "../../../../lib/cms/constants";
import type { CollectionSummary } from "../composables/useCollectionsList";

export const CollectionsNavChildSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  collectionName: z.string().min(1).optional(),
  kind: z.enum(COLLECTION_KINDS).optional(),
  iconName: z.string().nullable().optional(),
});

export type CollectionsNavChild = z.infer<typeof CollectionsNavChildSchema>;

const COLLECTION_NAV_KIND_ORDER: readonly CollectionKind[] = [
  "content",
  "config",
  "data",
  "tags",
];

const COLLECTION_NAV_KIND_INDEX = new Map(
  COLLECTION_NAV_KIND_ORDER.map((kind, index) => [kind, index] as const),
);

export function buildCollectionsNavChildren(
  collections: readonly CollectionSummary[],
): CollectionsNavChild[] {
  const allChild: CollectionsNavChild = {
    label: "All Collections",
    path: "/collections",
  };

  const collectionChildren = collections
    .filter((collection) => collection.showInSidebar)
    .sort((a, b) => {
      const kindOrder =
        (COLLECTION_NAV_KIND_INDEX.get(a.kind) ??
          COLLECTION_NAV_KIND_ORDER.length) -
        (COLLECTION_NAV_KIND_INDEX.get(b.kind) ??
          COLLECTION_NAV_KIND_ORDER.length);
      if (kindOrder !== 0) return kindOrder;
      return a.label.localeCompare(b.label);
    })
    .map((collection) =>
      CollectionsNavChildSchema.parse({
        label: collection.label,
        path: `/collections/${collection.name}`,
        collectionName: collection.name,
        kind: collection.kind,
        iconName: collection.iconName,
      }),
    );

  return [allChild, ...collectionChildren];
}

export function isCollectionsNavChildActive(
  child: CollectionsNavChild,
  routePath: string,
): boolean {
  if (!routePath.startsWith("/collections")) {
    return false;
  }

  if (!child.collectionName) {
    return routePath === "/collections";
  }

  const collectionBasePath = `/collections/${child.collectionName}`;
  return (
    routePath === collectionBasePath ||
    routePath.startsWith(`${collectionBasePath}/`)
  );
}
