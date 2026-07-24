import { describe, expect, it } from "vitest";
import {
  CreateExternalMcpConnectionInputSchema,
  ExternalMcpDiscoveryResultSchema,
} from "../../../admin/features/Agent/lib/mcp/client/schemas";

describe("external MCP schemas", () => {
  it("accepts only URL-based connection definitions", () => {
    expect(
      CreateExternalMcpConnectionInputSchema.parse({
        name: "Documentation",
        serverUrl: "https://mcp.example.com/mcp",
      }),
    ).toEqual({
      name: "Documentation",
      serverUrl: "https://mcp.example.com/mcp",
    });
  });

  it("marks tools read-only only through validated discovery data", () => {
    expect(
      ExternalMcpDiscoveryResultSchema.parse({
        serverIdentity: "docs@1.0.0",
        manifestFingerprint: "a".repeat(64),
        tools: [
          {
            name: "search",
            inputSchema: { type: "object" },
            readOnly: true,
          },
        ],
      }).tools[0]?.readOnly,
    ).toBe(true);
  });
});
