import { describe, expect, it } from "vitest";
import {
  catalogModelId,
  defaultOpencodeModel,
  filterOpencodeModelsForPlan,
  getOpencodeBaseUrlForPlan,
  getOpencodeTransport,
  getOpencodeModelsUrl,
  isOpencodeModelForPlan,
  opencodeApiModelId,
  opencodePlanFromModelId,
  prefixOpencodeModelId,
  resolveOpencodeRequestModel,
  stripOpencodeModelPrefix,
} from "../../../admin/features/Agent/lib/inference/opencodeProviders";
import {
  CredentialBackendIdSchema,
  InferenceBackendIdSchema,
  buildRemoveInferenceProviderPatch,
  isInferenceConfigPatch,
  mergeAgentSettings,
  parseAgentSettings,
} from "../../../admin/features/Agent/lib/schemas";
import { buildInitialProviderInstance } from "../../../admin/features/Agent/lib/inferenceProviders";

const OC_ID = "22222222-2222-4222-8222-222222222222";

function makeOpenCodeInstance(
  overrides?: Partial<{
    enabled: boolean;
    defaultModelId: string;
    enabledModelIds: string[];
    opencodePlan: "zen" | "go";
  }>,
) {
  return {
    id: OC_ID,
    backend: "opencode" as const,
    label: "OpenCode",
    enabled: true,
    defaultModelId: "opencode/big-pickle",
    enabledModelIds: ["opencode/big-pickle"],
    opencodePlan: "zen" as const,
    ...overrides,
  };
}

describe("OpenCode providers", () => {
  it("uses hosted zen and go base URLs", () => {
    expect(getOpencodeBaseUrlForPlan("zen")).toBe("https://opencode.ai/zen/v1");
    expect(getOpencodeBaseUrlForPlan("go")).toBe(
      "https://opencode.ai/zen/go/v1",
    );
    expect(getOpencodeModelsUrl("zen")).toBe(
      "https://opencode.ai/zen/v1/models",
    );
    expect(getOpencodeModelsUrl("go")).toBe(
      "https://opencode.ai/zen/go/v1/models",
    );
  });

  it("routes models by stored prefix", () => {
    expect(opencodePlanFromModelId("opencode/big-pickle")).toBe("zen");
    expect(opencodePlanFromModelId("opencode-go/kimi-k2.7-code")).toBe("go");
    expect(isOpencodeModelForPlan("opencode/big-pickle", "zen")).toBe(true);
    expect(isOpencodeModelForPlan("opencode/big-pickle", "go")).toBe(false);
    expect(
      filterOpencodeModelsForPlan(
        ["opencode/big-pickle", "opencode-go/deepseek-v4-flash"],
        "go",
      ),
    ).toEqual(["opencode-go/deepseek-v4-flash"]);
    expect(catalogModelId("zen", "big-pickle")).toBe("opencode/big-pickle");
    expect(catalogModelId("go", "kimi-k2.7-code")).toBe(
      "opencode-go/kimi-k2.7-code",
    );
    expect(prefixOpencodeModelId("zen", "big-pickle")).toBe(
      "opencode/big-pickle",
    );
    expect(prefixOpencodeModelId("go", "kimi-k2.7-code")).toBe(
      "opencode-go/kimi-k2.7-code",
    );
    expect(opencodeApiModelId("opencode-go/deepseek-v4-flash")).toBe(
      "deepseek-v4-flash",
    );
    expect(opencodeApiModelId("opencode/big-pickle")).toBe("big-pickle");
    expect(stripOpencodeModelPrefix("opencode/claude-sonnet-4-6")).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("selects the correct gateway protocol from the model id", () => {
    expect(getOpencodeTransport("opencode/gpt-5.4-mini")).toBe(
      "openai-responses",
    );
    expect(getOpencodeTransport("opencode/claude-sonnet-4-6")).toBe(
      "anthropic-messages",
    );
    expect(getOpencodeTransport("opencode/gemini-3.5-flash")).toBe(
      "google-generative-ai",
    );
    expect(getOpencodeTransport("opencode/big-pickle")).toBe(
      "openai-compatible",
    );
    expect(getOpencodeTransport("opencode-go/qwen3.7-plus")).toBe(
      "anthropic-messages",
    );
    expect(getOpencodeTransport("opencode-go/kimi-k2.7-code")).toBe(
      "openai-compatible",
    );
  });

  it("resolves bare model ids to zen by default", () => {
    expect(resolveOpencodeRequestModel("big-pickle")).toEqual({
      plan: "zen",
      modelId: "opencode/big-pickle",
    });
    expect(defaultOpencodeModel()).toBe("opencode/big-pickle");
  });

  it("accepts supported credential backend ids", () => {
    expect(CredentialBackendIdSchema.parse("opencode")).toBe("opencode");
    expect(CredentialBackendIdSchema.parse("openai")).toBe("openai");
    expect(CredentialBackendIdSchema.parse("anthropic")).toBe("anthropic");
    expect(CredentialBackendIdSchema.parse("google")).toBe("google");
    expect(CredentialBackendIdSchema.parse("openrouter")).toBe("openrouter");
    expect(CredentialBackendIdSchema.parse("openai_compatible")).toBe(
      "openai_compatible",
    );
    expect(InferenceBackendIdSchema.parse("openrouter")).toBe("openrouter");
    expect(InferenceBackendIdSchema.parse("anthropic")).toBe("anthropic");
    expect(InferenceBackendIdSchema.parse("google")).toBe("google");
  });

  it("treats enable toggle as non-inference patch", () => {
    expect(isInferenceConfigPatch({ enabled: true })).toBe(false);
    expect(
      isInferenceConfigPatch({
        inference: {
          providerInstances: {
            [OC_ID]: makeOpenCodeInstance(),
          },
        },
      }),
    ).toBe(true);
  });

  it("merges nested provider state", () => {
    const current = parseAgentSettings({});
    const firstInstance = buildInitialProviderInstance(
      "workers_ai",
      "Workers AI",
    );

    const withWorkers = mergeAgentSettings(current, {
      inference: {
        providerInstances: {
          [firstInstance.id]: firstInstance,
        },
      },
    });

    const merged = mergeAgentSettings(withWorkers, {
      inference: {
        providerInstances: {
          [OC_ID]: makeOpenCodeInstance(),
        },
      },
    });

    expect(merged.inference.providerInstances[firstInstance.id]?.enabled).toBe(
      true,
    );
    expect(merged.inference.providerInstances[OC_ID]?.enabledModelIds).toEqual([
      "opencode/big-pickle",
    ]);
  });

  it("allows enabling agent when inference is incomplete", () => {
    const current = parseAgentSettings({
      enabled: false,
      mcpEnabled: true,
    });
    // Add an opencode instance with no enabled models
    const withInstance = mergeAgentSettings(current, {
      inference: {
        providerInstances: {
          [OC_ID]: {
            id: OC_ID,
            backend: "opencode",
            label: "OpenCode",
            enabled: true,
            enabledModelIds: [],
          },
        },
      },
    });

    const merged = mergeAgentSettings(withInstance, { enabled: true });

    expect(merged.enabled).toBe(true);
    expect(merged.inference.providerInstances[OC_ID]?.enabled).toBe(true);
  });

  it("removes provider entries when patch values are null", () => {
    const current = parseAgentSettings({
      inference: {
        default: {
          instanceId: OC_ID,
          modelId: "opencode/big-pickle",
        },
        providerInstances: {
          [OC_ID]: makeOpenCodeInstance(),
        },
      },
    });

    const merged = mergeAgentSettings(
      current,
      buildRemoveInferenceProviderPatch(current, OC_ID),
    );

    expect(merged.inference.providerInstances[OC_ID]).toBeUndefined();
    expect(merged.inference.default).toBeUndefined();
  });
});
