import { describe, expect, it } from "vitest";
import { buildCloudflareGatewayRequestConfig } from "../../../admin/features/Agent/lib/usage/gatewayMetadata";

describe("Cloudflare AI Gateway request metadata", () => {
  it("keeps direct BYOK requests off Gateway", async () => {
    await expect(
      buildCloudflareGatewayRequestConfig({
        route: { type: "direct" },
        backend: "openai",
        metadata: {
          siteId: "example.com",
          userId: "user-1",
          requestId: "request-1",
          turnId: "turn-1",
          feature: "studio_agent",
        },
      }),
    ).resolves.toBeNull();
  });

  it("uses opaque tenant identifiers and disables payload logging", async () => {
    const config = await buildCloudflareGatewayRequestConfig({
      route: {
        type: "cloudflare_ai_gateway",
        accountId: "account",
        gatewayId: "aria",
        collectLogPayload: false,
      },
      backend: "openrouter",
      metadata: {
        siteId: "example.com",
        userId: "user-1",
        requestId: "request-1",
        turnId: "turn-1",
        feature: "studio_agent",
      },
    });

    expect(config?.baseURL).toBe(
      "https://gateway.ai.cloudflare.com/v1/account/aria/openrouter",
    );
    expect(config?.headers["cf-aig-collect-log-payload"]).toBe("false");
    expect(config?.headers["cf-aig-metadata"]).not.toContain("example.com");
    expect(config?.headers["cf-aig-metadata"]).not.toContain("user-1");
  });

  it("rejects unsupported provider routes", async () => {
    await expect(
      buildCloudflareGatewayRequestConfig({
        route: {
          type: "cloudflare_ai_gateway",
          accountId: "account",
          gatewayId: "aria",
          collectLogPayload: false,
        },
        backend: "openai_compatible",
        metadata: {
          siteId: "example.com",
          userId: "user-1",
          requestId: "request-1",
          turnId: "turn-1",
          feature: "studio_agent",
        },
      }),
    ).rejects.toThrow(/unsupported/i);
  });
});
