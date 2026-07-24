import { describe, expect, it } from "vitest";
import {
  canUseChatInference,
  listAvailableChatInferenceModes,
  resolveActiveChatInference,
} from "../../../admin/features/Agent/lib/chatInference";
import { mergeAgentSettings } from "../../../admin/features/Agent/lib/schemas";

const WA_ID = "11111111-1111-4111-8111-111111111111";
const OC_ID = "22222222-2222-4222-8222-222222222222";
const OR_ID = "33333333-3333-4333-8333-333333333333";

const cloudflareAvailability = {
  canUseStudioAgent: true,
  canShowAgentShell: true,
  platform: "cloudflare" as const,
  siteEnabled: true,
  mcpEnabled: true,
  durableAgentAvailable: true,
  workersAiAvailable: true,
  configuredBackends: {
    opencode: true,
  },
  effectiveInferenceBackend: "opencode" as const,
};

function bothProvidersSettings() {
  return mergeAgentSettings(undefined, {
    inference: {
      default: {
        instanceId: OC_ID,
        modelId: "opencode/big-pickle",
      },
      providerInstances: {
        [WA_ID]: {
          id: WA_ID,
          backend: "workers_ai",
          label: "Workers AI",
          enabled: true,
          defaultModelId: "@cf/meta/llama-3.2-3b-instruct",
          enabledModelIds: ["@cf/meta/llama-3.2-3b-instruct"],
        },
        [OC_ID]: {
          id: OC_ID,
          backend: "opencode",
          label: "OpenCode",
          enabled: true,
          defaultModelId: "opencode/big-pickle",
          enabledModelIds: ["opencode/big-pickle"],
          opencodePlan: "zen",
        },
      },
    },
  });
}

describe("chat inference selection", () => {
  it("lists both workers ai and opencode on cloudflare when both are active", () => {
    expect(
      listAvailableChatInferenceModes({
        platform: "cloudflare",
        siteSettings: bothProvidersSettings(),
        workersAiAvailable: true,
        configuredBackends: { opencode: true },
      }),
    ).toEqual(["workers_ai", "opencode"]);
  });

  it("defaults to site default provider when session has no override", () => {
    expect(
      resolveActiveChatInference({
        siteSettings: bothProvidersSettings(),
        availability: cloudflareAvailability,
      }),
    ).toEqual({
      instanceId: OC_ID,
      provider: "opencode",
      modelId: "opencode/big-pickle",
    });
  });

  it("honors session provider override when available", () => {
    expect(
      resolveActiveChatInference({
        siteSettings: bothProvidersSettings(),
        availability: cloudflareAvailability,
        sessionOverride: {
          inferenceProvider: "workers_ai",
          modelId: "@cf/meta/llama-3.2-3b-instruct",
        },
      }),
    ).toEqual({
      instanceId: WA_ID,
      provider: "workers_ai",
      modelId: "@cf/meta/llama-3.2-3b-instruct",
    });
  });

  it("allows chat when both providers are active", () => {
    expect(
      canUseChatInference({
        settings: bothProvidersSettings(),
        platform: "cloudflare",
        workersAiAvailable: true,
        configuredBackends: { opencode: true },
      }),
    ).toBe(true);
  });

  it("uses an enabled Go model as the OpenCode default", () => {
    const settings = mergeAgentSettings(undefined, {
      inference: {
        default: {
          instanceId: OC_ID,
          modelId: "opencode-go/deepseek-v4-flash",
        },
        providerInstances: {
          [OC_ID]: {
            id: OC_ID,
            backend: "opencode",
            label: "OpenCode",
            enabled: true,
            opencodePlan: "go",
            defaultModelId: "opencode-go/deepseek-v4-flash",
            enabledModelIds: [
              "opencode/big-pickle",
              "opencode-go/deepseek-v4-flash",
              "opencode-go/deepseek-v4-pro",
            ],
          },
        },
      },
    });

    expect(
      resolveActiveChatInference({
        siteSettings: settings,
        availability: cloudflareAvailability,
      }),
    ).toEqual({
      instanceId: OC_ID,
      provider: "opencode",
      modelId: "opencode-go/deepseek-v4-flash",
    });
  });

  it("accepts a Zen session override alongside enabled Go models", () => {
    const settings = mergeAgentSettings(undefined, {
      inference: {
        providerInstances: {
          [OC_ID]: {
            id: OC_ID,
            backend: "opencode",
            label: "OpenCode",
            enabled: true,
            opencodePlan: "go",
            defaultModelId: "opencode-go/deepseek-v4-flash",
            enabledModelIds: [
              "opencode/big-pickle",
              "opencode-go/deepseek-v4-flash",
            ],
          },
        },
      },
    });

    expect(
      resolveActiveChatInference({
        siteSettings: settings,
        availability: cloudflareAvailability,
        sessionOverride: {
          inferenceProvider: "opencode",
          modelId: "opencode/big-pickle",
        },
      }),
    ).toEqual({
      instanceId: OC_ID,
      provider: "opencode",
      modelId: "opencode/big-pickle",
    });
  });

  it("lists openrouter when configured and enabled", () => {
    const settings = mergeAgentSettings(undefined, {
      inference: {
        providerInstances: {
          [OR_ID]: {
            id: OR_ID,
            backend: "openrouter",
            label: "OpenRouter",
            enabled: true,
            defaultModelId: "openai/gpt-4o-mini",
            enabledModelIds: ["openai/gpt-4o-mini"],
          },
        },
      },
    });

    expect(
      listAvailableChatInferenceModes({
        platform: "local",
        siteSettings: settings,
        workersAiAvailable: false,
        configuredBackends: { openrouter: true },
      }),
    ).toEqual(["openrouter"]);

    expect(
      resolveActiveChatInference({
        siteSettings: settings,
        availability: {
          ...cloudflareAvailability,
          platform: "local",
          workersAiAvailable: false,
          configuredBackends: { openrouter: true },
          effectiveInferenceBackend: "openrouter",
        },
        sessionOverride: undefined,
      }),
    ).toEqual({
      instanceId: OR_ID,
      provider: "openrouter",
      modelId: "openai/gpt-4o-mini",
    });
  });
});
