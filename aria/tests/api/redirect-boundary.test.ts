import { describe, expect, it } from "vitest";
import { shouldSkipRedirectLookup } from "../../../src/lib/redirectMiddleware";

describe("site API middleware boundary", () => {
  it.each(["/api", "/api/", "/api/v1", "/api/v1/collections"])(
    "keeps %s out of public redirect and trailing-slash handling",
    (pathname) => {
      expect(shouldSkipRedirectLookup(pathname)).toBe(true);
    },
  );

  it("does not classify a similarly named public route as API traffic", () => {
    expect(shouldSkipRedirectLookup("/apiculture")).toBe(false);
  });
});
