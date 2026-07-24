import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStorageAdapterAsyncMock,
  parseBearerTokenMock,
  resolveMcpTokenAuthMock,
  getAuthAdapterAsyncMock,
  assertMcpScopesAllowedForUserMock,
  handleMcpHttpRequestMock,
} = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
  parseBearerTokenMock: vi.fn(),
  resolveMcpTokenAuthMock: vi.fn(),
  getAuthAdapterAsyncMock: vi.fn(),
  assertMcpScopesAllowedForUserMock: vi.fn(),
  handleMcpHttpRequestMock: vi.fn(),
}));

vi.mock("../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: getStorageAdapterAsyncMock,
}));

vi.mock("../../../lib/auth", () => ({
  getAuthAdapterAsync: getAuthAdapterAsyncMock,
  hasEffectiveCapability: vi.fn(),
}));

vi.mock("../../../admin/features/Agent/lib/mcp/tokenStore", () => ({
  parseBearerToken: parseBearerTokenMock,
  resolveMcpTokenAuth: resolveMcpTokenAuthMock,
}));

vi.mock("../../../admin/features/Agent/lib/mcp/scopes", () => ({
  assertMcpScopesAllowedForUser: assertMcpScopesAllowedForUserMock,
}));

vi.mock("../../../admin/features/Agent/server/mcp/server", () => ({
  handleMcpHttpRequest: handleMcpHttpRequestMock,
}));

import { handleMcpRoute } from "../../../admin/features/Agent/server/routes";

describe("MCP route gating", () => {
  const storageAdapter = { getSiteSettings: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    getStorageAdapterAsyncMock.mockResolvedValue(storageAdapter);
  });

  it("rejects requests before looking up a token when MCP has not been enabled", async () => {
    storageAdapter.getSiteSettings.mockResolvedValue({
      agent: { mcpEnabled: false },
    });

    const response = await handleMcpRoute(
      new Request("https://example.com/mcp"),
      {},
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("MCP is disabled for this site");
    expect(parseBearerTokenMock).not.toHaveBeenCalled();
    expect(resolveMcpTokenAuthMock).not.toHaveBeenCalled();
  });

  it("serves a valid token when MCP is enabled", async () => {
    storageAdapter.getSiteSettings.mockResolvedValue({
      agent: { mcpEnabled: true },
    });
    parseBearerTokenMock.mockReturnValue("aria_mcp_token");
    resolveMcpTokenAuthMock.mockResolvedValue({
      id: "660e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      createdByUserId: "550e8400-e29b-41d4-a716-446655440000",
      scopes: ["mcp:read"],
    });
    getAuthAdapterAsyncMock.mockResolvedValue({
      getUserById: vi.fn().mockResolvedValue({
        id: "550e8400-e29b-41d4-a716-446655440000",
        username: "admin",
      }),
    });
    handleMcpHttpRequestMock.mockResolvedValue(new Response("ok"));

    const response = await handleMcpRoute(
      new Request("https://example.com/mcp", {
        headers: { Authorization: "Bearer aria_mcp_token" },
      }),
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(handleMcpHttpRequestMock).toHaveBeenCalledOnce();
  });
});
