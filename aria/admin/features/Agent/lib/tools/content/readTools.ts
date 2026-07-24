import {
  AriaGetDesignSystemInputSchema,
  AriaListComponentsInputSchema,
  AriaListLayoutsInputSchema,
  AriaListPagesInputSchema,
  AriaReadComponentInputSchema,
  AriaReadLayoutInputSchema,
  AriaReadPageInputSchema,
  type AgentToolResult,
} from "../../schemas";
import type { z } from "zod";
import { listElementTypes } from "../../manifest/blockCatalog";
import { invokeActionForTool } from "../invokeActionForTool";
import type { AgentToolActionContext } from "../types";
import {
  DesignSystemSummarySchema,
  ElementTypesOutputSchema,
  ListComponentsOutputSchema,
  ListLayoutsOutputSchema,
  ListPagesOutputSchema,
  NodeCapabilitiesOutputSchema,
} from "./schemas";
import {
  MOTION_EFFECT_IDS,
  MOTION_TRIGGER_IDS,
  MOTION_PRESET_IDS,
  MOTION_SPEED_IDS,
  MOTION_EASING_IDS,
  MOTION_DISTANCE_IDS,
  MOTION_DELAY_IDS,
  MOTION_HOVER_IDS,
  MOTION_LOOP_IDS,
} from "../../../../../../lib/motion/schemas/tokens.schema";
import { UI_PRESETS } from "../../../../../../lib/motion/presets";
import {
  summarizeComponentDsl,
  summarizeLayoutDsl,
  summarizePageDsl,
} from "./summarize";
import { readResourceForTool } from "./readResource";
import { fetchPageInventoryForTools } from "./pageInventoryForTools";
import { fetchLayoutComponentCatalogForTools } from "./catalogForTools";
import { fetchDesignSystemForTools } from "./designSystemForTools";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import { formatToolErrorForModel, toolErrorResult } from "../toolErrors";
import type {
  PageDSL,
  ComponentDSL,
  LayoutDSL,
} from "../../../../../../lib/types/nodes";

type NodeCapabilitiesOutput = z.infer<typeof NodeCapabilitiesOutputSchema>;

function denyContributorPages(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (
    context.user &&
    !hasEffectiveCapability(context.user, "editPages") &&
    !hasEffectiveCapability(context.user, "editPageContent")
  ) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot access page content.",
      suggestedFix: "Ask an administrator or open a component in Composer.",
    });
  }
  return null;
}

export async function ariaListPages(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ pages: unknown[] }>> {
  const denied = denyContributorPages(context);
  if (denied) {
    return denied;
  }

  return invokeActionForTool({
    context,
    operationId: "agent.readSite",
    inputSchema: AriaListPagesInputSchema,
    outputSchema: ListPagesOutputSchema,
    input,
    call: async () => {
      const result = await fetchPageInventoryForTools(context);
      if (!result.ok) {
        throw new Error(formatToolErrorForModel(result.error));
      }
      return result.data;
    },
  });
}

export async function ariaListLayouts(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ layouts: unknown[] }>> {
  return invokeActionForTool({
    context,
    operationId: "agent.readSite",
    inputSchema: AriaListLayoutsInputSchema,
    outputSchema: ListLayoutsOutputSchema,
    input,
    call: async () => {
      const result = await fetchLayoutComponentCatalogForTools(context);
      if (!result.ok) {
        throw new Error(formatToolErrorForModel(result.error));
      }
      return { layouts: result.data.layouts };
    },
  });
}

export async function ariaListComponents(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ components: unknown[] }>> {
  return invokeActionForTool({
    context,
    operationId: "agent.readSite",
    inputSchema: AriaListComponentsInputSchema,
    outputSchema: ListComponentsOutputSchema,
    input,
    call: async () => {
      const result = await fetchLayoutComponentCatalogForTools(context);
      if (!result.ok) {
        throw new Error(formatToolErrorForModel(result.error));
      }
      return { components: result.data.components };
    },
  });
}

export async function ariaReadPage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyContributorPages(context);
  if (denied) {
    return denied;
  }

  const parsed = AriaReadPageInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid read page input",
      zodIssues: parsed.error.issues,
    });
  }

  const result = await readResourceForTool(context, {
    collection: "pages",
    slug: parsed.data.slug,
    target: parsed.data.target,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: summarizePageDsl(result.data as PageDSL, parsed.data.detail),
  };
}

export async function ariaReadLayout(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaReadLayoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid read layout input",
      zodIssues: parsed.error.issues,
    });
  }

  const result = await readResourceForTool(context, {
    collection: "layouts",
    slug: parsed.data.slug,
    target: parsed.data.target,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: summarizeLayoutDsl(result.data as LayoutDSL, parsed.data.detail),
  };
}

export async function ariaReadComponent(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaReadComponentInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid read component input",
      zodIssues: parsed.error.issues,
    });
  }

  const result = await readResourceForTool(context, {
    collection: "components",
    slug: parsed.data.slug,
    target: parsed.data.target,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: summarizeComponentDsl(
      result.data as ComponentDSL,
      parsed.data.detail,
    ),
  };
}

export async function ariaGetDesignSystem(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetDesignSystemInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid design system input",
      zodIssues: parsed.error.issues,
    });
  }

  return invokeActionForTool({
    context,
    operationId: "agent.readSite",
    inputSchema: AriaGetDesignSystemInputSchema,
    outputSchema: DesignSystemSummarySchema,
    input: parsed.data,
    call: async (validated) => {
      const result = await fetchDesignSystemForTools(context, validated.detail);
      if (!result.ok) {
        throw new Error(formatToolErrorForModel(result.error));
      }
      return result.data;
    },
  });
}

export const CROSS_ELEMENT_CAPABILITIES = {
  motion: {
    description: "Aria Motion entrance & interaction animation configuration.",
    fields: [
      {
        key: "enabled",
        type: "boolean",
        required: true,
        default: false,
        description: "Master toggle for motion effects.",
      },
      {
        key: "preset",
        type: "string",
        enum: [...MOTION_PRESET_IDS],
        description:
          "Quick-start preset that sets effects, trigger, speed, and easing together.",
      },
      {
        key: "effects",
        type: "string[]",
        enum: [...MOTION_EFFECT_IDS],
        description: "Entrance effect sequence.",
      },
      {
        key: "trigger",
        type: "string",
        enum: [...MOTION_TRIGGER_IDS],
        description: "What starts the animation.",
        default: "reveal",
      },
      {
        key: "speed",
        type: "string",
        enum: [...MOTION_SPEED_IDS],
        description: "Animation speed.",
      },
      {
        key: "easing",
        type: "string",
        enum: [...MOTION_EASING_IDS],
        description: "Easing curve.",
      },
      {
        key: "distance",
        type: "string",
        enum: [...MOTION_DISTANCE_IDS],
        description: "Travel distance for slide/zoom effects.",
      },
      {
        key: "delay",
        type: "string | number",
        enum: [...MOTION_DELAY_IDS],
        description: "Delay before animation starts (ms token or integer).",
      },
      {
        key: "hover",
        type: "string[]",
        enum: [...MOTION_HOVER_IDS],
        description: "Hover interaction effects.",
      },
      {
        key: "loop",
        type: "string",
        enum: [...MOTION_LOOP_IDS],
        description: "Looping animation.",
      },
      {
        key: "stagger",
        type: "json",
        description: "Stagger child animations: { interval: number }",
      },
      {
        key: "text",
        type: "json",
        description:
          'Text animation: { mode: "words"|"chars", stagger?: number }',
      },
      {
        key: "scrub",
        type: "json",
        description:
          "Scroll scrub: { from?: string, to?: string, travel?: number }",
      },
      {
        key: "magnetic",
        type: "json",
        description: "Magnetic mouse tracking: { strength: number (0-1) }",
      },
      {
        key: "parallax",
        type: "json",
        description:
          "Parallax scroll: { enabled, speed: '0'|'0.25'|'0.5'|'0.75'|'1'|'1.25'|'1.5'|'2', direction, effects, travel, easing, anchor, startOffset, endOffset, containerRef, pin, layerGroup, velocity, disableOnMobile }",
      },
    ],
    presets: UI_PRESETS.map(
      ({ id, label, effects, trigger, speed, easing, distance }) => ({
        id,
        label,
        effects,
        trigger,
        speed,
        easing,
        distance,
      }),
    ),
    example: {
      enabled: true,
      preset: "fade-up",
      trigger: "reveal",
      speed: "normal",
    },
  },
  styles: {
    description:
      "Inline CSS property overrides. For utility classes (Tailwind/UnoCSS) use classNames instead.",
    fields: [
      {
        key: "display",
        type: "responsive<string>",
        description: "CSS display value",
      },
      {
        key: "position",
        type: "responsive<string>",
        description: "CSS position value",
      },
      {
        key: "padding",
        type: "responsive<string>",
        description: "Padding (shorthand)",
      },
      {
        key: "margin",
        type: "responsive<string>",
        description: "Margin (shorthand)",
      },
      {
        key: "width",
        type: "responsive<string>",
        description: "Width",
      },
      {
        key: "height",
        type: "responsive<string>",
        description: "Height",
      },
      {
        key: "maxWidth",
        type: "responsive<string>",
        description: "Max width",
      },
      {
        key: "color",
        type: "responsive<string>",
        description: "Text color",
      },
      {
        key: "backgroundColor",
        type: "responsive<string>",
        description: "Background color",
      },
      {
        key: "fontSize",
        type: "responsive<string>",
        description: "Font size",
      },
      {
        key: "fontWeight",
        type: "responsive<string>",
        description: "Font weight",
      },
      {
        key: "textAlign",
        type: "responsive<string>",
        description: "Text alignment",
      },
      {
        key: "borderRadius",
        type: "responsive<string>",
        description: "Border radius",
      },
      {
        key: "opacity",
        type: "responsive<number>",
        description: "Opacity 0-1",
      },
      {
        key: "zIndex",
        type: "responsive<number>",
        description: "Z-index",
      },
      {
        key: "boxShadow",
        type: "responsive<string>",
        description: "Box shadow CSS",
      },
      {
        key: "transform",
        type: "responsive<string>",
        description: "CSS transform",
      },
    ],
    responsiveNote:
      "Each property value can be a string (all breakpoints) or an object: { base: string, sm?: string, md?: string, lg?: string, xl?: string }",
    example: {
      padding: { base: "16px", md: "32px" },
      maxWidth: "1200px",
      margin: "0 auto",
    },
  },
} as const;

export async function ariaGetNodeCapabilities(
  _context: AgentToolActionContext,
  _input: unknown,
): Promise<AgentToolResult<NodeCapabilitiesOutput>> {
  const validated = NodeCapabilitiesOutputSchema.safeParse(
    CROSS_ELEMENT_CAPABILITIES,
  );
  if (!validated.success) {
    return toolErrorResult({
      code: "INTERNAL",
      message: "Capabilities data validation failed",
    });
  }
  return { ok: true, data: validated.data };
}

export async function ariaListElementTypes(
  _context: AgentToolActionContext,
  _input: unknown,
): Promise<AgentToolResult<{ elements: ReturnType<typeof listElementTypes> }>> {
  const elements = listElementTypes();
  const validated = ElementTypesOutputSchema.safeParse({ elements });
  if (!validated.success) {
    return toolErrorResult({
      code: "INTERNAL",
      message: "Block catalog validation failed",
    });
  }
  return { ok: true, data: validated.data };
}
