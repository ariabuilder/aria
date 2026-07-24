import { describe, expect, it } from "vitest";
import {
  computeAgentContextUsage,
  estimateTokenCount,
  formatTokenCount,
  getModelContextLimit,
  resolveContextUsageTone,
} from "../../../admin/features/Agent/lib/contextUsage";

describe("context usage", () => {
  it("estimates tokens monotonically from text length", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("hello")).toBeGreaterThan(0);
    expect(estimateTokenCount("hello world")).toBeGreaterThan(
      estimateTokenCount("hello"),
    );
  });

  it("formats token counts for display", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(850)).toBe("~850");
    expect(formatTokenCount(12400)).toBe("~12k");
    expect(formatTokenCount(128000)).toBe("~128k");
  });

  it("is zero when chat and draft are empty", () => {
    const usage = computeAgentContextUsage({
      messages: [],
      draft: "",
      provider: "opencode",
      modelId: "opencode/big-pickle",
    });

    expect(usage.estimatedTokens).toBe(0);
    expect(usage.fillRatio).toBe(0);
    expect(usage.percentUsed).toBe(0);
    expect(usage.tone).toBe("normal");
  });

  it("includes messages and draft only", () => {
    const usage = computeAgentContextUsage({
      messages: [
        {
          id: "1",
          role: "user",
          content: "Explain pages",
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          role: "assistant",
          content: "Pages are the top-level site entries in Aria.",
          createdAt: new Date().toISOString(),
        },
      ],
      draft: "What about components?",
      provider: "opencode",
      modelId: "opencode-go/deepseek-v4-flash",
    });

    expect(usage.breakdown.messageTokens).toBeGreaterThan(0);
    expect(usage.breakdown.draftTokens).toBeGreaterThan(0);
    expect(usage.estimatedTokens).toBe(
      usage.breakdown.messageTokens + usage.breakdown.draftTokens,
    );
  });

  it("resolves model and provider context limits", () => {
    expect(getModelContextLimit("opencode/big-pickle", "opencode")).toBe(128000);
    expect(getModelContextLimit("@cf/meta/llama-3.2-3b-instruct", "workers_ai")).toBe(
      8192,
    );
    expect(getModelContextLimit("unknown-model", "openai")).toBe(128000);
  });

  it("uses fractional fill ratio for smooth ring progress", () => {
    const usage = computeAgentContextUsage({
      messages: [
        {
          id: "1",
          role: "user",
          content: "Hello",
          createdAt: new Date().toISOString(),
        },
      ],
      draft: "",
      provider: "opencode",
      modelId: "opencode/big-pickle",
    });

    expect(usage.fillRatio).toBeGreaterThan(0);
    expect(usage.fillRatio).toBeLessThan(0.01);
    expect(usage.percentUsed).toBe(0);
  });

  it("clamps percent used and resolves warning tones", () => {
    const usage = computeAgentContextUsage({
      messages: Array.from({ length: 40 }, (_, index) => ({
        id: String(index),
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: "x".repeat(4000),
        createdAt: new Date().toISOString(),
      })),
      draft: "y".repeat(4000),
      provider: "workers_ai",
      modelId: "@cf/meta/llama-3.2-3b-instruct",
    });

    expect(usage.fillRatio).toBeLessThanOrEqual(1);
    expect(usage.percentUsed).toBeLessThanOrEqual(100);
    expect(resolveContextUsageTone(usage.percentUsed)).toBe("critical");
    expect(resolveContextUsageTone(75)).toBe("warning");
    expect(resolveContextUsageTone(20)).toBe("normal");
  });
});
