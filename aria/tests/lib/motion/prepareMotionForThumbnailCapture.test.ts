import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMotionThumbnailCaptureCss,
  revealAriaMotionForCapture,
  waitForMotionSettle,
} from "../../../lib/motion/capture/prepareMotionForThumbnailCapture";

describe("prepareMotionForThumbnailCapture", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buildMotionThumbnailCaptureCss forces settled motion visuals", () => {
    expect(buildMotionThumbnailCaptureCss()).toContain("opacity: 1 !important");
    expect(buildMotionThumbnailCaptureCss()).toContain("transform: none !important");
  });

  it("reveals hidden aria-motion elements for capture", () => {
    document.body.innerHTML = `
      <div class="aria-motion aria-motion-fade aria-motion-reveal">Hero</div>
    `;

    const hero = document.querySelector(".aria-motion");
    expect(hero?.classList.contains("aria-motion-in")).toBe(false);

    revealAriaMotionForCapture(document.body);

    expect(hero?.classList.contains("aria-motion-in")).toBe(true);
  });

  it("reveals stagger children alongside the parent", () => {
    document.body.innerHTML = `
      <div class="aria-motion aria-motion-fade aria-motion-stagger">
        <div>One</div>
        <div>Two</div>
      </div>
    `;

    revealAriaMotionForCapture(document.body);

    const children = document.querySelectorAll(
      ".aria-motion-stagger > *",
    );
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.classList.contains("aria-motion-in")).toBe(true);
    }
  });

  it("marks scrub and parallax nodes as settled without inline styles", () => {
    document.body.innerHTML = `
      <div class="aria-motion aria-motion-scrub"></div>
      <div class="aria-parallax"></div>
    `;

    revealAriaMotionForCapture(document.body);

    const scrub = document.querySelector(".aria-motion-scrub") as HTMLElement;
    const parallax = document.querySelector(".aria-parallax") as HTMLElement;

    expect(scrub.getAttribute("data-aria-motion-capture")).toBe("settled");
    expect(parallax.getAttribute("data-aria-motion-capture")).toBe("settled");
    expect(scrub.hasAttribute("style")).toBe(false);
    expect(parallax.hasAttribute("style")).toBe(false);
  });

  it("waits for transitionend before resolving", async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <div class="aria-motion aria-motion-fade" style="transition: opacity 300ms"></div>
    `;

    const motion = document.querySelector(".aria-motion") as HTMLElement;
    const settlePromise = waitForMotionSettle(document.body, 3_000);

    motion.dispatchEvent(
      new Event("transitionend", {
        bubbles: true,
      }),
    );

    await settlePromise;
    expect(true).toBe(true);
  });

  it("resolves after timeout when no transition fires", async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `<div class="aria-motion aria-motion-fade"></div>`;

    const settlePromise = waitForMotionSettle(document.body, 50);
    await vi.advanceTimersByTimeAsync(50);
    await settlePromise;

    expect(true).toBe(true);
  });
});
