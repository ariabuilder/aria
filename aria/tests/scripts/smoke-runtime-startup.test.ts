import { describe, expect, it } from "vitest";

import {
  assertServerStillRunning,
  isReadyResponse,
} from "../../scripts/smoke-runtime-startup";

describe("runtime startup smoke", () => {
  it("reports stdout and stderr when a server exits successfully before readiness", () => {
    expect(() =>
      assertServerStillRunning({
        result: {
          status: 0,
          signal: null,
          stdout: "Astro selected background mode",
          stderr: "server stopped",
        },
        runtime: "node",
        url: "http://127.0.0.1:4321/",
      }),
    ).toThrow(
      /node exited before becoming ready[\s\S]*status 0[\s\S]*Astro selected background mode[\s\S]*server stopped/,
    );
  });

  it("accepts non-server errors but rejects 5xx responses", () => {
    expect(isReadyResponse(302)).toBe(true);
    expect(isReadyResponse(404)).toBe(true);
    expect(isReadyResponse(500)).toBe(false);
    expect(isReadyResponse(503)).toBe(false);
  });
});
