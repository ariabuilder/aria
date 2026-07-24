import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearIconSvgDataCache,
  resolveIconSvgData,
} from "../../admin/lib/iconDataClient";
import { ICON_SNAPSHOT_VERSION } from "../../lib/icons/generatedIconSnapshot";

describe("icon data client", () => {
  afterEach(() => {
    clearIconSvgDataCache();
    vi.unstubAllGlobals();
  });

  it("deduplicates concurrent icon requests and keeps the API batch size bounded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        snapshotVersion: ICON_SNAPSHOT_VERSION,
        icons: {
          "lucide:star": {
            svg: "<svg></svg>",
            viewBox: "0 0 24 24",
            snapshotVersion: "test",
          },
          "lucide:heart": {
            svg: "<svg><path /></svg>",
            viewBox: "0 0 24 24",
            snapshotVersion: "test",
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      resolveIconSvgData(["lucide:star", "lucide:heart"]),
      resolveIconSvgData(["lucide:star", "lucide:heart"]),
    ]);

    expect(first["lucide:star"]?.svg).toBe("<svg></svg>");
    expect(first["lucide:heart"]?.svg).toBe("<svg><path /></svg>");
    expect(second["lucide:star"]?.svg).toBe("<svg></svg>");
    expect(second["lucide:heart"]?.svg).toBe("<svg><path /></svg>");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("ids=lucide%3Astar");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `v=${ICON_SNAPSHOT_VERSION}`,
    );
  });
});
