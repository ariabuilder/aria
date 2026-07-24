import { describe, expect, it } from "vitest";
import {
  buildRobotsMetaContent,
  buildRobotsMetaTag,
  resolvePageRobotsMeta,
} from "../../lib/seo/robotsMeta";

describe("robotsMeta", () => {
  it("returns null for index,follow default", () => {
    expect(buildRobotsMetaContent({})).toBeNull();
  });

  it("returns nofollow only when configured", () => {
    expect(buildRobotsMetaContent({ nofollow: true })).toBe("nofollow");
  });

  it("returns noindex only when configured", () => {
    expect(buildRobotsMetaContent({ noindex: true })).toBe("noindex");
  });

  it("returns combined directives", () => {
    expect(buildRobotsMetaContent({ noindex: true, nofollow: true })).toBe(
      "noindex, nofollow",
    );
  });

  it("builds meta tag", () => {
    expect(buildRobotsMetaTag({ noindex: true })).toContain(
      'content="noindex"',
    );
  });

  it("forces noindex for password pages", () => {
    expect(
      resolvePageRobotsMeta({
        accessMode: "password",
        seo: { noindex: false, nofollow: false },
      }),
    ).toEqual({ noindex: true, nofollow: true });
  });

  it("forces noindex for unlisted pages", () => {
    expect(resolvePageRobotsMeta({ accessMode: "unlisted" })).toEqual({
      noindex: true,
      nofollow: true,
    });
  });

  it("respects public page seo flags", () => {
    expect(
      resolvePageRobotsMeta({
        accessMode: "public",
        seo: { nofollow: true },
      }),
    ).toEqual({ nofollow: true });
  });
});
