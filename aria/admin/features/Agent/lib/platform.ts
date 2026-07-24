import type { RuntimeLocals } from "../../../../lib/cloudflare/env";
import { getStorageAdapterAsync } from "../../../../lib/storage/getStorageAdapter";
import type { AgentPlatform } from "./schemas";

export async function resolveRuntimePlatform(
  locals: RuntimeLocals,
): Promise<AgentPlatform> {
  const adapter = await getStorageAdapterAsync(locals);
  if (typeof adapter.getAdapterInfo === "function") {
    const info = await adapter.getAdapterInfo();
    return info.platform === "cloudflare" ? "cloudflare" : "local";
  }
  return "local";
}
