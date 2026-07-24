import { describe, expect, it } from "vitest";

import {
  applyImagePresentationToElement,
  attachBrokenMediaFallback,
  handleBrokenMediaElement,
  resolveImageObjectFit,
  syncImageEmptyStateAttribute,
} from "../../../admin/features/Stage/utils/imagePresentation";

describe("imagePresentation", () => {
  it("defaults object fit to cover when node styles omit it", () => {
    expect(
      resolveImageObjectFit({
        props: { src: "/uploads/hero.jpg", alt: "Hero" },
        styles: {},
      }),
    ).toBe("cover");
  });

  it("prefers persisted responsive object fit styles", () => {
    expect(
      resolveImageObjectFit({
        props: { src: "/uploads/hero.jpg" },
        styles: {
          objectFit: { base: "contain" },
        },
      }),
    ).toBe("contain");
  });

  it("applies cover to image elements on the stage", () => {
    const img = document.createElement("img");
    applyImagePresentationToElement(img);

    expect(img.style.display).toBe("block");
    expect(img.style.objectFit).toBe("cover");
  });

  it("marks empty images for canvas placeholder styling", () => {
    const img = document.createElement("img");

    syncImageEmptyStateAttribute(img, "");
    expect(img.getAttribute("data-aria-image-empty")).toBe("true");

    syncImageEmptyStateAttribute(img, "https://example.com/logo.png");
    expect(img.hasAttribute("data-aria-image-empty")).toBe(false);
  });

  it("clears broken image src values and marks the element empty", () => {
    const img = document.createElement("img");
    img.src = "https://cdn.example.com/uploads/missing.jpg";

    handleBrokenMediaElement(img);

    expect(img.getAttribute("src")).toBeNull();
    expect(img.getAttribute("data-aria-image-empty")).toBe("true");
  });

  it("clears broken video src and poster values", () => {
    const video = document.createElement("video");
    video.src = "https://cdn.example.com/uploads/missing.mp4";
    video.poster = "https://cdn.example.com/uploads/missing.jpg";

    handleBrokenMediaElement(video);

    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("poster")).toBeNull();
    expect(video.getAttribute("data-aria-image-empty")).toBe("true");
  });

  it("attaches an error handler that clears broken media elements", () => {
    const img = document.createElement("img");
    img.src = "https://cdn.example.com/uploads/missing.jpg";
    attachBrokenMediaFallback(img);

    img.dispatchEvent(new Event("error"));

    expect(img.getAttribute("src")).toBeNull();
    expect(img.getAttribute("data-aria-image-empty")).toBe("true");
  });
});
