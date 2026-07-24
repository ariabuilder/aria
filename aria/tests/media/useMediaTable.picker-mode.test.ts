import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { useMediaTable } from "../../admin/features/Studio/media/composables/useMediaTable";
import type { MediaAsset } from "../../admin/features/Studio/media/types/media";

const sampleAssets: MediaAsset[] = [
  {
    id: "image-1",
    name: "hero.jpg",
    type: "image",
    url: "/uploads/hero.jpg",
    size: 480_000,
    uploadedAt: "2026-04-05T09:00:00.000Z",
  },
];

describe("useMediaTable picker mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes data columns only and disables row selection", () => {
    const data = ref(sampleAssets);
    const { table, rowSelection } = useMediaTable({
      mode: "picker",
      data,
    });

    const columnIds = table.getAllLeafColumns().map((column) => column.id);
    expect(columnIds).toEqual(["cover", "name", "type", "size", "uploaded"]);
    expect(table.options.enableRowSelection).toBe(false);
    expect(rowSelection.value).toEqual({});
  });

  it("does not reuse saved library sorting for picker rows", () => {
    localStorage.setItem(
      "aria:media:table-sorting",
      JSON.stringify([{ id: "folder", desc: false }]),
    );

    const data = ref(sampleAssets);
    const { table } = useMediaTable({
      mode: "picker",
      data,
    });

    expect(table.getState().sorting).toEqual([]);
    expect(table.getRowModel().rows.map((row) => row.original.id)).toEqual([
      "image-1",
    ]);
  });
});

describe("useMediaTable library mode", () => {
  it("includes select column and no actions column", () => {
    const data = ref(sampleAssets);
    const { table } = useMediaTable({
      data,
    });

    const columnIds = table.getAllLeafColumns().map((column) => column.id);
    expect(columnIds).toEqual([
      "select",
      "cover",
      "name",
      "type",
      "crops",
      "size",
      "uploaded",
    ]);
    expect(table.options.enableRowSelection).toBe(true);
  });
});
