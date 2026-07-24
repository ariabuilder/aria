import { describe, expect, it } from "vitest";
import { pathsMatchForRedirect } from "../../lib/redirects/normalizePath";

describe("redirect wildcard matching", () => {
  it("matches wildcard source paths", () => {
    expect(pathsMatchForRedirect("/blog/old-post", "/blog/*")).toBe(true);
    expect(pathsMatchForRedirect("/blog", "/blog/*")).toBe(false);
  });
});
