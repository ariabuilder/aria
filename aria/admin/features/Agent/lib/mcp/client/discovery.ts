import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertSafeRemoteUrl } from "../../../../../../lib/security/remoteDownload";
import {
  CallExternalMcpReadToolInputSchema,
  ExternalMcpDiscoveryResultSchema,
  ExternalMcpReadResultSchema,
  type ExternalMcpConnection,
  type ExternalMcpDiscoveryResult,
  type ExternalMcpReadResult,
} from "./schemas";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function callExternalMcpReadTool(input: {
  connection: ExternalMcpConnection;
  value: unknown;
}): Promise<ExternalMcpReadResult> {
  const value = CallExternalMcpReadToolInputSchema.parse(input.value);
  if (!input.connection.enabled || !input.connection.manifestFingerprint) {
    throw new Error("External MCP connection is not approved and enabled");
  }
  const discovery = await discoverExternalMcpServer(
    input.connection.serverUrl,
  );
  if (
    discovery.manifestFingerprint !== input.connection.manifestFingerprint ||
    discovery.serverIdentity !== input.connection.serverIdentity
  ) {
    throw new Error(
      "External MCP manifest changed after approval; rediscovery is required",
    );
  }
  const approvedTool = discovery.tools.find(
    (tool) => tool.name === value.toolName && tool.readOnly,
  );
  if (!approvedTool) {
    throw new Error("External MCP tool is not approved as read-only");
  }

  const url = assertSafeRemoteUrl(input.connection.serverUrl);
  const client = new Client(
    { name: "aria-mcp-client", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(url);
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: approvedTool.name,
      arguments: value.input,
    });
    return ExternalMcpReadResultSchema.parse({
      source: "external_mcp",
      connectionId: input.connection.id,
      serverIdentity: discovery.serverIdentity,
      toolName: approvedTool.name,
      trust: "untrusted",
      content: result,
    });
  } finally {
    await transport.close();
  }
}

export async function discoverExternalMcpServer(
  serverUrl: string,
): Promise<ExternalMcpDiscoveryResult> {
  const url = assertSafeRemoteUrl(serverUrl);
  const client = new Client(
    { name: "aria-mcp-client", version: "1.0.0" },
    // No sampling, roots, or elicitation capabilities are advertised.
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(url);

  try {
    await client.connect(transport);
    const serverVersion = client.getServerVersion();
    const listed = await client.listTools();
    const tools = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      readOnly:
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint !== true,
    }));
    const serverIdentity = serverVersion
      ? `${serverVersion.name}@${serverVersion.version}`
      : new URL(serverUrl).origin;
    const manifestFingerprint = await sha256(
      JSON.stringify({ serverIdentity, tools }),
    );
    return ExternalMcpDiscoveryResultSchema.parse({
      serverIdentity,
      manifestFingerprint,
      tools,
    });
  } finally {
    await transport.close();
  }
}
