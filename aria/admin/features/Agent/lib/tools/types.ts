import type { ActionAPIContext } from "astro:actions";
import type { SessionUser } from "../../../../../lib/auth/types";
import type { AgentShellContext, McpScope } from "../schemas";

export type ToolTransport = "studio_ws" | "studio_http" | "mcp";

export interface ToolContext {
  transport: ToolTransport;
  userId: string | null;
  siteId: string;
  scopes: McpScope[];
  shellContext?: AgentShellContext;
  actorLabel: string;
  tokenId?: string;
}

export type AgentToolActionContext = Pick<
  ActionAPIContext,
  "locals" | "request"
> & {
  user: SessionUser | null;
};

export const CLIENT_TOOL_NAMES = [
  "open_in_composer",
  "insert_nodes",
  "select_block",
  "update_node_motion",
  "upload_custom_font",
] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

export function isClientToolName(name: string): name is ClientToolName {
  return (CLIENT_TOOL_NAMES as readonly string[]).includes(name);
}
