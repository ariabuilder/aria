import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../../admin/features/Agent/lib/inference/systemPrompt";
import {
  AriaSaveEntryTranslationInputSchema,
  AriaUpdateLocalizationSettingsInputSchema,
  DEFAULT_AGENT_SETTINGS,
} from "../../../admin/features/Agent/lib/schemas";
import { listMcpToolsForScopes } from "../../../admin/features/Agent/lib/tools/constants";
import {
  assertPlaceholdersPreserved,
  assertStructuredTextPreserved,
  protectedFrontmatterMerge,
} from "../../../admin/features/Agent/lib/tools/cms/cmsTools";

describe("agent localization knowledge", () => {
  it("adds authoritative CMS entry translation instructions to the prompt", () => {
    const prompt = buildAgentSystemPrompt({
      settings: DEFAULT_AGENT_SETTINGS,
      mode: "agent",
      shellContext: {
        mode: "studio",
        workspace: "collections",
        itemType: null,
        itemSlug: null,
        itemTitle: null,
        pageId: null,
        selectedBlockId: null,
        blockCount: 0,
        canClientInsert: false,
        canClientNavigate: false,
        cmsEntry: {
          collectionId: "posts",
          collectionName: "posts",
          entryId: "entry-1",
          entryVersion: "v1",
          entryTitle: "Hello",
          sourceLocale: "en",
          activeLocale: "fr-CA",
          activeLocaleState: "missing",
          existingLocales: ["en"],
          missingLocales: ["fr-CA"],
        },
      },
    });

    expect(prompt).toContain("aria_get_entry_translation_context");
    expect(prompt).toContain("canonical source");
    expect(prompt).toContain("aria_save_entry_translation");
    expect(prompt).toContain("activeLocale=fr-CA");
    expect(prompt).toContain("Do not change publication status");
  });

  it("rejects source-to-source translation writes", () => {
    const result = AriaSaveEntryTranslationInputSchema.safeParse({
      collectionId: "posts",
      entryId: "entry-1",
      expectedEntryVersion: "v1",
      sourceLocale: "en",
      targetLocale: "en",
      mode: "create_missing",
      translation: { title: "Hello", frontmatter: {} },
    });
    expect(result.success).toBe(false);
  });

  it("validates locale fallback graphs with the canonical schema", () => {
    const result = AriaUpdateLocalizationSettingsInputSchema.safeParse({
      defaultLocale: "en",
      locales: [
        { code: "en", label: "English", enabled: true, fallbacks: ["fr"] },
        { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("exposes translation reads and writes under the expected MCP scopes", () => {
    expect(listMcpToolsForScopes(["mcp:read"])).toContain(
      "aria_get_entry_translation_context",
    );
    expect(listMcpToolsForScopes(["mcp:write"])).toContain(
      "aria_save_entry_translation",
    );
    expect(listMcpToolsForScopes(["mcp:design"])).toContain(
      "aria_update_localization_settings",
    );
  });

  it("applies translated text while preserving protected CMS values", () => {
    const result = protectedFrontmatterMerge(
      [
        { key: "excerpt", label: "Excerpt", type: "text" },
        { key: "cover", label: "Cover", type: "image" },
        { key: "author", label: "Author", type: "relation" },
        {
          key: "seo",
          label: "SEO",
          type: "object",
          fields: [
            { key: "description", label: "Description", type: "text" },
            { key: "score", label: "Score", type: "number" },
          ],
        },
      ],
      {
        excerpt: "Hello",
        cover: "media-1",
        author: "entry-2",
        seo: { description: "Source", score: 95 },
      },
      {
        excerpt: "Bonjour",
        cover: "malicious-replacement",
        author: "entry-3",
        seo: { description: "Traduction", score: 0 },
      },
    );

    expect(result).toEqual({
      excerpt: "Bonjour",
      cover: "media-1",
      author: "entry-2",
      seo: { description: "Traduction", score: 95 },
    });
  });

  it("rejects dropped placeholders and structured-content mutations", () => {
    expect(() =>
      assertPlaceholdersPreserved("Hello {{name}}", "Bonjour"),
    ).toThrow(/missing placeholders/i);

    const source = [
      {
        _type: "block",
        _key: "block-1",
        style: "normal",
        markDefs: [],
        children: [{ _type: "span", _key: "span-1", text: "Hello", marks: [] }],
      },
    ];
    const validTranslation = structuredClone(source);
    validTranslation[0].children[0].text = "Bonjour";
    expect(() =>
      assertStructuredTextPreserved(source, validTranslation),
    ).not.toThrow();

    const invalidTranslation = structuredClone(validTranslation);
    invalidTranslation[0]._key = "changed";
    expect(() =>
      assertStructuredTextPreserved(source, invalidTranslation),
    ).toThrow(/preserve block keys/i);
  });
});
