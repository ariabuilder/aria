import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";

import {
  STAGE_SCREEN_READER_UTILITY_CSS,
  useIframeSetup,
  type IframeRenderStyles,
} from "../../admin/features/Stage/composables/useIframeSetup";

function createRenderStyles(
  overrides: Partial<IframeRenderStyles> = {},
): IframeRenderStyles {
  return {
    baseCSS: ":root{--color: red;}",
    customClassesCSS: "",
    customFontsCSS: "",
    globalCSS: ":root{--color: red;}",
    globalCSSHash: "global-hash",
    lastCompiled: "2026-04-06T00:00:00.000Z",
    styleRevision: "style-1",
    utilityCSS: ".bg-primary{background:red}",
    utilityCSSHash: "utility-hash",
    utilityEngine: "custom",
    baseCSSHash: "base-hash",
    ...overrides,
  };
}

describe("useIframeSetup", () => {
  it("injects shared theme variables in custom mode without Uno runtime", () => {
    const siteSettings = ref({ utilityEngine: "custom" as const });
    const renderStyles = ref(createRenderStyles({ utilityEngine: "custom" }));

    const { iframeHtml, frameworkScripts } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ":root{--color-background:#000000;}"),
    });

    expect(frameworkScripts.value).not.toContain("uno.global.js");
    expect(iframeHtml.value).not.toContain("data-aria-global-css");
    expect(iframeHtml.value).toContain("data-aria-base-css");
    expect(iframeHtml.value).toContain(":root{--color: red;}");
    expect(iframeHtml.value).toContain("data-aria-utility-css");
    expect(iframeHtml.value).toContain("data-aria-theme-vars");
    expect(iframeHtml.value).toContain("--color-background:#000000;");
    expect(iframeHtml.value).not.toContain("window.__unocss =");
  });

  it("orders runtime theme variables before authored render styles", () => {
    const siteSettings = ref({ utilityEngine: "custom" as const });
    const renderStyles = ref(
      createRenderStyles({
        globalCSS: ":root{--brand:#ff0000;} .token{color:var(--brand);}",
      }),
    );

    const { iframeHtml } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ":root{--brand:#0000ff;}"),
    });

    expect(iframeHtml.value.indexOf("data-aria-theme-vars")).toBeLessThan(
      iframeHtml.value.indexOf("data-aria-base-css"),
    );
    expect(iframeHtml.value.indexOf("--brand:#0000ff;")).toBeLessThan(
      iframeHtml.value.indexOf("--brand:#ff0000;"),
    );
  });

  it("injects Uno runtime only when utility engine is unocss", () => {
    const siteSettings = ref({ utilityEngine: "unocss" as const });
    const renderStyles = ref(createRenderStyles({ utilityEngine: "unocss" }));

    const { iframeHtml, frameworkScripts } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => '{"theme":{}}'),
      cssVariables: computed(() => ":root{--accent:red;}"),
    });

    expect(frameworkScripts.value).toContain("uno.global.js");
    expect(iframeHtml.value).toContain("window.__unocss =");
    expect(iframeHtml.value).toContain("data-aria-theme-vars");
    expect(iframeHtml.value).toContain(":root{--accent:red;}");
    expect(iframeHtml.value).toContain("data-aria-utility-css");
    expect(iframeHtml.value).toContain(".bg-primary{background:red}");
    expect(iframeHtml.value).not.toContain(
      'button[data-aria-type="Button"]',
    );
    expect(iframeHtml.value).not.toContain("appearance: none !important");
  });

  it("inlines compiled global CSS instead of reloading the preview stylesheet link", () => {
    const siteSettings = ref({ utilityEngine: "custom" as const });
    const renderStyles = ref(
      createRenderStyles({
        baseCSS: "body{background:#ffffff;color:#111111;}",
        globalCSS: "body{background:#090909;color:#f8f8f8;}",
      }),
    );

    const { iframeHtml } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ""),
    });

    expect(iframeHtml.value).not.toContain("data-aria-global-css");
    expect(iframeHtml.value).toContain("data-aria-base-css");
    expect(iframeHtml.value).toContain(
      "body{background:#090909;color:#f8f8f8;}",
    );
    expect(iframeHtml.value).not.toContain("body{background:#ffffff;}");
    expect(iframeHtml.value).not.toContain(
      "background-color: var(--color-background, #ffffff);",
    );
    expect(iframeHtml.value).not.toContain(
      "color: var(--color-foreground, #000000);",
    );
  });

  it("falls back to inline base and utility CSS when no preview hash is available", () => {
    const siteSettings = ref({ utilityEngine: "custom" as const });
    const renderStyles = ref(
      createRenderStyles({
        baseCSS: "body{background:#ffffff;}",
        globalCSS: "body{background:#090909;color:#f8f8f8;}",
        globalCSSHash: "",
        baseCSSHash: "",
        styleRevision: "",
      }),
    );

    const { iframeHtml } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ""),
    });

    expect(iframeHtml.value).not.toContain("data-aria-global-css");
    expect(iframeHtml.value).toContain("data-aria-base-css");
    expect(iframeHtml.value).toContain("data-aria-utility-css");
    expect(iframeHtml.value).toContain(
      "body{background:#090909;color:#f8f8f8;}",
    );
    expect(iframeHtml.value).not.toContain("body{background:#ffffff;}");
  });

  it("includes low-specificity screen-reader utility fallbacks for canvas boot", () => {
    const siteSettings = ref({ utilityEngine: "unocss" as const });
    const renderStyles = ref(
      createRenderStyles({
        globalCSS: "",
        utilityCSS: "",
        utilityEngine: "unocss",
      }),
    );

    const { iframeHtml } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ""),
    });

    expect(iframeHtml.value).toContain(STAGE_SCREEN_READER_UTILITY_CSS);
    expect(STAGE_SCREEN_READER_UTILITY_CSS).toContain(":where(.sr-only)");
    expect(STAGE_SCREEN_READER_UTILITY_CSS).toContain(":where(.not-sr-only)");
  });

  it("loads stored global CSS when the render-style action has no payload", () => {
    const siteSettings = ref({ utilityEngine: "unocss" as const });
    const renderStyles = ref(
      createRenderStyles({
        baseCSS: "",
        baseCSSHash: "",
        globalCSS: "",
        globalCSSHash: "",
        styleRevision: "",
        utilityCSS: "",
        utilityCSSHash: "",
        utilityEngine: "unocss",
      }),
    );

    const { iframeHtml } = useIframeSetup({
      siteSettings,
      renderStyles,
      configJSON: computed(() => "{}"),
      cssVariables: computed(() => ""),
    });

    expect(iframeHtml.value).toContain(
      'data-aria-global-css href="/styles/global.css"',
    );
    expect(iframeHtml.value).not.toContain("preview=1");
  });
});
