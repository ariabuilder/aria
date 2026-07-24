import { getAdapter } from "../../../../../../actions/_shared";
import { getDesignSystem } from "../../../../../../actions/_designSystemPersist";
import { buildTypographyConfig } from "../../../../../../actions/design-system";
import { PALETTE_TEMPLATES } from "../../../../../../lib/design/palettes";
import {
  createDesignSystemColorsFromUniversalDesignSystem,
  resolveUniversalBreakpointItems,
} from "../../../../../../lib/styles/universalDesignSystem";
import type { ContentReadDetail } from "../../schemas";
import type { AgentToolResult } from "../../schemas";
import { createCapabilityRevision } from "../../capabilities/revision";
import { mapActionErrorToToolError, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { normalizeSaveColorsInput } from "./designSystemNormalize";

function createSaveReadyColors(colors: unknown) {
  if (!colors || typeof colors !== "object") {
    throw new Error("Stored design system colors are invalid");
  }
  const record = colors as Record<string, unknown>;
  const normalized = normalizeSaveColorsInput({
    templateId:
      typeof record.activeTemplateId === "string"
        ? record.activeTemplateId
        : typeof record.templateId === "string"
          ? record.templateId
          : "custom",
    palettes: record.palettes,
    paletteAliases: record.paletteAliases,
    semantic: record.semantic,
  });
  if (!normalized) {
    throw new Error("Stored design system colors cannot be saved safely");
  }
  return normalized;
}

async function readDesignSystemColors(
  adapter: Awaited<ReturnType<typeof getAdapter>>,
): Promise<unknown> {
  const storedDesignSystem = await adapter.getDesignSystem();
  if (storedDesignSystem) {
    return createDesignSystemColorsFromUniversalDesignSystem(
      storedDesignSystem,
    );
  }

  const { unoThemeToColors } = await import("../../../../../../lib/design");
  const settings = await adapter.getSiteSettings();
  return unoThemeToColors(settings?.unocssConfig?.theme?.colors || {});
}

export async function fetchDesignSystemForTools(
  context: AgentToolActionContext,
  detail: ContentReadDetail,
): Promise<AgentToolResult<Record<string, unknown>>> {
  try {
    const adapter = await getAdapter(toToolActionContext(context));
    const colors = await readDesignSystemColors(adapter);
    const designSystem = await getDesignSystem(adapter);
    const settings = await adapter.getSiteSettings();
    const legacyBreakpoints =
      settings &&
      typeof settings === "object" &&
      "breakpoints" in settings &&
      Array.isArray((settings as { breakpoints?: unknown }).breakpoints)
        ? ((settings as { breakpoints: unknown[] }).breakpoints as Parameters<
            typeof resolveUniversalBreakpointItems
          >[1])
        : null;

    const typography = buildTypographyConfig(designSystem);
    const breakpoints = resolveUniversalBreakpointItems(
      designSystem,
      legacyBreakpoints,
    );

    if (detail === "summary") {
      return {
        ok: true,
        data: {
          colors,
          typography,
          // Defaults carry the visual language needed for page creation;
          // omit variable inventories from the compact read.
          globalStyles: { defaults: designSystem.globalStyles.defaults },
          breakpoints: breakpoints.filter((breakpoint) => breakpoint.enabled),
          paletteTemplates: Object.values(PALETTE_TEMPLATES).map(
            (template) => ({
              id: template.id,
              name: template.name,
            }),
          ),
        },
      };
    }

    const saveReadySections = {
      colors: createSaveReadyColors(colors),
      typography,
      globalStyles: designSystem.globalStyles,
      breakpoints,
    };

    return {
      ok: true,
      data: {
        revision: await createCapabilityRevision(saveReadySections),
        ...saveReadySections,
        paletteTemplates: Object.values(PALETTE_TEMPLATES).map((template) => ({
          id: template.id,
          name: template.name,
        })),
      },
    };
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
