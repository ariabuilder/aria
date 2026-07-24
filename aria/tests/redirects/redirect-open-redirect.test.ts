import { describe, expect, it } from "vitest";
import { validateRedirectRule } from "../../lib/redirects/validate";

describe("redirect open redirect hardening", () => {
  const context = {
    existingRules: [],
    livePaths: new Set(["/new-page"]),
  };

  it("rejects external destinations", () => {
    const errors = validateRedirectRule(
      {
        fromPath: "/old",
        toPath: "https://evil.com",
        statusCode: 301,
        enabled: true,
      },
      context,
    );
    expect(errors.some((error) => error.field === "toPath")).toBe(true);
  });

  it("rejects javascript destinations", () => {
    const errors = validateRedirectRule(
      {
        fromPath: "/old",
        toPath: "javascript:alert(1)",
        statusCode: 301,
        enabled: true,
      },
      context,
    );
    expect(errors.some((error) => error.field === "toPath")).toBe(true);
  });

  it("rejects protected source paths", () => {
    const errors = validateRedirectRule(
      {
        fromPath: "/admin/login",
        toPath: "/new-page",
        statusCode: 301,
        enabled: true,
      },
      context,
    );
    expect(errors.some((error) => error.field === "fromPath")).toBe(true);
  });

  it("allows disabling an existing stale redirect with an invalid target", () => {
    const errors = validateRedirectRule(
      {
        fromPath: "/old",
        toPath: "/missing-page",
        statusCode: 301,
        enabled: false,
      },
      context,
      { allowDisabledInvalid: true },
    );

    expect(errors).toEqual([]);
  });

  it("keeps invalid target validation when enabling or editing redirects", () => {
    const errors = validateRedirectRule(
      {
        fromPath: "/old",
        toPath: "/missing-page",
        statusCode: 301,
        enabled: true,
      },
      context,
    );

    expect(errors.some((error) => error.field === "toPath")).toBe(true);
  });
});
