import { describe, expect, it } from "vitest";
import { resolvePageRobotsMeta } from "../../lib/seo/robotsMeta";

describe("robots precedence", () => {
  it("forces noindex for password and unlisted access modes", () => {
    expect(
      resolvePageRobotsMeta({
        accessMode: "password",
        seo: { noindex: false, nofollow: false },
      }),
    ).toEqual({ noindex: true, nofollow: true });

    expect(
      resolvePageRobotsMeta({
        accessMode: "unlisted",
        seo: { noindex: false, nofollow: false },
      }),
    ).toEqual({ noindex: true, nofollow: true });
  });

  it("respects page SEO on public pages", () => {
    expect(
      resolvePageRobotsMeta({
        accessMode: "public",
        seo: { nofollow: true },
      }),
    ).toEqual({ nofollow: true });
  });
});
