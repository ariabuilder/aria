import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { RUNTIME_SAFE_CONTAINER_SHORTCUT } from "../../lib/styles/unoRuntimeDefaults";
import { useUnoConfig } from "../../admin/features/Core/composables/useUnoConfig";
import {
  designTokensState,
  useDesignTokens,
} from "../../admin/features/Design/composables/useDesignTokens";

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    unoBreakpoints: ref({
      sm: "640px",
      lg: "1024px",
    }),
  }),
}));

vi.mock("../../admin/features/Core/composables/useStageSignalBridge", () => ({
  useStageSignalBridge: () => ({
    signalUnoConfigChanged: vi.fn(),
  }),
}));

describe("useUnoConfig", () => {
  const { resetToDefaults } = useDesignTokens();

  beforeEach(() => {
    resetToDefaults();
  });

  it("preserves palette colors for primary-like utility names", () => {
    const { unoRuntimeConfig } = useUnoConfig();
    const runtimeColors = unoRuntimeConfig.value.theme.colors as Record<
      string,
      unknown
    >;

    expect(runtimeColors.primary).toEqual(
      expect.objectContaining({
        500: expect.any(String),
      }),
    );
    expect(runtimeColors.secondary).toEqual(
      expect.objectContaining({
        500: expect.any(String),
      }),
    );
    expect(runtimeColors["primary-foreground"]).toBe(
      "hsl(var(--primary-foreground) / <alpha-value>)",
    );
    expect(runtimeColors.background).toBe(
      "hsl(var(--background) / <alpha-value>)",
    );
    expect(unoRuntimeConfig.value.shortcuts).toEqual(
      expect.objectContaining({
        "btn-primary": expect.any(String),
        "btn-secondary": expect.any(String),
        "btn-muted": expect.any(String),
        "btn-destructive": expect.any(String),
      }),
    );
    expect(unoRuntimeConfig.value.shortcuts).not.toHaveProperty("btn-outline");
    expect(unoRuntimeConfig.value.shortcuts).not.toHaveProperty("btn-ghost");
  });

  it("emits semantic background aliases for the stage iframe", () => {
    designTokensState.semanticColors.background = "#000000";
    designTokensState.semanticColors.foreground = "#f5f5f5";

    const { cssVariables } = useUnoConfig();

    expect(cssVariables.value).toContain("--background: 0 0.0% 0.0%;");
    expect(cssVariables.value).toContain("--foreground: 0 0.0% 96.1%;");
    expect(cssVariables.value).toContain("--color-background: #000000;");
    expect(cssVariables.value).toContain("--color-foreground: #f5f5f5;");
  });

  it("uses runtime-safe container shortcut after design token merge", () => {
    const { unoRuntimeConfig } = useUnoConfig();

    expect(unoRuntimeConfig.value.shortcuts?.container).toBe(
      RUNTIME_SAFE_CONTAINER_SHORTCUT,
    );
    expect(unoRuntimeConfig.value.shortcuts?.container).not.toContain("sm:px-6");
    expect(unoRuntimeConfig.value.shortcuts?.container).not.toContain("lg:px-8");
  });

  it("safelists variant utilities from design shortcuts", () => {
    const { unoRuntimeConfig } = useUnoConfig();

    expect(unoRuntimeConfig.value.safelist).toEqual(
      expect.arrayContaining(["lg:text-5xl", "sm:px-6", "lg:px-8"]),
    );
  });

  it("passes canonical breakpoints under theme.breakpoint for preset-wind", () => {
    const { unoRuntimeConfig } = useUnoConfig();

    expect(unoRuntimeConfig.value.theme.breakpoint).toEqual({
      sm: "640px",
      lg: "1024px",
    });
    expect(unoRuntimeConfig.value.theme).not.toHaveProperty("breakpoints");
  });

  it("does not synthesize white stage tokens from unresolved placeholder semantics", () => {
    const { cssVariables } = useUnoConfig();

    expect(cssVariables.value).not.toContain("--background: 0 0% 100%;");
    expect(cssVariables.value).not.toContain("--foreground: 240 10% 3.9%;");
    expect(cssVariables.value).not.toContain(
      "--color-background: hsl(var(--background));",
    );
    expect(cssVariables.value).not.toContain(
      "--color-foreground: hsl(var(--foreground));",
    );
  });

  it("emits design-system semantic colors and shades for the stage iframe", () => {
    designTokensState.colors.success = "#16a34a";
    designTokensState.colors.warning = "#f59e0b";
    designTokensState.colors.error = "#dc2626";
    designTokensState.colors.info = "#2563eb";

    const { cssVariables } = useUnoConfig();

    expect(cssVariables.value).toContain("--success: #16a34a;");
    expect(cssVariables.value).toContain("--success-500:");
    expect(cssVariables.value).toContain("--destructive: #dc2626;");
    expect(cssVariables.value).toContain("--destructive-500:");
    expect(cssVariables.value).toMatch(
      /:root \{[\s\S]*--destructive: #dc2626;/,
    );
  });
});
