import type { CredentialBackendId } from "./schemas";
export { AGENT_MAX_MESSAGES } from "../../../../lib/agent/constants";

export const AGENT_WS_PATH_PREFIX = "/agents/aria-studio-agent" as const;
export const AGENT_MCP_PATH = "/mcp" as const;
export const AGENT_DO_BINDING_NAME = "aria_studio_agent" as const;
export const AGENT_AI_BINDING_NAME = "ai" as const;
/** Max tool-loop steps per agent turn (CMS create often needs inventory + relations + write). */
export const AGENT_MAX_STEPS = 16 as const;
export const AGENT_BYOK_MASTER_KEY_CONFIG = "agent_byok_master_key" as const;
export const AGENT_OPEN_EVENT = "aria:open-agent" as const;
export const AGENT_PAGE_SEO_UPDATED_EVENT =
  "aria:agent-page-seo-updated" as const;

export function getAgentCredentialsKey(
  backend: CredentialBackendId,
): string {
  return `agent_credentials_${backend}` as const;
}
