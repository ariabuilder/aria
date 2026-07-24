/**
 * DO stub resolution for Astro Actions (getChatHistory, clearChat). Imported by
 * the Actions graph — do not statically import `agents`.
 */

import {
  getCloudflareEnv,
  type RuntimeLocals,
} from "../../../../lib/cloudflare/env";
import { getStorageAdapterAsync } from "../../../../lib/storage/getStorageAdapter";
import { AGENT_DO_BINDING_NAME } from "../lib/constants";
import type { AgentChatMessage } from "../lib/schemas";
import { resolveAgentDoName, resolveSiteId } from "../lib/siteId";
import { resolveRuntimePlatform } from "../lib/platform";

/** RPC surface used by Actions — avoids importing the DO class into the Actions graph. */
interface AgentChatDoStub {
  getPersistedChatHistory(): Promise<AgentChatMessage[]>;
  clearPersistedChatHistory(): Promise<void>;
}

export async function resolveAgentDoStub(input: {
  locals: App.Locals;
  userId: string;
  request: Request;
}): Promise<AgentChatDoStub | null> {
  const platform = await resolveRuntimePlatform(input.locals);
  if (platform !== "cloudflare") {
    return null;
  }

  const env = getCloudflareEnv(input.locals as RuntimeLocals);
  const namespaceBinding = env[AGENT_DO_BINDING_NAME];
  if (
    !namespaceBinding ||
    typeof namespaceBinding !== "object" ||
    !("get" in namespaceBinding)
  ) {
    return null;
  }

  const namespace = namespaceBinding as DurableObjectNamespace;
  const adapter = await getStorageAdapterAsync(input.locals);
  const siteSettings = await adapter.getSiteSettings();
  const siteId = resolveSiteId({
    siteSettings,
    request: input.request,
  });
  const doName = resolveAgentDoName({ siteId, userId: input.userId });

  // getAgentByName bootstraps PartyServer/Agents DOs via setName() — same as routes.ts.
  const { getAgentByName } = await import("agents");
  return getAgentByName(namespace, doName);
}
