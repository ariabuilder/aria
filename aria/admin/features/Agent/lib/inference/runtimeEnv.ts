import {
  getCloudflareEnv,
  type RuntimeLocals,
} from "../../../../../lib/cloudflare/env";
import type { AgentInferenceEnv } from "./resolveModel";

export function getAgentInferenceEnv(
  locals: RuntimeLocals | undefined,
): AgentInferenceEnv {
  const env = getCloudflareEnv(locals);
  const ai = env.ai;
  return {
    ai: ai && typeof ai === "object" ? (ai as Ai) : undefined,
  };
}

export function hasWorkersAiBinding(
  locals: RuntimeLocals | undefined,
): boolean {
  return Boolean(getAgentInferenceEnv(locals).ai);
}

export function hasAgentDurableObjectBinding(
  locals: RuntimeLocals | undefined,
): boolean {
  return Boolean(getCloudflareEnv(locals).aria_studio_agent);
}
