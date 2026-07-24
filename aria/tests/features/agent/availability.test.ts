import { describe, expect, it } from "vitest";
import { resolveAgentAvailability } from "../../../admin/features/Agent/lib/availability";
import { AgentAvailabilitySchema } from "../../../admin/features/Agent/lib/schemas";
import {
  AgentWsChatResponseFrameSchema,
  applyAgentStreamChunk,
  createAgentStreamAccumulatorState,
} from "../../../admin/features/Agent/lib/wsChatProtocol";
import type { SessionUser } from "../../../lib/auth/types";

const adminUser: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

describe("resolveAgentAvailability", () => {
  it("returns feature_off when studio.agent kill switch is off", () => {
    const result = resolveAgentAvailability({
      platform: "cloudflare",
      featureEnabled: false,
      user: adminUser,
      siteSettings: {
        agent: {
          enabled: true,
          mcpEnabled: true,
          skills: [],
          inference: { providerInstances: {} },
        },
      },
      workersAiBindingPresent: true,
      configuredBackends: {},
      durableAgentAvailable: true,
    });

    expect(AgentAvailabilitySchema.parse(result)).toMatchObject({
      canShowAgentShell: false,
      reason: "feature_off",
    });
  });

  it("requires inference setup when a listed provider has no credentials", () => {
    const result = resolveAgentAvailability({
      platform: "local",
      featureEnabled: true,
      user: adminUser,
      siteSettings: {
        agent: {
          enabled: true,
          mcpEnabled: true,
          skills: [],
          inference: {
            providerInstances: {
              "22222222-2222-4222-8222-222222222222": {
                id: "22222222-2222-4222-8222-222222222222",
                backend: "openai",
                label: "OpenAI",
                enabled: true,
                enabledModelIds: ["gpt-4.1-mini"],
              },
            },
          },
        },
      },
      workersAiBindingPresent: false,
      configuredBackends: {},
      durableAgentAvailable: false,
    });

    expect(AgentAvailabilitySchema.parse(result)).toMatchObject({
      canUseStudioAgent: true,
      reason: "inference_setup_required",
      effectiveInferenceBackend: "unavailable",
    });
  });

  it("allows chat on local when OpenCode is configured", () => {
    const result = resolveAgentAvailability({
      platform: "local",
      featureEnabled: true,
      user: adminUser,
      siteSettings: {
        agent: {
          enabled: true,
          mcpEnabled: true,
          skills: [],
          inference: {
            default: {
              instanceId: "22222222-2222-4222-8222-222222222222",
              modelId: "opencode/big-pickle",
            },
            providerInstances: {
              "22222222-2222-4222-8222-222222222222": {
                id: "22222222-2222-4222-8222-222222222222",
                backend: "opencode",
                label: "OpenCode",
                enabled: true,
                defaultModelId: "opencode/big-pickle",
                enabledModelIds: ["opencode/big-pickle"],
                opencodePlan: "zen",
              },
            },
          },
        },
      },
      workersAiBindingPresent: false,
      configuredBackends: { opencode: true },
      durableAgentAvailable: false,
    });

    expect(AgentAvailabilitySchema.parse(result)).toMatchObject({
      canUseStudioAgent: true,
      effectiveInferenceBackend: "opencode",
    });
    expect(result.reason).toBeUndefined();
  });

  it("allows Cloudflare BYOK chat without Workers AI when the agent binding exists", () => {
    const result = resolveAgentAvailability({
      platform: "cloudflare",
      featureEnabled: true,
      user: adminUser,
      siteSettings: {
        agent: {
          enabled: true,
          mcpEnabled: true,
          skills: [],
          inference: {
            default: {
              instanceId: "22222222-2222-4222-8222-222222222222",
              modelId: "opencode/big-pickle",
            },
            providerInstances: {
              "22222222-2222-4222-8222-222222222222": {
                id: "22222222-2222-4222-8222-222222222222",
                backend: "opencode",
                label: "OpenCode",
                enabled: true,
                defaultModelId: "opencode/big-pickle",
                enabledModelIds: ["opencode/big-pickle"],
                opencodePlan: "zen",
              },
            },
          },
        },
      },
      workersAiBindingPresent: false,
      configuredBackends: { opencode: true },
      durableAgentAvailable: true,
    });

    expect(AgentAvailabilitySchema.parse(result)).toMatchObject({
      canUseStudioAgent: true,
      durableAgentAvailable: true,
      workersAiAvailable: false,
      effectiveInferenceBackend: "opencode",
    });
    expect(result.reason).toBeUndefined();
  });
});

describe("ws chat protocol", () => {
  it("accumulates incremental text-delta chunks", () => {
    const state = createAgentStreamAccumulatorState();
    applyAgentStreamChunk(
      state,
      JSON.stringify({ type: "text-start", id: "msg-1" }),
    );
    expect(
      applyAgentStreamChunk(
        state,
        JSON.stringify({ type: "text-delta", id: "msg-1", delta: "Hello" }),
      ),
    ).toBe("Hello");
    expect(
      applyAgentStreamChunk(
        state,
        JSON.stringify({ type: "text-delta", id: "msg-1", delta: " world" }),
      ),
    ).toBe("Hello world");
  });

  it("parses response frames", () => {
    const frame = AgentWsChatResponseFrameSchema.parse({
      type: "cf_agent_use_chat_response",
      id: "abc12345",
      body: JSON.stringify({ type: "text-delta", delta: "Hi" }),
      done: false,
      continuation: true,
      replay: true,
      replayComplete: false,
    });
    expect(frame.id).toBe("abc12345");
    expect(frame.continuation).toBe(true);
  });

  it("ignores consecutive duplicate text-delta chunks", () => {
    const state = createAgentStreamAccumulatorState();
    applyAgentStreamChunk(
      state,
      JSON.stringify({ type: "text-start", id: "msg-1" }),
    );
    applyAgentStreamChunk(
      state,
      JSON.stringify({ type: "text-delta", id: "msg-1", delta: "As Aria" }),
    );
    expect(
      applyAgentStreamChunk(
        state,
        JSON.stringify({ type: "text-delta", id: "msg-1", delta: "As Aria" }),
      ),
    ).toBe("As Aria");
    expect(
      applyAgentStreamChunk(
        state,
        JSON.stringify({ type: "text-delta", id: "msg-1", delta: " Engineer" }),
      ),
    ).toBe("As Aria Engineer");
  });
});
