import { afterEach, describe, expect, it } from "vitest";
import {
  resolveStudioFaviconHrefs,
  syncStudioFavicon,
} from "../../admin/lib/studioFavicon";

const defaultLightHref = "/_astro/favicon-light.png";
const defaultDarkHref = "/_astro/favicon-dark.png";

function renderFaviconLinks(): void {
  document.head.innerHTML = `
    <link id="aria-favicon-light" rel="icon" href="${defaultLightHref}" data-aria-favicon-default-href="${defaultLightHref}">
    <link id="aria-favicon-dark" rel="icon" href="${defaultDarkHref}" data-aria-favicon-default-href="${defaultDarkHref}">
  `;
}

afterEach(() => {
  document.head.innerHTML = "";
});

describe("Studio favicon", () => {
  it("uses a saved favicon for both builder color schemes", () => {
    expect(
      resolveStudioFaviconHrefs({
        favicon: " /uploads/favicon.svg ",
        defaultLightHref,
        defaultDarkHref,
      }),
    ).toEqual({
      light: "/uploads/favicon.svg",
      dark: "/uploads/favicon.svg",
    });
  });

  it("falls back to Aria's light and dark favicon assets", () => {
    expect(
      resolveStudioFaviconHrefs({
        favicon: " ",
        defaultLightHref,
        defaultDarkHref,
      }),
    ).toEqual({
      light: defaultLightHref,
      dark: defaultDarkHref,
    });
  });

  it("updates and clears the current builder tab favicon", () => {
    renderFaviconLinks();

    syncStudioFavicon("/uploads/favicon.ico");
    expect(document.querySelector("#aria-favicon-light")?.getAttribute("href")).toBe(
      "/uploads/favicon.ico",
    );
    expect(document.querySelector("#aria-favicon-dark")?.getAttribute("href")).toBe(
      "/uploads/favicon.ico",
    );

    syncStudioFavicon("");
    expect(document.querySelector("#aria-favicon-light")?.getAttribute("href")).toBe(
      defaultLightHref,
    );
    expect(document.querySelector("#aria-favicon-dark")?.getAttribute("href")).toBe(
      defaultDarkHref,
    );
  });
});
