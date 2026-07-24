import { describe, expect, it } from "vitest";
import {
  buildComposerPath,
  parseComposerRouteTarget,
} from "@/lib/router/composerRouteTarget";

describe("composerRouteTarget", () => {
  it("parses composer page routes", () => {
    expect(
      parseComposerRouteTarget("/pages/home", { composer: undefined }),
    ).toEqual({
      itemType: "page",
      itemSlug: "home",
    });
  });

  it("returns null without composer query", () => {
    expect(parseComposerRouteTarget("/pages/home", {})).toBeNull();
  });

  it("builds composer paths", () => {
    expect(buildComposerPath("page", "home")).toBe("/pages/home?composer");
  });
});
