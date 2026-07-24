import type { AgentComposerMode } from "../../lib/schemas";
import type { AgentShellContext } from "../../lib/schemas";

const ASK_PROMPTS = [
  "What can Aria Engineer do?",
  "Explain how Aria pages and components work",
  "What should I know about this site?",
] as const;

const AGENT_PROMPTS = [
  "Create a new landing page",
  "Improve the about page copy and SEO",
  "Update my site's design system",
  "Suggest the next content block to add",
] as const;

const PAGE_ASK_PROMPTS = [
  "Summarize this page",
  "Explain this page's structure",
  "What could be clearer here?",
] as const;

const PAGE_AGENT_PROMPTS = [
  "Suggest a hero for this page",
  "Improve copy on this page",
  "Audit this page's SEO",
  "What block should I add next?",
] as const;

const EMPTY_CANVAS_PROMPTS = [
  "Build a landing layout for this page",
  "Add a hero section",
  "Add a two-column section with text and image",
] as const;

export function useAgentSuggestedPrompts(
  context: AgentShellContext,
  mode: AgentComposerMode,
): string[] {
  if (context.canClientInsert && context.blockCount === 0) {
    return [...EMPTY_CANVAS_PROMPTS];
  }

  if (context.itemSlug) {
    switch (mode) {
      case "agent":
        return [...PAGE_AGENT_PROMPTS];
      default:
        return [...PAGE_ASK_PROMPTS];
    }
  }

  switch (mode) {
    case "agent":
      return [...AGENT_PROMPTS];
    default:
      return [...ASK_PROMPTS];
  }
}

export function useAgentEmptyStateGreeting(
  context: AgentShellContext,
  mode: AgentComposerMode,
): { title: string; subtitle: string } {
  if (context.itemSlug) {
    const label = context.itemTitle ?? context.itemSlug ?? "this page";
    switch (mode) {
      case "agent":
        return {
          title: `Edit, refine, or optimize ${label}`,
          subtitle: context.canClientInsert
            ? "Add blocks, update SEO, refine copy, or adjust the design."
            : "Update SEO, page metadata, or design — or open Composer to add blocks.",
        };
      default:
        return {
          title: `Questions about ${label}?`,
          subtitle: "Ask about content, structure, or improvements.",
        };
    }
  }

  switch (mode) {
    case "agent":
      return {
        title: "What should Aria do?",
        subtitle:
          "Create pages, update SEO, customize your design, or add content blocks.",
      };
    default:
      return {
        title: "How can I help with your site?",
        subtitle: "Ask about content, structure, or next steps.",
      };
  }
}
