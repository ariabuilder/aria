import { describe, expect, it } from "vitest";

import { formatTrafficErrorMessage } from "../../../lib/metrics/trafficErrors";

describe("formatTrafficErrorMessage", () => {
  it("maps query_failed to a friendly message", () => {
    expect(formatTrafficErrorMessage("query_failed")).toContain("API token");
    expect(formatTrafficErrorMessage("query_failed")).not.toBe("query_failed");
  });

  it("maps analytics_forbidden to Analytics Read guidance", () => {
    const message = formatTrafficErrorMessage("analytics_forbidden");

    expect(message).toContain("Cloudflare denied analytics access");
    expect(message).toContain("Analytics Read");
    expect(message).toContain("includes this zone");
  });
});
