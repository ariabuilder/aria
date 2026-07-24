import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARIA_MARK_ANCHOR_POINTS,
  ARIA_MARK_ACCENT_PATH,
  ARIA_MARK_BODY_PATH,
  ARIA_MARK_HANDLE_LINES,
  ARIA_MARK_TRANSFORM,
  PRELOADER_ARIA_LOGO_CSS_VARS,
} from "../../../lib/preloader/ariaMark";

const ariaIconSvg = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../admin/assets/aria-icon.svg"),
  "utf8",
);

function extractPathDs(svg: string): string[] {
  return [...svg.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1]);
}

describe("ariaMark", () => {
  it("matches aria-icon.svg path geometry", () => {
    const [bodyFromSvg, accentFromSvg] = extractPathDs(ariaIconSvg);
    expect(bodyFromSvg).toBe(ARIA_MARK_BODY_PATH);
    expect(accentFromSvg).toBe(ARIA_MARK_ACCENT_PATH);
  });

  it("uses the asset transform matrix", () => {
    expect(ariaIconSvg).toContain(ARIA_MARK_TRANSFORM);
  });

  it("exports preloader timing CSS variables", () => {
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-body-draw-duration"]).toBe(
      "760ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-accent-draw-duration"]).toBe(
      "560ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-fill-duration"]).toBe(
      "460ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-anchor-duration"]).toBe(
      "360ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-handle-delay"]).toBe(
      "160ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-handle-stagger"]).toBe(
      "46ms",
    );
    expect(
      PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-accent-attach-duration"],
    ).toBe("460ms");
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-grid-border-delay"]).toBe(
      "80ms",
    );
    expect(PRELOADER_ARIA_LOGO_CSS_VARS["--preloader-mark-easing"]).toBe(
      "cubic-bezier(0.22, 1, 0.36, 1)",
    );
  });

  it("exports construction anchors in viewport space", () => {
    expect(ARIA_MARK_ANCHOR_POINTS).toHaveLength(8);
    expect(ARIA_MARK_ANCHOR_POINTS[0]).toEqual({
      id: "body-foot-left",
      cx: 2,
      cy: 618,
    });
    expect(ARIA_MARK_ANCHOR_POINTS.some((anchor) => anchor.id === "body-apex")).toBe(
      true,
    );
    expect(
      ARIA_MARK_ANCHOR_POINTS.every(
        (anchor) =>
          anchor.cx >= 0 && anchor.cx <= 727 && anchor.cy >= 0 && anchor.cy <= 621,
      ),
    ).toBe(true);
  });

  it("exports Bezier handle lines for the construction pass", () => {
    expect(ARIA_MARK_HANDLE_LINES).toHaveLength(5);
    expect(ARIA_MARK_HANDLE_LINES[0]).toEqual({
      id: "left-curve-handle",
      x1: 214,
      y1: 304,
      x2: 282,
      y2: 236,
    });
    expect(
      ARIA_MARK_HANDLE_LINES.every(
        (handle) =>
          handle.x1 >= 0 &&
          handle.x1 <= 727 &&
          handle.x2 >= 0 &&
          handle.x2 <= 727 &&
          handle.y1 >= 0 &&
          handle.y1 <= 621 &&
          handle.y2 >= 0 &&
          handle.y2 <= 621,
      ),
    ).toBe(true);
  });
});
