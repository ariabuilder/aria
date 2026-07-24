import { describe, expect, it, vi } from "vitest";
import { THEME_OPTIONS } from "../../../../admin/features/Design/themes/registry";
import { COLOR_SCHEME_OPTIONS } from "../../../../admin/features/Design/themes/colorSchemeOptions";
import { buildAppearancePaletteItems } from "../../../../admin/features/Studio/search/schemas/appearancePaletteItems";

describe("buildAppearancePaletteItems", () => {
  it("returns settings shortcut plus all themes and color schemes", () => {
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "system" },
      isReady: true,
      onSetTheme: vi.fn(),
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    expect(items).toHaveLength(1 + THEME_OPTIONS.length + COLOR_SCHEME_OPTIONS.length);
    expect(items.some((item) => item.id === "appearance-settings")).toBe(true);
    expect(items.some((item) => item.id === "appearance-theme-cloudflare")).toBe(
      true,
    );
    expect(items.some((item) => item.id === "appearance-scheme-dark")).toBe(true);
  });

  it("includes theme and appearance terms in theme keywords", () => {
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "light" },
      isReady: true,
      onSetTheme: vi.fn(),
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    const astro = items.find((item) => item.id === "appearance-theme-astro");
    expect(astro?.keywords).toContain("theme");
    expect(astro?.keywords).toContain("appearance");
    expect(astro?.keywords).toContain("astro");
  });

  it("marks the active theme and color scheme as Current", () => {
    const items = buildAppearancePaletteItems({
      current: { themeId: "cloudflare", colorScheme: "dark" },
      isReady: true,
      onSetTheme: vi.fn(),
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    expect(
      items.find((item) => item.id === "appearance-theme-cloudflare")?.description,
    ).toBe("Current");
    expect(
      items.find((item) => item.id === "appearance-scheme-dark")?.description,
    ).toBe("Current");
  });

  it("closes before opening settings", () => {
    const onClose = vi.fn();
    const onOpenSettings = vi.fn();
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "system" },
      isReady: true,
      onSetTheme: vi.fn(),
      onSetColorScheme: vi.fn(),
      onOpenSettings,
      onClose,
    });

    items.find((item) => item.id === "appearance-settings")?.action();

    expect(onClose).toHaveBeenCalledBefore(onOpenSettings);
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("closes before setting theme and skips when unchanged", () => {
    const onClose = vi.fn();
    const onSetTheme = vi.fn();
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "system" },
      isReady: true,
      onSetTheme,
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose,
    });

    items.find((item) => item.id === "appearance-theme-aria")?.action();

    expect(onClose).toHaveBeenCalled();
    expect(onSetTheme).not.toHaveBeenCalled();
  });

  it("closes before setting a new theme", () => {
    const onClose = vi.fn();
    const onSetTheme = vi.fn();
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "system" },
      isReady: true,
      onSetTheme,
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose,
    });

    items.find((item) => item.id === "appearance-theme-astro")?.action();

    expect(onClose).toHaveBeenCalledBefore(onSetTheme);
    expect(onSetTheme).toHaveBeenCalledWith("astro");
  });

  it("does not run handlers when not ready", () => {
    const onClose = vi.fn();
    const onSetTheme = vi.fn();
    const items = buildAppearancePaletteItems({
      current: { themeId: "aria", colorScheme: "system" },
      isReady: false,
      onSetTheme,
      onSetColorScheme: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose,
    });

    items.find((item) => item.id === "appearance-theme-astro")?.action();

    expect(onClose).not.toHaveBeenCalled();
    expect(onSetTheme).not.toHaveBeenCalled();
  });
});
