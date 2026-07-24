import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";

const getPageMediaMock = vi.fn();

vi.mock("astro:actions", () => ({
  actions: {
    pages: {
      getPageMedia: (...args: unknown[]) => getPageMediaMock(...args),
    },
  },
}));

vi.mock("@/features/Studio/core/composables/useErrorBoundary", () => ({
  useErrorBoundary: () => ({
    handleError: vi.fn(),
    clearError: vi.fn(),
    currentError: ref(null),
  }),
}));

vi.mock("@/lib/actionErrors", () => ({
  handleActionResultForbidden: () => false,
}));

import { usePageDetailMedia } from "@/features/Studio/pages/composables/usePageDetailMedia";

describe("usePageDetailMedia", () => {
  beforeEach(() => {
    getPageMediaMock.mockReset();
  });

  it("skips duplicate fetch for the same slug", async () => {
    getPageMediaMock.mockResolvedValue({
      data: {
        assets: [],
        external: [],
        missing: [],
        missingComponents: [],
      },
      error: undefined,
    });

    const { loadPageMedia, hasLoadedForSlug } = usePageDetailMedia();

    await loadPageMedia("home");
    await loadPageMedia("home");

    expect(getPageMediaMock).toHaveBeenCalledTimes(1);
    expect(hasLoadedForSlug.value).toBe("home");
  });

  it("forces refetch when force option is set", async () => {
    getPageMediaMock.mockResolvedValue({
      data: {
        assets: [],
        external: [],
        missing: [],
        missingComponents: [],
      },
      error: undefined,
    });

    const { loadPageMedia } = usePageDetailMedia();

    await loadPageMedia("home");
    await loadPageMedia("home", { force: true });

    expect(getPageMediaMock).toHaveBeenCalledTimes(2);
  });

  it("reset clears loaded slug", async () => {
    getPageMediaMock.mockResolvedValue({
      data: {
        assets: [],
        external: [],
        missing: [],
        missingComponents: [],
      },
      error: undefined,
    });

    const { loadPageMedia, reset, hasLoadedForSlug, media } = usePageDetailMedia();

    await loadPageMedia("home");
    reset();

    expect(hasLoadedForSlug.value).toBeNull();
    expect(media.value).toBeNull();
  });
});
