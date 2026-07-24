import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { useCmsCollectionsTable } from "../../../admin/features/CMS/composables/useCmsCollectionsTable";
import { useCmsEntryTable } from "../../../admin/features/CMS/composables/useCmsEntryTable";
import type { CollectionSummary } from "../../../admin/features/CMS/composables/useCollectionsList";
import type { CmsEntryRow } from "../../../admin/features/CMS/lib/entryRow";
import type { FieldSchema } from "../../../lib/cms/schemas";

function createCollection(
  partial: Partial<CollectionSummary> & { id: string },
): CollectionSummary {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    label: partial.label ?? partial.name ?? partial.id,
    kind: partial.kind ?? "content",
    iconName: partial.iconName ?? null,
    showInSidebar: partial.showInSidebar ?? true,
    itemCount: partial.itemCount ?? 0,
    createdAt: partial.createdAt ?? "2026-06-26T12:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-06-26T12:00:00.000Z",
  };
}

function createEntry(partial: Partial<CmsEntryRow> & { id: string }): CmsEntryRow {
  return {
    id: partial.id,
    collectionId: partial.collectionId ?? "blog",
    title: partial.title ?? "Test Entry",
    slug: partial.slug ?? partial.id,
    status: partial.status ?? "draft",
    version: partial.version ?? "1",
    locale: partial.locale ?? "en",
    frontmatter: partial.frontmatter ?? {},
    updatedAt: partial.updatedAt ?? "2026-06-26T12:00:00.000Z",
    publishedAt: partial.publishedAt ?? null,
    createdAt: partial.createdAt ?? "2026-06-26T12:00:00.000Z",
  };
}

function createCollectionsHarness() {
  const data = ref<CollectionSummary[]>([
    createCollection({ id: "blog", name: "blog", label: "Blog" }),
  ]);

  return useCmsCollectionsTable({
    data,
    getCollectionIconClass: () => "i-hugeicons:leaf-01",
  });
}

function createEntriesHarness(
  options: { supportsCover?: boolean; fields?: FieldSchema[] } = {},
) {
  const data = ref<CmsEntryRow[]>([
    createEntry({
      id: "entry-1",
      title: "Hello",
      frontmatter: { feature_icon: "i-hugeicons:star" },
    }),
  ]);

  return useCmsEntryTable({
    data,
    fields: ref(options.fields ?? []),
    supportsCover: ref(options.supportsCover ?? true),
  });
}

describe("CMS TanStack tables", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("forces the collection label column visible from persisted state", () => {
    window.localStorage.setItem(
      "aria:cms:collections:table-columns",
      JSON.stringify({ label: false, kind: false }),
    );

    const { table } = createCollectionsHarness();

    expect(table.getColumn("label")?.getIsVisible()).toBe(true);
    expect(table.getColumn("label")?.getCanHide()).toBe(false);
    expect(
      JSON.parse(
        window.localStorage.getItem("aria:cms:collections:table-columns") ??
          "{}",
      ),
    ).toMatchObject({ label: true, kind: false });
  });

  it("keeps the collection label column visible when visibility is changed", () => {
    const { table } = createCollectionsHarness();

    table.setColumnVisibility({ label: false, itemCount: false });

    expect(table.getColumn("label")?.getIsVisible()).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem("aria:cms:collections:table-columns") ??
          "{}",
      ),
    ).toMatchObject({ label: true, itemCount: false });
  });

  it("shows collection updated date and hides created date by default", () => {
    const { table } = createCollectionsHarness();

    expect(table.getColumn("updatedAt")?.getIsVisible()).toBe(true);
    expect(table.getColumn("createdAt")?.getIsVisible()).toBe(false);
  });

  it("forces the entry title column visible from persisted state", () => {
    window.localStorage.setItem(
      "aria:cms:entries:table-columns",
      JSON.stringify({ select: true, title: false, slug: false }),
    );

    const { table } = createEntriesHarness();

    expect(table.getColumn("title")?.getIsVisible()).toBe(true);
    expect(table.getColumn("title")?.getCanHide()).toBe(false);
    expect(
      JSON.parse(
        window.localStorage.getItem("aria:cms:entries:table-columns") ?? "{}",
      ),
    ).toMatchObject({ title: true, slug: false });
  });

  it("keeps the entry title column visible when visibility is changed", () => {
    const { table } = createEntriesHarness();

    table.setColumnVisibility({ title: false, status: false });

    expect(table.getColumn("title")?.getIsVisible()).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem("aria:cms:entries:table-columns") ?? "{}",
      ),
    ).toMatchObject({ title: true, status: false });
  });

  it("keys entry row selection by entry id", () => {
    const { table, rowSelection } = createEntriesHarness();

    rowSelection.value = { "entry-1": true };

    expect(table.getRowModel().rows[0]?.getIsSelected()).toBe(true);
  });

  it("creates columns for icon fields shown in the entry list", () => {
    const { table } = createEntriesHarness({
      fields: [
        {
          key: "feature_icon",
          label: "Feature Icon",
          type: "icon",
          showInEntryList: true,
        },
      ],
    });

    expect(table.getColumn("field:feature_icon")).toBeDefined();
    expect(table.getAllLeafColumns().map((column) => column.id)).toContain(
      "field:feature_icon",
    );
  });

  it("creates compact fixed columns for color fields shown in the entry list", () => {
    const { table } = createEntriesHarness({
      fields: [
        {
          key: "accentColor",
          label: "Accent Color",
          type: "color",
          showInEntryList: true,
        },
      ],
    });

    const column = table.getColumn("field:accentColor");

    expect(column).toBeDefined();
    expect(column?.getSize()).toBe(76);
    expect(column?.columnDef.meta).toMatchObject({
      studioTableWidthMode: "fixed",
    });
  });

  it("creates compact fixed columns for legacy color-like string fields", () => {
    const { table } = createEntriesHarness({
      fields: [
        {
          key: "backgroundColor",
          label: "Background Color",
          type: "string",
          showInEntryList: true,
        },
      ],
    });

    const column = table.getColumn("field:backgroundColor");

    expect(column).toBeDefined();
    expect(column?.getSize()).toBe(76);
    expect(column?.columnDef.meta).toMatchObject({
      studioTableWidthMode: "fixed",
    });
  });

  it("omits the entry cover column when cover is unsupported", () => {
    const { table } = createEntriesHarness({ supportsCover: false });

    expect(table.getAllLeafColumns().map((column) => column.id)).not.toContain(
      "cover",
    );
  });

  it("loads CMS tables with invalid storage payloads without throwing", () => {
    window.localStorage.setItem("aria:cms:collections:table-columns", "{bad-json");
    window.localStorage.setItem(
      "aria:cms:collections:table-sorting",
      "{\"oops\":1}",
    );
    window.localStorage.setItem("aria:cms:entries:table-columns", "{bad-json");
    window.localStorage.setItem("aria:cms:entries:table-sorting", "{\"oops\":1}");

    expect(() => createCollectionsHarness()).not.toThrow();
    expect(() => createEntriesHarness()).not.toThrow();
  });
});
