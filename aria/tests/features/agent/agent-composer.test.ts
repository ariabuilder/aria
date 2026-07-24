import { describe, expect, it } from "vitest";
import { parseAgentChatRequestExtras } from "../../../admin/features/Agent/lib/chatRequest";
import { cycleComposerMode } from "../../../admin/features/Agent/lib/composerMode";
import { buildAgentSystemPrompt } from "../../../admin/features/Agent/lib/inference/systemPrompt";
import { buildSessionModelOverride } from "../../../admin/features/Agent/lib/sessionSettings";
import {
  AgentChatInputSchema,
  AgentSessionPrefsSchema,
  DEFAULT_AGENT_SETTINGS,
} from "../../../admin/features/Agent/lib/schemas";
import { buildAgentChatRequestBody } from "../../../admin/features/Agent/lib/wsChatProtocol";

describe("buildAgentSystemPrompt", () => {
  const settings = DEFAULT_AGENT_SETTINGS;

  it("includes agent mode instructions by default", () => {
    const prompt = buildAgentSystemPrompt({ settings });
    expect(prompt).toContain("Mode: Agent.");
  });

  it("keeps Ask read-only and free of canvas build guidance", () => {
    const prompt = buildAgentSystemPrompt({
      settings,
      mode: "ask",
      shellContext: {
        mode: "studio",
        workspace: "studio",
        itemType: null,
        itemSlug: null,
        itemTitle: null,
        pageId: null,
        selectedBlockId: null,
        blockCount: 0,
        canClientInsert: false,
        canClientNavigate: true,
      },
    });
    expect(prompt).toContain("Mode: Ask.");
    expect(prompt).toContain("strictly read-only");
    expect(prompt).toContain(
      "Do not assume they want to design or insert a section",
    );
    expect(prompt).not.toContain("For requests to add a section");
    expect(prompt).not.toContain("Block catalog:");
  });

  it("includes agent mode instructions", () => {
    const prompt = buildAgentSystemPrompt({ settings, mode: "agent" });
    expect(prompt).toContain("Mode: Agent.");
    expect(prompt).toContain("insert_designed_section");
    expect(prompt).toContain("Never insert temporary/test nodes");
    expect(prompt).toContain("insert_nodes");
    expect(prompt).toContain("aria_list_");
    expect(prompt).toContain("never aria_insert_nodes");
  });

  it("keeps class usage valid without prescribing a layout", () => {
    const prompt = buildAgentSystemPrompt({
      settings,
      mode: "agent",
      canWriteDesignSystem: true,
      shellContext: {
        mode: "composer",
        workspace: "composer",
        itemType: "page",
        itemSlug: "blog",
        itemTitle: "Blog",
        pageId: "page-blog",
        selectedBlockId: null,
        blockCount: 2,
        canClientInsert: true,
        canClientNavigate: true,
      },
    });

    expect(prompt).toContain("styling.utilityClassesAllowed");
    expect(prompt).toContain(
      "Never use classNames when styling.utilityClassesAllowed is false",
    );
    expect(prompt).toContain(
      "Use responsive styles directly for one-off sections",
    );
    expect(prompt).toContain("JSON encoded as a string");
    expect(prompt).not.toContain("Page structure:");
    expect(prompt).not.toContain("LAYOUT PATTERNS");
    expect(prompt).not.toContain("full-width");
    expect(prompt).not.toContain("centered");
  });

  it("explains the writable typography and global-style contracts", () => {
    const prompt = buildAgentSystemPrompt({
      settings,
      mode: "agent",
      canWriteDesignSystem: true,
      shellContext: {
        mode: "studio",
        workspace: "design",
        itemType: null,
        itemSlug: null,
        itemTitle: null,
        pageId: null,
        selectedBlockId: null,
        blockCount: 0,
        canClientInsert: false,
        canClientNavigate: true,
      },
    });

    expect(prompt).toContain("h1=5xl, h2=4xl");
    expect(prompt).toContain(
      "headingOverrides and bodyOverrides only assign font-family strings",
    );
    expect(prompt).toContain(
      "Heading supports color, fontFamily, fontWeight, lineHeight, letterSpacing, textTransform",
    );
    expect(prompt).toContain("read aria_get_design_system(detail:full)");
  });

  it("adds saved agent skills to the system prompt in their configured order", () => {
    const prompt = buildAgentSystemPrompt({
      settings: {
        ...settings,
        skills: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Editorial strategist",
            instructions: "Keep blog copy concise and practical.",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Brand voice",
            instructions: "Use a direct, warm voice.",
          },
        ],
      },
      mode: "agent",
    });

    expect(prompt).toContain("Agent skills:");
    expect(prompt).toContain("## Editorial strategist");
    expect(prompt).toContain("Keep blog copy concise and practical.");
    expect(prompt.indexOf("Editorial strategist")).toBeLessThan(
      prompt.indexOf("Brand voice"),
    );
  });

  it("adds saved site instructions alongside agent skills", () => {
    const prompt = buildAgentSystemPrompt({
      settings: {
        ...settings,
        siteInstructions:
          "Prioritize portfolio pages and keep user-facing answers short.",
        skills: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Case study editor",
            instructions: "Lead with measurable outcomes.",
          },
        ],
      },
      mode: "agent",
    });

    expect(prompt).toContain(
      "Site instructions:\nPrioritize portfolio pages and keep user-facing answers short.",
    );
    expect(prompt).toContain(
      "Agent skills:\n## Case study editor\nLead with measurable outcomes.",
    );
  });

  it("keeps implementation details out of user-facing responses", () => {
    const prompt = buildAgentSystemPrompt({ settings, mode: "agent" });
    expect(prompt).toContain("Do not expose internal implementation details");
    expect(prompt).toContain("Do not list internal node structures");
    expect(prompt).toContain("USER-FACING OUTPUT CONTRACT");
    expect(prompt).toContain("Never mention or quote tool names");
    expect(prompt).toContain("Do not narrate execution");
    expect(prompt).not.toContain("insert_section_recipe");
  });

  it("does not prescribe section composition or visual style", () => {
    const prompt = buildAgentSystemPrompt({ settings, mode: "agent" });

    for (const biasedInstruction of [
      "4–7",
      "Page structure",
      "LAYOUT PATTERNS",
      "visual concept",
      "responsive spacing/layout",
      "default hero formula",
      "modern design trends",
      "Webflow/Framer",
      "match the page aesthetic",
      "Composer Styling Workflow",
    ]) {
      expect(prompt).not.toContain(biasedInstruction);
    }
  });

  it("requires multi-section builds to insert one completed section per step", () => {
    const prompt = buildAgentSystemPrompt({ settings, mode: "agent" });

    expect(prompt).toContain(
      "For multi-section builds, insert exactly one section per assistant step.",
    );
    expect(prompt).toContain(
      "Wait for that insertion result before creating the next section",
    );
  });

  it("guides CMS create to inventory-with-entries then immediate write", () => {
    const prompt = buildAgentSystemPrompt({ settings, mode: "agent" });
    expect(prompt).toContain("includeEntries: true");
    expect(prompt).toContain(
      "call aria_create_entry or aria_update_entry in the next step",
    );
    expect(prompt).toContain(
      "Do not narrate a full create plan before the write tool runs",
    );
    expect(prompt).toContain(
      "fall back immediately to inventory entries (includeEntries)",
    );
    expect(prompt).toContain("Keep structured entry bodies concise");
  });
});

describe("session model override", () => {
  it("returns undefined override when session matches site default", () => {
    const override = buildSessionModelOverride({
      inferenceProvider: "opencode",
      modelId: "opencode/big-pickle",
      siteInferenceProvider: "opencode" as never,
      siteModelId: "opencode/big-pickle",
    });
    expect(override).toBeUndefined();
  });

  it("builds override when session differs from site", () => {
    const override = buildSessionModelOverride({
      inferenceProvider: "workers_ai",
      modelId: "@cf/meta/llama-3.2-3b-instruct",
      siteInferenceProvider: "opencode" as never,
      siteModelId: "opencode/big-pickle",
    });
    expect(override).toEqual({
      inferenceProvider: "workers_ai",
      modelId: "@cf/meta/llama-3.2-3b-instruct",
    });
  });

  it("builds model override when provider matches but model differs", () => {
    const override = buildSessionModelOverride({
      inferenceProvider: "opencode",
      modelId: "opencode-go/kimi-k2.7-code",
      siteInferenceProvider: "opencode" as never,
      siteModelId: "opencode/big-pickle",
    });
    expect(override).toEqual({
      inferenceProvider: "opencode",
      modelId: "opencode-go/kimi-k2.7-code",
    });
  });
});

describe("chat request schemas", () => {
  it("parses chat input with composer mode and session model", () => {
    const parsed = AgentChatInputSchema.parse({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          content: "Hello",
          createdAt: "2026-06-12T12:00:00.000Z",
        },
      ],
      composerMode: "plan",
      sessionModel: {
        inferenceProvider: "workers_ai",
        modelId: "@cf/meta/llama-3.2-3b-instruct",
      },
    });

    expect(parsed.composerMode).toBe("ask");
    expect(parsed.sessionModel?.modelId).toBe("@cf/meta/llama-3.2-3b-instruct");
  });

  it("parses request extras from websocket body", () => {
    const extras = parseAgentChatRequestExtras(
      JSON.stringify({
        messages: [],
        trigger: "submit-message",
        composerMode: "agent",
        sessionModel: {
          inferenceProvider: "openai",
          modelId: "gpt-4.1-mini",
        },
      }),
    );

    expect(extras.composerMode).toBe("agent");
    expect(extras.sessionModel?.modelId).toBe("gpt-4.1-mini");
  });

  it("parses request extras from AIChatAgent custom body object", () => {
    const extras = parseAgentChatRequestExtras({
      composerMode: "plan",
      sessionModel: {
        inferenceProvider: "workers_ai",
        modelId: "@cf/meta/llama-3.2-3b-instruct",
      },
    });

    expect(extras.composerMode).toBe("ask");
    expect(extras.sessionModel?.modelId).toBe("@cf/meta/llama-3.2-3b-instruct");
  });

  it("builds websocket request body with zod validation", () => {
    const body = buildAgentChatRequestBody({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          content: "Hello",
          createdAt: "2026-06-12T12:00:00.000Z",
        },
      ],
      composerMode: "ask",
      sessionModel: {
        inferenceProvider: "workers_ai",
        modelId: "@cf/meta/llama-3.2-3b-instruct",
      },
    });

    const parsed: unknown = JSON.parse(body);
    expect(parsed).toMatchObject({
      trigger: "submit-message",
      composerMode: "ask",
      sessionModel: {
        inferenceProvider: "workers_ai",
        modelId: "@cf/meta/llama-3.2-3b-instruct",
      },
    });
  });
});

describe("session prefs schema", () => {
  it("defaults composer mode to agent", () => {
    const prefs = AgentSessionPrefsSchema.parse({});
    expect(prefs.composerMode).toBe("agent");
  });

  it("migrates a stored plan preference to ask", () => {
    const prefs = AgentSessionPrefsSchema.parse({
      composerMode: "plan",
      inferenceProvider: "openai",
      modelId: "gpt-4.1-mini",
    });
    expect(prefs).toEqual({
      composerMode: "ask",
      inferenceProvider: "openai",
      modelId: "gpt-4.1-mini",
    });
  });
});

describe("composer mode cycle", () => {
  it("cycles agent -> ask -> agent", () => {
    expect(cycleComposerMode("agent")).toBe("ask");
    expect(cycleComposerMode("ask")).toBe("agent");
  });
});
