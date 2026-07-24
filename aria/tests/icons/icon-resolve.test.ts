import { describe, expect, it } from "vitest";

import { resolveIconData, searchIcons } from "../../../src/lib/icons/resolve";
import { createStaticIconProvider } from "../../lib/icons/staticIconProvider";
import { ICON_SNAPSHOT_VERSION } from "../../lib/icons/generatedIconSnapshot";
import { createIconAssetFetcher } from "../helpers/iconAssetFetcher";

describe("static icon resolver", () => {

  it("searches the static catalog without loading icon shards", async () => {
    const paths: string[] = [];
    const baseFetcher = createIconAssetFetcher();
    const provider = createStaticIconProvider({
      fetcher: {
        async fetch(input, init) {
          const url = new URL(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          );
          paths.push(url.pathname);
          return baseFetcher.fetch(input, init);
        },
      },
    })!;
    const result = await searchIcons({
      pack: "lucide",
      q: "alarm-clock",
      limit: 3,
      cursor: null,
      provider,
    });

    expect(result.items.map((item) => item.id)).toContain(
      "lucide:alarm-clock",
    );
    expect(result.items.every((item) => item.pack === "lucide")).toBe(true);
    expect(result.snapshotVersion).toBe(ICON_SNAPSHOT_VERSION);
    expect(paths.some((path) => path.includes("/shards/"))).toBe(false);
  });

  it("resolves SVG data from only the required pack shards", async () => {
    const paths: string[] = [];
    const baseFetcher = createIconAssetFetcher();
    const provider = createStaticIconProvider({
      fetcher: {
        async fetch(input, init) {
          const url = new URL(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          );
          paths.push(url.pathname);
          return baseFetcher.fetch(input, init);
        },
      },
    })!;
    const result = await resolveIconData({
      ids: ["lucide:star", "coreui-brands:github", "invalid-id"],
      provider,
    });

    expect(result.icons["lucide:star"]?.svg).toContain("<svg");
    expect(result.icons["coreui-brands:github"]?.viewBox).toMatch(/^0 0 /);
    expect(result.missing).toContain("invalid-id");
    expect(paths.filter((path) => path.includes("/shards/")).length).toBe(2);
  });

  it("uses the current request origin for static asset binding reads", async () => {
    const origins: string[] = [];
    const baseFetcher = createIconAssetFetcher();
    const provider = createStaticIconProvider({
      locals: {
        assetOrigin: "http://aria.test",
        cfBindings: {
          aria_assets: {
            async fetch(input, init) {
              const url = new URL(
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
              );
              origins.push(url.origin);
              return baseFetcher.fetch(input, init);
            },
          },
        },
      },
    })!;

    await provider.search({ pack: "lucide", q: "", limit: 1, cursor: null });

    expect(origins).toEqual(["http://aria.test", "http://aria.test"]);
  });
});
