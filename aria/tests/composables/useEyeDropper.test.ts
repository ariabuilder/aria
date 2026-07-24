import { afterEach, describe, expect, it, vi } from "vitest";

import { useEyeDropper } from "../../admin/composables/useEyeDropper";

describe("useEyeDropper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when EyeDropper is missing", () => {
    vi.stubGlobal("EyeDropper", undefined);
    const { isSupported, open } = useEyeDropper();
    expect(isSupported.value).toBe(false);
    return expect(open()).resolves.toBeNull();
  });

  it("returns picked hex when supported", async () => {
    vi.stubGlobal(
      "EyeDropper",
      class {
        open() {
          return Promise.resolve({ sRGBHex: "#336699" });
        }
      },
    );

    const { isSupported, open } = useEyeDropper();
    expect(isSupported.value).toBe(true);
    await expect(open()).resolves.toBe("#336699");
  });

  it("returns null when the user cancels", async () => {
    vi.stubGlobal(
      "EyeDropper",
      class {
        open() {
          return Promise.reject(new Error("canceled"));
        }
      },
    );

    const { open } = useEyeDropper();
    await expect(open()).resolves.toBeNull();
  });
});
