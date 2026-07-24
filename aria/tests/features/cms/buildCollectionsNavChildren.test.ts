import { describe, expect, it } from "vitest";
import {
  buildCollectionsNavChildren,
  isCollectionsNavChildActive,
} from "../../../admin/features/CMS/lib/buildCollectionsNavChildren";
import type { CollectionSummary } from "../../../admin/features/CMS/composables/useCollectionsList";

function collection(
  overrides: Partial<CollectionSummary> & Pick<CollectionSummary, "name" | "label">,
): CollectionSummary {
  return {
    id: overrides.id ?? overrides.name,
    name: overrides.name,
    label: overrides.label,
    kind: overrides.kind ?? "content",
    iconName: overrides.iconName ?? null,
    showInSidebar: overrides.showInSidebar ?? true,
    itemCount: overrides.itemCount ?? 0,
    createdAt: overrides.createdAt ?? "2026-06-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-28T00:00:00.000Z",
  };
}

describe("buildCollectionsNavChildren", () => {
  it("returns all collections before kind-ordered collection links", () => {
    const children = buildCollectionsNavChildren([
      collection({ name: "tags", label: "Tags", kind: "tags" }),
      collection({ name: "services", label: "Services", kind: "data" }),
      collection({ name: "nav", label: "Nav", kind: "config" }),
      collection({ name: "blog", label: "Blog", iconName: "FileText" }),
    ]);

    expect(children[0]).toMatchObject({
      label: "All Collections",
      path: "/collections",
    });
    expect(children[1]).toMatchObject({
      label: "Blog",
      path: "/collections/blog",
      collectionName: "blog",
      kind: "content",
      iconName: "FileText",
    });
    expect(children[2]).toMatchObject({
      label: "Nav",
      path: "/collections/nav",
      collectionName: "nav",
      kind: "config",
    });
    expect(children[3]).toMatchObject({
      label: "Services",
      path: "/collections/services",
      collectionName: "services",
      kind: "data",
    });
    expect(children[4]).toMatchObject({
      label: "Tags",
      path: "/collections/tags",
      collectionName: "tags",
      kind: "tags",
    });
  });

  it("omits collections hidden from the global sidebar", () => {
    const children = buildCollectionsNavChildren([
      collection({ name: "blog", label: "Blog" }),
      collection({
        name: "faqs",
        label: "FAQs",
        kind: "data",
        showInSidebar: false,
      }),
    ]);

    expect(children.map((child) => child.label)).toEqual([
      "All Collections",
      "Blog",
    ]);
  });

  it("marks list and collection routes active", () => {
    const children = buildCollectionsNavChildren([
      collection({ name: "blog", label: "Blog" }),
    ]);

    const all = children[0];
    const blog = children[1];

    expect(isCollectionsNavChildActive(all!, "/collections")).toBe(true);
    expect(isCollectionsNavChildActive(blog!, "/collections")).toBe(false);
    expect(isCollectionsNavChildActive(blog!, "/collections/blog")).toBe(true);
    expect(isCollectionsNavChildActive(blog!, "/collections/blog/schema")).toBe(
      true,
    );
    expect(
      isCollectionsNavChildActive(blog!, "/collections/blog/settings"),
    ).toBe(true);
    expect(
      isCollectionsNavChildActive(
        blog!,
        "/collections/blog/entries/my-entry",
      ),
    ).toBe(true);
    expect(
      isCollectionsNavChildActive(blog!, "/collections/services"),
    ).toBe(false);
  });
});
