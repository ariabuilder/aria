import { describe, expect, it } from "vitest";
import {
  listOpencodeRecommendedModelIds,
  listAnthropicRecommendedModelIds,
  listGoogleRecommendedModelIds,
  listOpenAiRecommendedModelIds,
  listOpenRouterRecommendedModelIds,
  listRecommendedModelIds,
  listWorkersAiRecommendedModelIds,
} from "../../../admin/features/Agent/lib/inference/recommendedModels";
import { catalogModelId } from "../../../admin/features/Agent/lib/inference/opencodeProviders";
import type { CatalogModel } from "../../../admin/features/Agent/lib/schemas";
import { mergeAgentSettings } from "../../../admin/features/Agent/lib/schemas";

describe("recommendedModels", () => {
  it("enables zen free models and curated picks for OpenCode", () => {
    const catalog: CatalogModel[] = [
      { id: "opencode/big-pickle", name: "Big Pickle" },
      { id: "opencode/gpt-5.4-mini", name: "GPT 5.4 Mini" },
      { id: "opencode/deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free" },
      { id: "opencode/claude-opus-4-8", name: "Claude Opus 4.8" },
      { id: "opencode-go/kimi-k2.7-code", name: "Kimi K2.7 Code" },
    ];

    const recommended = listOpencodeRecommendedModelIds("zen", catalog);

    expect(recommended).toContain("opencode/big-pickle");
    expect(recommended).toContain("opencode/deepseek-v4-flash-free");
    expect(recommended).toContain("opencode/gpt-5.4-mini");
    expect(recommended).not.toContain("opencode-go/kimi-k2.7-code");
    expect(recommended).not.toContain("opencode/claude-opus-4-8");
  });

  it("enables go-plan models separately from zen", () => {
    const catalog: CatalogModel[] = [
      {
        id: catalogModelId("go", "deepseek-v4-flash"),
        name: "DeepSeek V4 Flash",
      },
      { id: catalogModelId("go", "kimi-k2.7-code"), name: "Kimi K2.7 Code" },
      { id: "opencode/big-pickle", name: "Big Pickle" },
    ];

    const recommended = listOpencodeRecommendedModelIds("go", catalog);

    expect(recommended).toContain("opencode-go/deepseek-v4-flash");
    expect(recommended).toContain("opencode-go/kimi-k2.7-code");
    expect(recommended).not.toContain("opencode/big-pickle");
  });

  it("merges OpenAI seeds with curated catalog matches", () => {
    const catalog: CatalogModel[] = [
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ];

    const recommended = listOpenAiRecommendedModelIds(catalog, [
      "gpt-4.1-mini",
      "gpt-4.1",
    ]);

    expect(recommended).toEqual(["gpt-4.1-mini", "gpt-4.1", "gpt-4o"]);
  });

  it("merges OpenRouter seeds with curated catalog matches", () => {
    const catalog: CatalogModel[] = [
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
    ];

    const recommended = listOpenRouterRecommendedModelIds(catalog, [
      "openai/gpt-4o-mini",
    ]);

    expect(recommended).toEqual([
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4",
    ]);
  });

  it("keeps Anthropic and Google recommendations within each key's catalog", () => {
    expect(
      listAnthropicRecommendedModelIds(
        [
          { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
          { id: "claude-haiku-4-20250514", name: "Claude Haiku 4" },
        ],
        ["claude-sonnet-4-20250514"],
      ),
    ).toEqual(["claude-sonnet-4-20250514"]);

    expect(
      listGoogleRecommendedModelIds(
        [
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
        ],
        ["gemini-2.5-flash"],
      ),
    ).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });

  const OR_ID = "33333333-3333-4333-8333-333333333333";

  it("routes OpenRouter through listRecommendedModelIds", () => {
    const settings = mergeAgentSettings(undefined, {
      inference: {
        providerInstances: {
          [OR_ID]: {
            id: OR_ID,
            backend: "openrouter",
            label: "OpenRouter",
            enabled: true,
            defaultModelId: "openai/gpt-4o-mini",
            enabledModelIds: [],
          },
        },
      },
    });

    const recommended = listRecommendedModelIds({
      backendId: "openrouter",
      settings,
      catalog: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
        { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    expect(recommended).toContain("openai/gpt-4o-mini");
    expect(recommended).toContain("anthropic/claude-sonnet-4");
  });

  it("keeps Workers AI recommendations to the curated edge set", () => {
    const catalog: CatalogModel[] = [
      { id: "@cf/meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B" },
      { id: "@cf/meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B" },
      { id: "@cf/random/other-model", name: "Other" },
    ];

    const recommended = listWorkersAiRecommendedModelIds(catalog, [
      "@cf/meta/llama-3.2-3b-instruct",
    ]);

    expect(recommended).toContain("@cf/meta/llama-3.2-3b-instruct");
    expect(recommended).toContain("@cf/meta/llama-3.2-1b-instruct");
    expect(recommended).not.toContain("@cf/random/other-model");
  });

  const OC_ID = "22222222-2222-4222-8222-222222222222";

  it("recommends Zen and Go models together for OpenCode", () => {
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
            enabledModelIds: [],
          },
        },
      },
    });

    const recommended = listRecommendedModelIds({
      backendId: "opencode",
      settings,
      catalog: [
        {
          id: "opencode-go/deepseek-v4-flash",
          name: "DeepSeek V4 Flash",
        },
        { id: "opencode/big-pickle", name: "Big Pickle" },
      ],
    });

    expect(recommended).toEqual([
      "opencode/big-pickle",
      "opencode-go/deepseek-v4-flash",
    ]);
  });
});
