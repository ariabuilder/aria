import { describe, expect, it } from "vitest";
import { fetchAnthropicCatalog } from "../../../admin/features/Agent/lib/inference/anthropicCatalog";

describe("Anthropic catalog", () => {
  it("uses the Models API headers and follows pages", async () => {
    const originalFetch = globalThis.fetch;
    const requested: URL[] = [];
    let apiKey = "";
    let version = "";
    let calls = 0;

    globalThis.fetch = async (input, init) => {
      requested.push(new URL(String(input)));
      apiKey = String(new Headers(init?.headers).get("x-api-key") ?? "");
      version = String(
        new Headers(init?.headers).get("anthropic-version") ?? "",
      );
      calls += 1;
      return new Response(
        JSON.stringify(
          calls === 1
            ? {
                data: [
                  {
                    id: "claude-sonnet-4-20250514",
                    display_name: "Claude Sonnet 4",
                  },
                ],
                has_more: true,
                last_id: "claude-sonnet-4-20250514",
              }
            : {
                data: [{ id: "claude-haiku-4-20250514" }],
                has_more: false,
              },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      await expect(fetchAnthropicCatalog("test-key")).resolves.toEqual([
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
        { id: "claude-haiku-4-20250514", name: "claude-haiku-4-20250514" },
      ]);
      expect(requested[0]?.pathname).toBe("/v1/models");
      expect(requested[0]?.searchParams.get("limit")).toBe("1000");
      expect(requested[1]?.searchParams.get("after_id")).toBe(
        "claude-sonnet-4-20250514",
      );
      expect(apiKey).toBe("test-key");
      expect(version).toBe("2023-06-01");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on provider errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("Unauthorized", { status: 401 });
    try {
      await expect(fetchAnthropicCatalog("bad-key")).rejects.toThrow(
        "Anthropic models request failed (401)",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
