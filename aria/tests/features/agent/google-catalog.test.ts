import { describe, expect, it } from "vitest";
import { fetchGoogleCatalog } from "../../../admin/features/Agent/lib/inference/googleCatalog";

describe("Google AI catalog", () => {
  it("uses API-key auth, filters generate-content models, and follows pages", async () => {
    const originalFetch = globalThis.fetch;
    const requested: URL[] = [];
    let apiKey = "";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      requested.push(new URL(String(input)));
      apiKey = String(new Headers(init?.headers).get("x-goog-api-key") ?? "");
      calls += 1;
      return new Response(
        JSON.stringify(
          calls === 1
            ? {
                models: [
                  {
                    name: "models/gemini-2.5-flash",
                    displayName: "Gemini 2.5 Flash",
                    supportedGenerationMethods: ["generateContent"],
                  },
                  {
                    name: "models/text-embedding-004",
                    supportedGenerationMethods: ["embedContent"],
                  },
                ],
                nextPageToken: "next-page",
              }
            : {
                models: [
                  {
                    name: "models/gemini-2.5-pro",
                    supportedGenerationMethods: ["generateContent"],
                  },
                ],
              },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      await expect(fetchGoogleCatalog("test-key")).resolves.toEqual([
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
        { id: "gemini-2.5-pro", name: "gemini-2.5-pro" },
      ]);
      expect(requested[0]?.pathname).toBe("/v1beta/models");
      expect(requested[0]?.searchParams.get("pageSize")).toBe("1000");
      expect(requested[1]?.searchParams.get("pageToken")).toBe("next-page");
      expect(apiKey).toBe("test-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on provider errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
    try {
      await expect(fetchGoogleCatalog("bad-key")).rejects.toThrow(
        "Google AI models request failed (403)",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
