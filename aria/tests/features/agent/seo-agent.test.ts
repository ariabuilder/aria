import { describe, expect, it, vi } from "vitest";
import {
  buildAgentSeoContext,
  buildSeoImprovementPrompt,
  buildSeoStudioShellContext,
  canShowSeoAgentLauncher,
  dispatchAgentPageSeoUpdated,
  isAgentInferenceReady,
  notifyAgentPageSeoUpdatedFromToolSteps,
} from "../../../admin/features/Agent/lib/seoAgent";
import { AGENT_PAGE_SEO_UPDATED_EVENT } from "../../../admin/features/Agent/lib/constants";
import type { AgentAvailability } from "../../../admin/features/Agent/lib/schemas";

const readyAvailability: AgentAvailability = {
  canUseStudioAgent: true,
  canShowAgentShell: true,
  platform: "local",
  siteEnabled: true,
  mcpEnabled: true,
  durableAgentAvailable: false,
  workersAiAvailable: false,
  configuredBackends: { opencode: true },
  effectiveInferenceBackend: "opencode",
};

const disabledAvailability: AgentAvailability = {
  canUseStudioAgent: true,
  canShowAgentShell: true,
  platform: "local",
  siteEnabled: false,
  mcpEnabled: false,
  durableAgentAvailable: false,
  workersAiAvailable: false,
  configuredBackends: {},
  effectiveInferenceBackend: "unavailable",
  reason: "disabled",
};

const needsSetupAvailability: AgentAvailability = {
  canUseStudioAgent: true,
  canShowAgentShell: true,
  platform: "local",
  siteEnabled: true,
  mcpEnabled: true,
  durableAgentAvailable: false,
  workersAiAvailable: false,
  configuredBackends: {},
  effectiveInferenceBackend: "unavailable",
  reason: "inference_setup_required",
};

describe("buildSeoImprovementPrompt", () => {
  it("uses metadata-focused Studio language", () => {
    expect(buildSeoImprovementPrompt("Blog", "blog")).toBe(
      'Update the SEO metadata for the "Blog" page in Studio. Read the page content first (aria_read_page with detail=seo), then set meta title, description, Open Graph, canonical, and robots. Do not edit page content in Composer.',
    );
  });

  it("falls back to the slug when title is empty", () => {
    expect(buildSeoImprovementPrompt("", "about")).toContain('"about"');
  });
});

describe("buildAgentSeoContext", () => {
  it("includes site URL, public page URL, and scanned page content", () => {
    const context = buildAgentSeoContext({
      pageSlug: "blog",
      pageTitle: "Blog",
      pageDescription: "Latest posts",
      systemRole: "cms-collection",
      siteUrl: "https://example.com/",
      siteName: "Example",
      nodes: [
        {
          id: "h1",
          type: "h1",
          props: { text: "Our Blog" },
          styles: {},
          children: [],
        },
      ],
      currentSeo: {
        title: "Old title",
      },
    });

    expect(context).toMatchObject({
      pageSlug: "blog",
      pageTitle: "Blog",
      siteUrl: "https://example.com",
      siteName: "Example",
      publicPageUrl: "https://example.com/blog",
      systemRole: "cms-collection",
      pageDescription: "Latest posts",
      contentExcerpt: "Our Blog",
      currentSeo: { title: "Old title" },
    });
  });
});

describe("buildSeoStudioShellContext", () => {
  it("pins the agent to studio with navigation disabled", () => {
    expect(buildSeoStudioShellContext("blog", "Blog", "page-1")).toEqual({
      mode: "studio",
      workspace: "studio",
      itemType: "page",
      itemSlug: "blog",
      itemTitle: "Blog",
      pageId: "page-1",
      selectedBlockId: null,
      blockCount: 0,
      canClientInsert: false,
      canClientNavigate: false,
    });
  });
});

describe("isAgentInferenceReady", () => {
  it("returns true when the agent is enabled and inference is configured", () => {
    expect(isAgentInferenceReady(readyAvailability)).toBe(true);
  });

  it("returns false when inference setup is still required", () => {
    expect(isAgentInferenceReady(needsSetupAvailability)).toBe(false);
  });
});

describe("canShowSeoAgentLauncher", () => {
  it("returns false when the agent is disabled", () => {
    expect(canShowSeoAgentLauncher(disabledAvailability)).toBe(false);
  });
});

describe("notifyAgentPageSeoUpdatedFromToolSteps", () => {
  it("dispatches an event when aria_update_page_seo succeeds", () => {
    const events: string[] = [];
    const handler = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail?.slug === "string") {
        events.push(event.detail.slug);
      }
    };

    window.addEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    try {
      notifyAgentPageSeoUpdatedFromToolSteps(
        [
          {
            id: "step-1",
            toolName: "aria_update_page_seo",
            status: "success",
            isReadTool: false,
          },
        ],
        { pageSlug: "blog", pageTitle: "Blog" },
      );
      expect(events).toEqual(["blog"]);
    } finally {
      window.removeEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    }
  });

  it("does not dispatch when seoContext is missing", () => {
    const handler = vi.fn();
    window.addEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    try {
      notifyAgentPageSeoUpdatedFromToolSteps(
        [
          {
            id: "step-1",
            toolName: "aria_update_page_seo",
            status: "success",
            isReadTool: false,
          },
        ],
        null,
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    }
  });
});

describe("dispatchAgentPageSeoUpdated", () => {
  it("dispatches a custom event with the page slug", () => {
    const handler = vi.fn();
    window.addEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    try {
      dispatchAgentPageSeoUpdated("about");
      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0]?.[0];
      expect(event).toBeInstanceOf(CustomEvent);
      expect((event as CustomEvent).detail).toEqual({ slug: "about" });
    } finally {
      window.removeEventListener(AGENT_PAGE_SEO_UPDATED_EVENT, handler);
    }
  });
});
