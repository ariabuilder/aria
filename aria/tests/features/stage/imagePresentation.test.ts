import { describe, expect, it } from "vitest";

import {
  attachBrokenMediaFallback,
  resolveImageObjectFit,
  resolveImageObjectPosition,
} from "../../../admin/features/Stage/utils/imagePresentation";

describe("imagePresentation", () => {
  it("does not invent object fit when node styles omit it", () => {
    expect(
      resolveImageObjectFit({
        props: { src: "/uploads/hero.jpg", alt: "Hero" },
        styles: {},
      }),
    ).toBeUndefined();
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

  it("does not invent object position when node styles omit it", () => {
    expect(
      resolveImageObjectPosition({
        props: { src: "/uploads/hero.jpg", alt: "Hero" },
        styles: {},
      }),
    ).toBeUndefined();
  });

  it("reports broken media without mutating authored DOM state", () => {
    const img = document.createElement("img");
    img.src = "https://cdn.example.com/uploads/missing.jpg";
    img.style.objectFit = "contain";
    const failures: Array<{
      kind: "media-load-failed";
      media: "image" | "video";
      source: string;
    }> = [];
    attachBrokenMediaFallback(img, (failure) => failures.push(failure));

    img.dispatchEvent(new Event("error"));

    expect(img.getAttribute("src")).toBe(
      "https://cdn.example.com/uploads/missing.jpg",
    );
    expect(img.style.objectFit).toBe("contain");
    expect(img.hasAttribute("data-aria-image-empty")).toBe(false);
    expect(failures).toEqual([
      {
        kind: "media-load-failed",
        media: "image",
        source: "https://cdn.example.com/uploads/missing.jpg",
      },
    ]);
  });

  it("removes the media observer during cleanup", () => {
    const video = document.createElement("video");
    video.src = "https://cdn.example.com/uploads/missing.mp4";
    const failures: string[] = [];
    const cleanup = attachBrokenMediaFallback(video, (failure) => {
      failures.push(failure.source);
    });

    cleanup();
    video.dispatchEvent(new Event("error"));

    expect(failures).toEqual([]);
  });
});
