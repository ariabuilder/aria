import { describe, expect, it } from "vitest";

import { getRenderingParityRoutes } from "../../integration";
import { isRenderingParityLoopbackHostname } from "../../pages/renderingParityRoute";

describe("rendering parity route isolation", () => {
  it("injects fixtures only for an explicit valid parity runtime", () => {
    expect(getRenderingParityRoutes(undefined)).toEqual([]);
    expect(getRenderingParityRoutes("invalid")).toEqual([]);
    expect(getRenderingParityRoutes("node")).toHaveLength(5);
    expect(getRenderingParityRoutes("workerd")).toHaveLength(5);
  });

  it.each(["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"])(
    "accepts the loopback hostname %s",
    (hostname) => {
      expect(isRenderingParityLoopbackHostname(hostname)).toBe(true);
    },
  );

  it.each(["demo.ariabuilder.io", "127.0.0.2", "[2001:db8::1]"])(
    "rejects the non-loopback hostname %s",
    (hostname) => {
      expect(isRenderingParityLoopbackHostname(hostname)).toBe(false);
    },
  );
});
