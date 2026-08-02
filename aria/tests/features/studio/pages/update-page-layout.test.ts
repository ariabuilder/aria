import { beforeEach, describe, expect, it, vi } from "vitest";

import { updatePageLayout } from "@/features/Studio/pages/utils/updatePageLayout";
import type { PageDSL } from "@/lib/types/nodes";

const { getItemMock, updateItemMock, toastErrorMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  updateItemMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    getItem: getItemMock,
    updateItem: updateItemMock,
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

function page(): PageDSL {
  return {
    id: "home",
    slug: "index",
    title: "Home",
    status: "published",
    version: "v1",
    layout: "old-layout",
    nodes: [],
  };
}

describe("updatePageLayout", () => {
  beforeEach(() => {
    getItemMock.mockReset();
    updateItemMock.mockReset();
    toastErrorMock.mockReset();
    getItemMock.mockResolvedValue({ data: { slots: [] }, error: null });
  });

  it("prepares the layout change locally without writing a page revision", async () => {
    const result = await updatePageLayout({
      page: page(),
      nextLayoutSlug: "new-layout",
      canEdit: true,
    });

    expect(updateItemMock).not.toHaveBeenCalled();
    expect(result.nextPage).toEqual(
      expect.objectContaining({
        layout: "new-layout",
        version: "v1",
      }),
    );
  });

  it("keeps layout edits local even before a revision token is available", async () => {
    const stalePage = page();
    delete stalePage.version;

    const result = await updatePageLayout({
      page: stalePage,
      nextLayoutSlug: "new-layout",
      canEdit: true,
    });

    expect(result.success).toBe(true);
    expect(result.nextPage?.layout).toBe("new-layout");
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
