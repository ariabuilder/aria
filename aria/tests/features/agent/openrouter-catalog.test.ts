import { describe, expect, it } from "vitest";
import {
  fetchOpenRouterCatalog,
  OPENROUTER_API_BASE,
} from "../../../admin/features/Agent/lib/inference/openrouterCatalog";

describe("OpenRouter catalog", () => {
  it("uses the OpenRouter API base URL", () => {
    expect(OPENROUTER_API_BASE).toBe("https://openrouter.ai/api/v1");
  });

  it("requests tool-capable text models with bearer auth", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let authHeader = "";

    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      authHeader = String(
        new Headers(init?.headers).get("Authorization") ?? "",
      );
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "openai/gpt-4o-mini",
              name: "OpenAI: GPT-4o Mini",
            },
            {
              id: "anthropic/claude-sonnet-4",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      const models = await fetchOpenRouterCatalog("test-key");
      expect(requestedUrl).toContain(
        `${OPENROUTER_API_BASE}/models?supported_parameters=tools&output_modalities=text`,
      );
      expect(authHeader).toBe("Bearer test-key");
      expect(models).toEqual([
        {
          id: "anthropic/claude-sonnet-4",
          name: "anthropic/claude-sonnet-4",
        },
        {
          id: "openai/gpt-4o-mini",
          name: "OpenAI: GPT-4o Mini",
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses realistic OpenRouter payloads with extra model fields", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [
            {
              id: "openai/gpt-4o-mini",
              name: "OpenAI: GPT-4o Mini",
              context_length: 128000,
              pricing: { prompt: "0.00000015", completion: "0.0000006" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    try {
      const models = await fetchOpenRouterCatalog("test-key");
      expect(models).toEqual([
        { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o Mini" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on non-OK responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("Unauthorized", { status: 401 });

    try {
      await expect(fetchOpenRouterCatalog("bad-key")).rejects.toThrow(
        "OpenRouter models request failed (401)",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
