import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter, SiteSettings } from "../../lib/storage/adapter";
import type { PageDSL } from "../../lib/types/nodes";
import { renderPageHtmlFromStorage } from "../../lib/rendering/renderPageHtml";
import {
  hasCurrentPageSnapshotVersion,
  renderPageSnapshotHtml,
} from "../../lib/rendering/pageSnapshots";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";
import { createRenderStorageAdapterStub } from "../mocks/renderStorageAdapter";

function createInjectionAdapter(
  overrides: Parameters<typeof createRenderStorageAdapterStub>[0] = {},
): StorageAdapter {
  return createRenderStorageAdapterStub(overrides);
}

describe("custom code injection", () => {
  it("injects custom head/body/footer code into SSR HTML output", async () => {
    const page: PageDSL = {
      id: "test-page",
      slug: "test-page",
      title: "Test Page",
      nodes: [],
    };

    const siteSettings: SiteSettings = {
      customHeadCode: '<meta name="custom-head" content="ok">',
      customBodyCode: '<div id="custom-body-start">start</div>',
      customFooterCode: '<div id="custom-body-end">end</div>',
      analytics: {
        version: 1,
        activeProviders: [],
        providers: {},
      },
    };

    const adapter = createInjectionAdapter({
      getPageDSL: vi.fn(async (slug: string) => {
        if (slug === "test-page") {
          return page;
        }
        return null;
      }),
      getSiteSettings: vi.fn(async () => siteSettings),
    });

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/test-page",
    });

    expect(result).not.toBeNull();

    const html = result?.html ?? "";

    expect(html).toContain('<meta name="custom-head" content="ok">');
    expect(html).toContain('<div id="custom-body-start">start</div>');
    expect(html).toContain('<div id="custom-body-end">end</div>');
  });

  it("uses the compiled global CSS hash and class dark-mode settings in SSR output", async () => {
    const page: PageDSL = {
      id: "test-page",
      slug: "test-page",
      title: "Test Page",
      nodes: [],
    };

    const siteSettings: SiteSettings = {
      utilityEngine: "unocss",
      darkMode: "class",
      analytics: {
        version: 1,
        activeProviders: [],
        providers: {},
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.artifacts.globalCSS = "body{color:red;}";
    designSystem.artifacts.globalCSSHash = "hash-123";

    const adapter = {
      getSnapshot: vi.fn(async () => null),
      getPageDSL: vi.fn(async (slug: string) => {
        if (slug === "test-page") {
          return page;
        }
        return null;
      }),
      getPublishedPageDSL: vi.fn(async () => null),
      getSiteSettings: vi.fn(async () => siteSettings),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/test-page",
    });

    expect(result).not.toBeNull();

    const html = result?.html ?? "";

    expect(html).toContain(
      '<link rel="stylesheet" href="/styles/global.css?v=hash-123">',
    );
    expect(html).toContain("localStorage.getItem('darkMode') === 'true'");
  });

  it("does not inline reset or responsive node CSS when compiled global CSS is linked", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "testimonial-text-1",
          type: "Text",
          props: {
            text: "Testimonial",
          },
          styles: {
            fontFamily: {
              base: "Inter",
              tablet: "DM Sans",
            },
            textTransform: {
              base: "uppercase",
              tablet: "none",
            },
          },
          children: [],
        },
      ],
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.fonts.google["google-bricolage"] = {
      id: "google-bricolage",
      family: "Bricolage Grotesque",
      variants: ["200", "300", "400", "500"],
      googleFontsURL:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:ital,wght@0,200;0,300;0,400;0,500&display=swap",
    };
    designSystem.artifacts.globalCSS = [
      '@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:ital,wght@0,200;0,300;0,400;0,500&display=swap");',
      "html, body { margin: 0; padding: 0; }",
      "@media (max-width: 1279.98px) {\n  .aria-testimonial-text-1 { font-family: DM Sans; text-transform: none; }\n}",
    ].join("\n\n");
    designSystem.artifacts.globalCSSHash = "compiled-home-hash";

    const adapter = {
      getSnapshot: vi.fn(async () => null),
      getPageDSL: vi.fn(async (slug: string) =>
        slug === "home" ? page : null,
      ),
      getPublishedPageDSL: vi.fn(async () => null),
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/home",
    });

    const html = result?.html ?? "";

    expect(html).toContain(
      '<link rel="stylesheet" href="/styles/global.css?v=compiled-home-hash">',
    );
    expect(html).not.toContain(
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
    );
    expect(html).not.toContain(
      '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:ital,wght@0,200;0,300;0,400;0,500&display=swap" rel="stylesheet">',
    );
    expect(html).not.toContain("@media (min-width: 768px)");
    expect(html).not.toContain("html, body {");
  });

  it("injects resolved semantic theme variables into SSR HTML", async () => {
    const page: PageDSL = {
      id: "theme-page",
      slug: "theme-page",
      title: "Theme Page",
      nodes: [],
      settings: {
        cssVariables: {
          "--page-only": "42px",
        },
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.accent = "#22c55e";
    designSystem.tokens.colors.palette["accent-500"] = "#22c55e";

    const adapter = {
      getSnapshot: vi.fn(async () => null),
      getPageDSL: vi.fn(async (slug: string) =>
        slug === "theme-page" ? page : null,
      ),
      getPublishedPageDSL: vi.fn(async () => null),
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/theme-page",
    });

    const html = result?.html ?? "";

    expect(html).toContain("--accent: #22c55e;");
    expect(html).toContain("--page-only: 42px;");
  });

  it("keeps design-system tokens in global css when compiled css is available", async () => {
    const page: PageDSL = {
      id: "compiled-theme-page",
      slug: "compiled-theme-page",
      title: "Compiled Theme Page",
      nodes: [],
      settings: {
        cssVariables: {
          "--page-only": "42px",
        },
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.accent = "#22c55e";
    designSystem.tokens.colors.palette["accent-500"] = "#22c55e";
    designSystem.artifacts.globalCSS = ":root { --accent: #22c55e; }";
    designSystem.artifacts.globalCSSHash = "compiled-theme-hash";

    const adapter = {
      getSnapshot: vi.fn(async () => null),
      getPageDSL: vi.fn(async (slug: string) =>
        slug === "compiled-theme-page" ? page : null,
      ),
      getPublishedPageDSL: vi.fn(async () => null),
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/compiled-theme-page",
    });

    const html = result?.html ?? "";

    expect(html).toContain(
      '<link rel="stylesheet" href="/styles/global.css?v=compiled-theme-hash">',
    );
    expect(html).not.toContain("--accent: #22c55e;");
    expect(html).toContain("--page-only: 42px;");
  });

  it("injects resolved semantic theme variables into snapshot HTML", async () => {
    const page: PageDSL = {
      id: "snapshot-theme-page",
      slug: "snapshot-theme-page",
      title: "Snapshot Theme Page",
      nodes: [],
      settings: {
        cssVariables: {
          "--page-accent-alpha": "0.88",
        },
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.accent = "#16a34a";
    designSystem.tokens.colors.palette["accent-500"] = "#16a34a";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const html = await renderPageSnapshotHtml(
      {
        page,
        stage: "draft",
      },
      adapter,
    );

    expect(html).toContain("aria-page-snapshot:v4");
    expect(html).toContain("aria-page-snapshot:icon-snapshot:");
    expect(html).toContain("aria-page-snapshot:style-revision:0");
    expect(hasCurrentPageSnapshotVersion(html, "0")).toBe(true);
    expect(hasCurrentPageSnapshotVersion(html, "1")).toBe(false);
    expect(html).toContain("--accent: #16a34a;");
    expect(html).toContain("--page-accent-alpha: 0.88;");
  });

  it("injects resolved semantic theme variables into inline compiled snapshot HTML", async () => {
    const page: PageDSL = {
      id: "compiled-snapshot-theme-page",
      slug: "compiled-snapshot-theme-page",
      title: "Compiled Snapshot Theme Page",
      nodes: [],
      settings: {
        cssVariables: {
          "--page-accent-alpha": "0.88",
        },
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.accent = "#16a34a";
    designSystem.tokens.colors.palette["accent-500"] = "#16a34a";
    designSystem.artifacts.globalCSS = ".hero{background:hsl(var(--accent));}";
    designSystem.artifacts.globalCSSHash = "compiled-snapshot-theme-hash";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "unocss" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const html = await renderPageSnapshotHtml(
      {
        page,
        stage: "draft",
      },
      adapter,
    );

    expect(html).toContain(".hero{background:hsl(var(--accent));}");
    expect(html).toContain("--accent: #16a34a;");
    expect(html).toContain("--page-accent-alpha: 0.88;");
  });

  it("includes compiled Aria CSS alongside a custom framework stylesheet in SSR output", async () => {
    const page: PageDSL = {
      id: "custom-framework-page",
      slug: "custom-framework-page",
      title: "Custom Framework Page",
      nodes: [],
    };

    const siteSettings: SiteSettings = {
      utilityEngine: "custom",
      customFrameworkURL: "https://cdn.example.com/framework.css",
      analytics: {
        version: 1,
        activeProviders: [],
        providers: {},
      },
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.artifacts.globalCSS = ":root{--color-primary:#a633cc;}";
    designSystem.artifacts.globalCSSHash = "hash-custom-123";

    const adapter = {
      getSnapshot: vi.fn(async () => null),
      getPageDSL: vi.fn(async (slug: string) => {
        if (slug === "custom-framework-page") {
          return page;
        }
        return null;
      }),
      getPublishedPageDSL: vi.fn(async () => null),
      getSiteSettings: vi.fn(async () => siteSettings),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/custom-framework-page",
    });

    const html = result?.html ?? "";

    expect(html).toContain(
      '<link rel="stylesheet" href="/styles/global.css?v=hash-custom-123">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="https://cdn.example.com/framework.css">',
    );
  });

  it("inlines compiled Aria CSS into snapshot HTML in custom mode", async () => {
    const page: PageDSL = {
      id: "custom-snapshot-page",
      slug: "custom-snapshot-page",
      title: "Custom Snapshot Page",
      nodes: [],
    };

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.artifacts.globalCSS =
      ":root{--color-primary:#a633cc;} .btn{border-radius:12px;}";
    designSystem.artifacts.globalCSSHash = "hash-snapshot-123";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({ utilityEngine: "custom" })),
      getDesignSystem: vi.fn(async () => designSystem),
      getLayoutDSL: vi.fn(async () => null),
      getComponentDSL: vi.fn(async () => null),
      listPagesDSL: vi.fn(async () => []),
      listCollections: vi.fn(async () => []),
    } as unknown as StorageAdapter;

    const html = await renderPageSnapshotHtml(
      {
        page,
        stage: "draft",
      },
      adapter,
    );

    expect(html).toContain(":root{--color-primary:#a633cc;}");
    expect(html).toContain(".btn{border-radius:12px;}");
    expect(html).not.toContain("cdn.tailwindcss.com");
  });
});
