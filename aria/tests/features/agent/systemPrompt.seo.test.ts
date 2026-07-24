import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../../admin/features/Agent/lib/inference/systemPrompt";
import { DEFAULT_AGENT_SETTINGS } from "../../../admin/features/Agent/lib/schemas";

describe("buildAgentSystemPrompt SEO sessions", () => {
  it("grounds broad traffic answers in the calendar summary", () => {
    const prompt = buildAgentSystemPrompt({
      settings: DEFAULT_AGENT_SETTINGS,
      mode: "ask",
    });

    expect(prompt).toContain("aria_get_traffic_summary");
    expect(prompt).toContain("versus the same point last week");
    expect(prompt).toContain("visits—not users, sessions, or unique visitors");
    expect(prompt).toContain("never estimate");
  });

  it("includes Studio SEO instructions when seoContext is set", () => {
    const prompt = buildAgentSystemPrompt({
      settings: DEFAULT_AGENT_SETTINGS,
      mode: "agent",
      seoContext: {
        pageSlug: "blog",
        pageTitle: "Blog",
        field: "general",
        siteUrl: "https://example.com",
        siteName: "Example",
        publicPageUrl: "https://example.com/blog",
        systemRole: "cms-collection",
        contentExcerpt: "Stories from the team.",
        currentSeo: { title: "Old title" },
      },
    });

    expect(prompt).toContain("Studio SEO Session");
    expect(prompt).toContain('page "Blog" (blog)');
    expect(prompt).toContain("aria_update_page_seo");
    expect(prompt).toContain("detail=seo");
    expect(prompt).toContain("Site URL: https://example.com");
    expect(prompt).toContain("Public page URL: https://example.com/blog");
    expect(prompt).toContain("cms-collection");
    expect(prompt).toContain("Stories from the team.");
    expect(prompt).not.toContain(
      "call open_in_composer first, then insert_designed_section",
    );
  });

  it("keeps composer guidance for normal agent sessions", () => {
    const prompt = buildAgentSystemPrompt({
      settings: DEFAULT_AGENT_SETTINGS,
      mode: "agent",
    });

    expect(prompt).toContain(
      "call open_in_composer first, then insert_designed_section",
    );
    expect(prompt).not.toContain("Studio SEO Session");
  });

  it("treats shell currentDocument as the authoritative open page", () => {
    const prompt = buildAgentSystemPrompt({
      settings: DEFAULT_AGENT_SETTINGS,
      mode: "agent",
      shellContext: {
        mode: "composer",
        workspace: "composer",
        itemType: "page",
        itemSlug: "index",
        itemTitle: "Home",
        pageId: "home",
        selectedBlockId: null,
        blockCount: 2,
        canClientInsert: true,
        canClientNavigate: true,
        documentOutline: {
          rootBlockCount: 2,
          rootTypes: ["section", "section"],
        },
        currentDocument: {
          type: "page",
          id: "home",
          slug: "index",
          title: "Home",
          status: "draft",
          layout: "main",
          publicPath: "/",
          isDirty: true,
          activeSlot: {
            name: "main",
            label: "Main",
            scope: "page",
          },
          seo: {
            title: "Home SEO",
            description: "Welcome home.",
          },
          contentExcerpt: "Existing hero Existing features",
        },
      },
    });

    expect(prompt).toContain("Current document is authoritative");
    expect(prompt).toContain('page "Home" (home) slug=index path=/');
    expect(prompt).toContain("unsavedChanges=true");
    expect(prompt).toContain('Active insertion scope: page slot "Main"');
    expect(prompt).toContain('Current SEO: title="Home SEO"');
    expect(prompt).toContain("Do not call aria_list_pages or open_in_composer just to identify the current page");
  });
});
