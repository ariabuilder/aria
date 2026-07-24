import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  collectionToSummary,
  useCollectionsList,
} from "../../../admin/features/CMS/composables/useCollectionsList";
import { buildCollectionsNavChildren } from "../../../admin/features/CMS/lib/buildCollectionsNavChildren";
import { AriaCollectionSchema } from "../../../lib/cms/schemas";

type AriaCollection = z.infer<typeof AriaCollectionSchema>;

function createCollection(
  overrides: Partial<AriaCollection> & { id: string; name: string },
): AriaCollection {
  return AriaCollectionSchema.parse({
    id: overrides.id,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    kind: overrides.kind ?? "content",
    schema: {
      id: overrides.id,
      label: overrides.label ?? overrides.name,
      kind: overrides.kind ?? "content",
      fields: [],
      icon: overrides.schema?.icon ?? "i-hugeicons:file-01",
      navigation: {
        showInSidebar:
          overrides.schema?.navigation?.showInSidebar ?? true,
      },
      version: 1,
    },
    scope: overrides.scope ?? "global",
    urlPattern: overrides.urlPattern ?? null,
    templatePageId: overrides.templatePageId ?? null,
    listPageId: overrides.listPageId ?? null,
    supports: overrides.supports ?? [],
    createdAt: overrides.createdAt ?? "2026-06-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-28T00:00:00.000Z",
  });
}

describe("useCollectionsList", () => {
  it("maps collections to typed sidebar-aware summaries", () => {
    const collection = createCollection({
      id: "collection-summary-posts",
      name: "summary-posts",
      label: "Summary Posts",
      schema: {
        id: "collection-summary-posts",
        label: "Summary Posts",
        kind: "content",
        fields: [],
        icon: "i-hugeicons:book-open",
        navigation: { showInSidebar: false },
        version: 1,
      },
    });

    expect(collectionToSummary(collection)).toMatchObject({
      id: "collection-summary-posts",
      name: "summary-posts",
      label: "Summary Posts",
      iconName: "i-hugeicons:book-open",
      showInSidebar: false,
      itemCount: 0,
    });
  });

  it("updates the shared collection cache immediately after a settings save", () => {
    const list = useCollectionsList();
    const visible = createCollection({
      id: "collection-sidebar-regression",
      name: "sidebar-regression",
      label: "Sidebar Regression",
    });

    list.upsertCollectionSummary(visible);
    expect(
      buildCollectionsNavChildren(list.collections.value).some(
        (child) => child.path === "/collections/sidebar-regression",
      ),
    ).toBe(true);

    const hidden = createCollection({
      ...visible,
      schema: {
        ...visible.schema,
        navigation: { showInSidebar: false },
      },
      updatedAt: "2026-06-28T00:01:00.000Z",
    });

    list.upsertCollectionSummary(hidden);
    expect(
      buildCollectionsNavChildren(list.collections.value).some(
        (child) => child.path === "/collections/sidebar-regression",
      ),
    ).toBe(false);

    const summary = list.collections.value.find(
      (collection) => collection.id === "collection-sidebar-regression",
    );
    expect(summary).toMatchObject({
      label: "Sidebar Regression",
      showInSidebar: false,
      updatedAt: "2026-06-28T00:01:00.000Z",
    });
  });
});
