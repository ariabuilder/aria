import { beforeEach, describe, expect, it, vi } from "vitest";

const hideAriaPreloaderMock = vi.hoisted(() => vi.fn());

describe("useAppLoading", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal("window", {
      ...globalThis.window,
      hideAriaPreloader: hideAriaPreloaderMock,
    });

    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    useAppLoading().reset();
  });

  it("hides the preloader when the shell is ready without waiting for builder data", async () => {
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    const loading = useAppLoading();

    loading.setStudioReady(true);

    expect(hideAriaPreloaderMock).toHaveBeenCalledTimes(1);
    expect(loading.isFullyLoaded.value).toBe(false);
    expect(loading.isBuilderDataLoaded.value).toBe(false);
    expect(loading.currentPhase.value).toBe("hydrating-ui");
  });

  it("marks boot complete only when builder data, UI, and shell are ready", async () => {
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    const loading = useAppLoading();

    loading.setStudioReady(true);
    loading.setBuilderDataLoaded(true);
    loading.setUIReady(true);

    expect(loading.isFullyLoaded.value).toBe(true);
    expect(loading.currentPhase.value).toBe("ready");
    expect(hideAriaPreloaderMock).toHaveBeenCalledTimes(1);
  });

  it("does not hide the preloader twice when shell ready fires after builder data", async () => {
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    const loading = useAppLoading();

    loading.setBuilderDataLoaded(true);
    loading.setUIReady(true);
    loading.setStudioReady(true);

    expect(hideAriaPreloaderMock).toHaveBeenCalledTimes(1);
    expect(loading.isFullyLoaded.value).toBe(true);
  });

  it("keeps isFullyLoaded false when loadError is set", async () => {
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    const loading = useAppLoading();

    loading.setStudioReady(true);
    loading.setBuilderDataLoaded(true);
    loading.setUIReady(true);
    loading.setError("init failed");

    expect(loading.isFullyLoaded.value).toBe(false);
    expect(loading.currentPhase.value).toBe("error");
  });
});
