import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { useMediaTable } from "../../admin/features/Studio/media/composables/useMediaTable";
import type { MediaAsset } from "../../admin/features/Studio/media/types/media";

function createAsset(
  partial: Partial<MediaAsset> & { id: string },
): MediaAsset {
  return {
    id: partial.id,
    name: partial.name ?? `${partial.id}.png`,
    type: partial.type ?? "image",
    size: partial.size ?? 1024,
    uploadedAt: partial.uploadedAt ?? "2026-01-01T00:00:00.000Z",
    url: partial.url ?? `/${partial.id}.png`,
    mimeType: partial.mimeType ?? "image/png",
    cropCount: partial.cropCount,
  };
}

describe("useMediaTable library mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defines all library columns with thumbnail hidden by default", () => {
    const data = ref([createAsset({ id: "a" })]);
    const { table } = useMediaTable({
      data,
      grouping: {
        assignments: ref({}),
        groups: ref([]),
      },
    });

    const ids = table.getAllLeafColumns().map((column) => column.id);
    expect(ids).toEqual([
      "select",
      "cover",
      "name",
      "type",
      "folder",
      "crops",
      "size",
      "uploaded",
    ]);
    expect(table.getVisibleLeafColumns().map((column) => column.id)).toEqual([
      "select",
      "name",
      "type",
      "folder",
      "size",
      "uploaded",
    ]);
    expect(table.getColumn("cover")?.getIsVisible()).toBe(false);
    expect(table.getColumn("crops")?.getIsVisible()).toBe(false);
  });

  it("exposes the saved crop count as a togglable sortable column", () => {
    const data = ref([
      createAsset({ id: "none", cropCount: 0 }),
      createAsset({ id: "variants", cropCount: 3 }),
    ]);
    const { table } = useMediaTable({ data });

    table.getColumn("crops")?.toggleVisibility(true);
    table.getColumn("crops")?.toggleSorting(true);

    expect(table.getColumn("crops")?.getIsVisible()).toBe(true);
    expect(
      table.getRowModel().rows.map((row) => row.original.cropCount),
    ).toEqual([3, 0]);
  });

  it("keeps name visible when toggling column visibility", () => {
    const data = ref([createAsset({ id: "a" })]);
    const { table } = useMediaTable({
      data,
      grouping: {
        assignments: ref({}),
        groups: ref([]),
      },
    });

    table.setColumnVisibility({ cover: false, type: false, size: false });
    expect(table.getColumn("name")?.getIsVisible()).toBe(true);
    expect(table.getColumn("type")?.getIsVisible()).toBe(false);

    table.setColumnOrder([
      "select",
      "cover",
      "folder",
      "name",
      "uploaded",
      "type",
      "size",
    ]);
    expect(table.getVisibleLeafColumns().map((column) => column.id)).toEqual([
      "select",
      "folder",
      "name",
      "uploaded",
    ]);
  });

  it("restores column visibility from localStorage", () => {
    window.localStorage.setItem(
      "aria:media:table-columns",
      JSON.stringify({
        cover: true,
        type: false,
        size: false,
        uploaded: false,
      }),
    );

    const data = ref([createAsset({ id: "a" })]);
    const { table } = useMediaTable({
      data,
      grouping: {
        assignments: ref({}),
        groups: ref([]),
      },
    });

    expect(table.getColumn("cover")?.getIsVisible()).toBe(true);
    expect(table.getColumn("type")?.getIsVisible()).toBe(false);
    expect(table.getVisibleLeafColumns().map((column) => column.id)).toEqual([
      "select",
      "cover",
      "name",
      "folder",
    ]);
  });
});
