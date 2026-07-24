import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSourcePath = path.resolve(
  process.cwd(),
  "aria/lib/motion/assets/aria-motion.js",
);
const publicRuntimePath = path.resolve(
  process.cwd(),
  "public/vendor/aria-motion/aria-motion.js",
);
const runtimeSource = readFileSync(runtimeSourcePath, "utf8");

class RuntimeStyleSheet {
  cssText = "";

  replaceSync(cssText: string): void {
    this.cssText = cssText;
  }
}

describe("Aria Motion runtime clean markup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(document, "adoptedStyleSheets", {
      configurable: true,
      writable: true,
      value: [],
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    vi.stubGlobal("CSSStyleSheet", RuntimeStyleSheet);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 120,
      height: 240,
    } as DOMRect);
  });

  afterEach(() => {
    delete (window as Window & { AriaMotion?: unknown }).AriaMotion;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps stagger, text, scrub, and parallax values out of element styles", () => {
    document.body.innerHTML = `
      <div class="aria-motion aria-motion-fade aria-motion-now aria-motion-stagger" data-aria-motion-stagger="90">
        <span>One</span><span>Two</span>
      </div>
      <div class="aria-motion aria-motion-fade aria-motion-scrub" data-aria-motion-scrub="200">Scrub</div>
      <img class="aria-parallax aria-parallax-up aria-parallax-velocity" data-aria-parallax-speed="0.5" data-aria-parallax-travel="160" />
      <div class="aria-motion aria-motion-fade aria-motion-now aria-motion-chars" data-aria-motion-text-stagger="30">Hi</div>
    `;

    window.eval(runtimeSource);

    const runtimeNodes = document.querySelectorAll(
      "[data-aria-motion-runtime-id]",
    );
    const sheets = document.adoptedStyleSheets as unknown as RuntimeStyleSheet[];

    expect(runtimeNodes.length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[style]")).toHaveLength(0);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.cssText).toContain("--aria-motion-delay");
    expect(sheets[0]?.cssText).toContain("--aria-motion-progress");
    expect(sheets[0]?.cssText).toContain("--aria-parallax-progress");
    expect(sheets[0]?.cssText).toContain("--aria-parallax-velocity-offset");
  });

  it("keeps the served runtime in sync with the canonical source", () => {
    expect(readFileSync(publicRuntimePath, "utf8")).toBe(runtimeSource);
  });
});
