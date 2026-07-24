import {
  handleApplyTemplate,
  handleSaveColors,
  handleSaveTypography,
  handleSaveGlobalStyles,
  handleSaveBreakpoints,
} from "../../../../../../actions/design-system";
import {
  AriaApplyDesignSystemTemplateInputSchema,
  AriaSaveDesignSystemBreakpointsInputSchema,
  AriaSaveDesignSystemColorsInputSchema,
  AriaSaveDesignSystemGlobalStylesInputSchema,
  AriaSaveDesignSystemTypographyInputSchema,
  AriaSetDesignSystemPrimaryColorInputSchema,
  DesignSystemWriteResultSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { fetchDesignSystemForTools } from "./designSystemForTools";
import {
  normalizeSaveColorsInput,
  patchPrimaryPaletteColor,
} from "./designSystemNormalize";

function prepareSaveColorsPayload(payload: unknown): AgentToolResult<{
  colors: ReturnType<typeof normalizeSaveColorsInput> & object;
}> {
  const parsed = AriaSaveDesignSystemColorsInputSchema.safeParse(payload);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const normalized = normalizeSaveColorsInput(parsed.data.colors);
  if (!normalized) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message:
        "Invalid colors payload. palettes must be an array of { name, shades } or a record keyed by palette name (as returned by aria_get_design_system).",
      suggestedFix:
        "Call aria_get_design_system first, then pass colors back with primary.500 updated, or use aria_set_design_system_primary_color for simple changes.",
    });
  }

  return { ok: true, data: { colors: normalized } };
}

export async function ariaSaveDesignSystemColors(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const prepared = prepareSaveColorsPayload(input);
  if (!prepared.ok) {
    return prepared;
  }

  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.saveColors",
    inputSchema: AriaSaveDesignSystemColorsInputSchema,
    outputSchema: DesignSystemWriteResultSchema,
    payload: prepared.data,
    handler: (validated, actionContext) =>
      handleSaveColors(
        validated as Parameters<typeof handleSaveColors>[0],
        actionContext,
      ),
  });
}

export async function ariaSetDesignSystemPrimaryColor(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaSetDesignSystemPrimaryColorInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const read = await fetchDesignSystemForTools(context, "full");
  if (!read.ok) {
    return read;
  }

  const colors = read.data.colors as {
    activeTemplateId?: string;
    palettes?: Record<string, Record<string, string>> | Array<unknown>;
    semantic?: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };

  const base = normalizeSaveColorsInput({
    templateId: colors.activeTemplateId ?? "custom",
    palettes: colors.palettes ?? {},
    semantic: colors.semantic ?? {
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#3b82f6",
    },
  });

  if (!base) {
    return toolErrorResult({
      code: "INTERNAL",
      message: "Could not read current design system colors.",
    });
  }

  try {
    const palettes = patchPrimaryPaletteColor(base.palettes, parsed.data.color);
    return ariaSaveDesignSystemColors(context, {
      colors: {
        templateId: "custom",
        palettes,
        semantic: base.semantic,
      },
    });
  } catch (error) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message:
        error instanceof Error
          ? error.message
          : `Invalid color: ${parsed.data.color}`,
      suggestedFix: "Use a hex color like #ef4444 or a named color like red.",
    });
  }
}

export async function ariaSaveDesignSystemTypography(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.saveTypography",
    inputSchema: AriaSaveDesignSystemTypographyInputSchema,
    outputSchema: DesignSystemWriteResultSchema,
    payload: input,
    handler: (validated, actionContext) =>
      handleSaveTypography(validated, actionContext),
  });
}

export async function ariaSaveDesignSystemGlobalStyles(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.saveGlobalStyles",
    inputSchema: AriaSaveDesignSystemGlobalStylesInputSchema,
    outputSchema: DesignSystemWriteResultSchema,
    payload: input,
    handler: (validated, actionContext) =>
      handleSaveGlobalStyles(validated, actionContext),
  });
}

export async function ariaSaveDesignSystemBreakpoints(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.saveBreakpoints",
    inputSchema: AriaSaveDesignSystemBreakpointsInputSchema,
    outputSchema: DesignSystemWriteResultSchema,
    payload: input,
    handler: (validated, actionContext) =>
      handleSaveBreakpoints(validated, actionContext),
  });
}

export async function ariaApplyDesignSystemTemplate(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.applyTemplate",
    inputSchema: AriaApplyDesignSystemTemplateInputSchema,
    outputSchema: DesignSystemWriteResultSchema,
    payload: input,
    handler: (validated, actionContext) =>
      handleApplyTemplate(validated, actionContext),
  });
}
