import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const { executeMock, updateSeoMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  updateSeoMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    pages: {
      updateSeo: updateSeoMock,
    },
  },
}));

describe("useSeoHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;

      try {
        await operation.redo();
        return { success: true, error: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error("Unknown error"),
        };
      }
    });

    updateSeoMock.mockResolvedValue({
      data: {
        success: true,
      },
    });
  });

  it("records SEO updates through history and supports undo", async () => {
    const { useSeoHistory } =
      await import("../../admin/features/Studio/pages/composables/useSeoHistory");

    const applySeo = vi.fn(async () => {});
    const { recordSeoUpdate } = useSeoHistory();

    const result = await recordSeoUpdate({
      slug: "landing",
      previousSeo: {
        title: "Old Title",
        keywords: ["old"],
      },
      nextSeo: {
        title: "New Title",
        keywords: ["new", "launch"],
        noIndex: true,
      },
      applySeo,
    });

    expect(result).toEqual({ success: true });
    expect(updateSeoMock).toHaveBeenCalledTimes(1);
    expect(updateSeoMock).toHaveBeenCalledWith({
      slug: "landing",
      seo: expect.objectContaining({
        title: "New Title",
        keywords: ["new", "launch"],
        noindex: true,
      }),
    });
    expect(applySeo).toHaveBeenCalledTimes(1);
    expect(applySeo).toHaveBeenCalledWith({
      title: "New Title",
      description: undefined,
      keywords: ["new", "launch"],
      ogImage: undefined,
      canonical: undefined,
      noIndex: true,
      noFollow: false,
    });

    await lastOperation?.undo();

    expect(updateSeoMock).toHaveBeenCalledTimes(2);
    expect(updateSeoMock).toHaveBeenLastCalledWith({
      slug: "landing",
      seo: expect.objectContaining({
        title: "Old Title",
        keywords: ["old"],
      }),
    });
    expect(applySeo).toHaveBeenCalledTimes(2);
    expect(applySeo).toHaveBeenLastCalledWith({
      title: "Old Title",
      description: undefined,
      keywords: ["old"],
      ogImage: undefined,
      canonical: undefined,
      noIndex: false,
      noFollow: false,
    });
  });

  it("rejects invalid SEO history input before executing history", async () => {
    const { useSeoHistory } =
      await import("../../admin/features/Studio/pages/composables/useSeoHistory");

    const applySeo = vi.fn(async () => {});
    const { recordSeoUpdate } = useSeoHistory();

    const result = await recordSeoUpdate({
      slug: "",
      previousSeo: {},
      nextSeo: {},
      applySeo,
    });

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(updateSeoMock).not.toHaveBeenCalled();
    expect(applySeo).not.toHaveBeenCalled();
  });

  it("surfaces action failures through the history helper result", async () => {
    const { useSeoHistory } =
      await import("../../admin/features/Studio/pages/composables/useSeoHistory");

    updateSeoMock.mockResolvedValueOnce({
      data: {
        success: false,
        error: {
          message: "Storage offline",
        },
      },
    });

    const applySeo = vi.fn(async () => {});
    const { recordSeoUpdate } = useSeoHistory();

    const result = await recordSeoUpdate({
      slug: "landing",
      previousSeo: {
        title: "Old Title",
      },
      nextSeo: {
        title: "New Title",
      },
      applySeo,
    });

    expect(result).toEqual({
      success: false,
      error: "Storage offline",
    });
    expect(applySeo).not.toHaveBeenCalled();
  });
});
