import { describe, expect, it } from "vitest";

import { compileUnoCSS } from "../../lib/styles/compileUnoCSS";

describe("compileUnoCSS", () => {
  it("does not emit Wind4 property layer blocks in user CSS", async () => {
    const css = await compileUnoCSS(
      '<div class="bg-primary text-primary-foreground shadow-md translate-y-2"></div>',
      "",
      "",
      "media",
      {
        theme: {
          colors: {
            primary: {
              50: "#fef2f2",
              100: "#fee2e2",
              200: "#fecaca",
              300: "#fca5a5",
              400: "#f87171",
              500: "#ef4444",
              600: "#dc2626",
              700: "#b91c1c",
              800: "#991b1b",
              900: "#7f1d1d",
              950: "#450a0a",
              DEFAULT: "#ef4444",
            },
            "primary-foreground": "#ffffff",
          },
        },
      },
    );

    expect(css).not.toContain("@property --un-text-opacity");
    expect(css).not.toContain("@property --un-bg-opacity");
    expect(css).not.toContain("/* layer: properties */");
    expect(css).toContain(".bg-primary");
  });

  it("emits negative spacing and transform utilities from scanned HTML", async () => {
    const css = await compileUnoCSS(
      '<div class="-mt-4 -translate-x-1"></div>',
      "",
      "",
      "media",
    );

    expect(css).toContain(".-mt-4");
    expect(css).toContain("margin-top");
    expect(css).toContain(".-translate-x-1");
  });

  it("emits extended spacing utilities such as h-120", async () => {
    const css = await compileUnoCSS(
      '<div class="h-120"></div>',
      "",
      "",
      "media",
    );

    expect(css).toContain(".h-120");
    expect(css).toContain("height:30rem");
  });

  it("emits screen-reader utilities used by imported navigation", async () => {
    const css = await compileUnoCSS(
      '<span class="sr-only">Open main menu</span><span class="not-sr-only">Visible</span>',
      "",
      "",
      "media",
    );

    expect(css).toContain(".sr-only");
    expect(css).toContain("clip:rect(0,0,0,0)");
    expect(css).toContain(".not-sr-only");
    expect(css).toContain("position:static");
  });

  it("emits responsive arbitrary utilities used by imported blog sections", async () => {
    const css = await compileUnoCSS(
      `<div class="bg-white py-24 sm:py-32">
        <article class="w-full lg:relative lg:isolate lg:aspect-[2/1] lg:overflow-clip lg:rounded-3xl lg:p-10">
          <div class="relative aspect-video w-full overflow-clip rounded-2xl sm:aspect-[2/1] lg:static lg:aspect-auto lg:rounded-none">
            <img class="absolute inset-0 h-full w-full object-cover" />
            <div class="absolute inset-0 hidden bg-gradient-to-b from-gray-900/0 via-gray-900/40 to-gray-900 lg:block"></div>
          </div>
          <p class="mt-5 line-clamp-2 text-sm leading-6 text-gray-600 lg:max-w-xl lg:text-gray-300"></p>
        </article>
        <div class="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 lg:mx-0 lg:max-w-none lg:grid-cols-3"></div>
      </div>`,
      "",
      "",
      "media",
    );

    expect(css).toContain(".lg\\:relative");
    expect(css).toContain(".lg\\:aspect-\\[2\\/1\\]");
    expect(css).toContain(".lg\\:grid-cols-3");
    expect(css).toContain(".aspect-video");
    expect(css).toContain(".via-gray-900\\/40");
    expect(css).toContain(".line-clamp-2");
  });
});
