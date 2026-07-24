import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueThumbnail = vi.hoisted(() => vi.fn());

vi.mock("astro:actions", () => ({
  actions: { pages: { enqueueThumbnail } },
}));

describe("enqueuePageThumbnailJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues a validated thumbnail job through the Astro Action", async () => {
    enqueueThumbnail.mockResolvedValue({
      data: { success: true, status: "queued", pageId: "page-home", stage: "draft" },
      error: undefined,
    });
    const { enqueuePageThumbnailJob } =
      await import("../../admin/features/Studio/pages/composables/pageThumbnailJobs");

    await expect(
      enqueuePageThumbnailJob({ pageId: "page-home", pageSlug: "home", stage: "draft" }),
    ).resolves.toBe("queued");
    expect(enqueueThumbnail).toHaveBeenCalledWith({
      pageId: "page-home",
      pageSlug: "home",
      stage: "draft",
      force: false,
    });
  });
});
