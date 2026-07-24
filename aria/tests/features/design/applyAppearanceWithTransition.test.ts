import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("applyAppearanceWithTransition", () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.className = "";
    (document as Document & { startViewTransition?: unknown }).startViewTransition =
      undefined as unknown as typeof document.startViewTransition;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies instantly when reduced motion is preferred", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });

    const commit = vi.fn();
    const { applyAppearanceWithTransition } = await import(
      "../../../admin/features/Design/composables/applyAppearanceWithTransition"
    );

    await applyAppearanceWithTransition(commit, { animate: true });

    expect(commit).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("the-premium-fade-transition")).toBe(false);
  });

  it("cleans up transition class when finished rejects", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });

    document.startViewTransition = vi.fn(() => ({
      finished: Promise.reject(new Error("transition failed")),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    })) as unknown as typeof document.startViewTransition;

    const commit = vi.fn();
    const { applyAppearanceWithTransition } = await import(
      "../../../admin/features/Design/composables/applyAppearanceWithTransition"
    );

    await expect(
      applyAppearanceWithTransition(commit, { animate: true }),
    ).rejects.toThrow("transition failed");

    expect(document.documentElement.classList.contains("the-premium-fade-transition")).toBe(false);
  });

  it("commits instantly when activeViewTransition is set", async () => {
    Object.defineProperty(document, "activeViewTransition", {
      configurable: true,
      value: {},
    });

    const commit = vi.fn();
    const { applyAppearanceWithTransition } = await import(
      "../../../admin/features/Design/composables/applyAppearanceWithTransition"
    );

    await applyAppearanceWithTransition(commit, { animate: true });

    expect(commit).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("the-premium-fade-transition")).toBe(false);
  });
});
