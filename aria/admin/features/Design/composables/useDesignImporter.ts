import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";

import { useStudioI18n } from "@/i18n";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useClassEditor } from "@/features/Inspector/composables/useClassEditor";
import { log } from "@/lib/utils/logger";
import { DesignSystemColorsSchema } from "../../../../lib/design";
import { GlobalStylesConfigSchema } from "../../../../lib/styles/universalDesignSystem";
import { useDesignSystem } from "./useDesignSystem";
import { useGlobalStyles } from "./useGlobalStyles";
import {
  TypographyConfigSchema,
} from "./typographyActionResults";
import { useTypography } from "./useTypography";
import {
  resolveSectionMode,
  type DesignImportMode,
  type DesignImportPlan,
  type DesignImportSection,
  type DesignImportSectionId,
} from "../lib/designImporter";

type SelectedImportModes = Partial<Record<DesignImportSectionId, DesignImportMode>>;

interface ApplyDesignImportOptions {
  selectedSections?: readonly DesignImportSectionId[];
  modes?: SelectedImportModes;
}

interface ActionTransportResult {
  data?: unknown;
  error?: { message?: string } | null;
}

const ImportBundleActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
    data: z
      .looseObject({
        colors: DesignSystemColorsSchema.optional(),
        globalStyles: GlobalStylesConfigSchema.optional(),
        typography: TypographyConfigSchema.optional(),
        classes: z.record(z.string(), z.unknown()).optional(),
        contextRules: z.array(z.record(z.string(), z.unknown())).optional(),
        animations: z
          .object({
            keyframes: z.record(z.string(), z.unknown()),
          })
          .optional(),
      }),
  });

function getActionFailureMessage(
  result: ActionTransportResult,
  fallbackMessage: string,
): string | null {
  if (result.error) {
    return result.error.message ?? fallbackMessage;
  }

  if (
    result.data &&
    typeof result.data === "object" &&
    "success" in result.data &&
    result.data.success === false
  ) {
    const error = (result.data as { error?: { message?: string } }).error;
    return error?.message ?? fallbackMessage;
  }

  return null;
}

function sectionToPayload(
  section: DesignImportSection,
  payload: Record<string, unknown>,
): void {
  switch (section.id) {
    case "colors":
      payload.colors = section.data;
      return;
    case "variables":
      payload.variables = section.data;
      return;
    case "globalStyles":
      payload.globalStyles = section.data;
      return;
    case "typography":
      payload.typography = section.data;
      return;
    case "classes":
      payload.classes = section.data;
      return;
    case "contextRules":
      payload.contextRules = section.data;
      return;
    case "animations":
      payload.animations = section.data;
      return;
  }
}

function buildSuccessMessage(
  sectionIds: readonly DesignImportSectionId[],
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  if (sectionIds.length === 1) {
    const label: Record<DesignImportSectionId, string> = {
      colors: t("design.import.asset.colors"),
      variables: t("design.import.asset.variables"),
      globalStyles: t("design.import.asset.globalStyles"),
      typography: t("design.import.asset.typography"),
      classes: t("design.import.asset.classes"),
      contextRules: t("design.import.asset.contextRules"),
      animations: t("design.import.asset.animations"),
    };

    return t("design.import.importedAsset", { asset: label[sectionIds[0]!] });
  }

  const parts: string[] = [];
  if (sectionIds.includes("classes")) parts.push(t("design.import.asset.classes"));
  if (sectionIds.includes("contextRules")) parts.push(t("design.import.asset.contextRules"));
  if (sectionIds.includes("animations")) parts.push(t("design.import.asset.animations"));
  if (sectionIds.includes("variables")) parts.push(t("design.import.asset.variables"));
  if (sectionIds.includes("colors")) parts.push(t("design.import.asset.colors"));
  if (sectionIds.includes("globalStyles")) parts.push(t("design.import.asset.globalStyles"));
  if (sectionIds.includes("typography")) parts.push(t("design.import.asset.typography"));

  if (parts.length > 0) {
    return t("design.import.importedAsset", { asset: parts.join(", ") });
  }

  return t("design.import.importedGroupCount", { count: sectionIds.length });
}

export function useDesignImporter() {
  const { t } = useStudioI18n();
  const isImporting = ref(false);
  const lastError = ref<string | null>(null);

  const designSystem = useDesignSystem();
  const globalStyles = useGlobalStyles();
  const typography = useTypography();
  const classEditor = useClassEditor();
  const { loadSettings } = useSiteSettings();

  const canImport = computed(() => !isImporting.value);

  function applyImportResponse(data: unknown): void {
    const parsed = ImportBundleActionSuccessSchema.safeParse(data);
    if (!parsed.success) {
      log("warn", "[useDesignImporter] Invalid import response payload", {
        issues: parsed.error.issues,
      });
      return;
    }

    const payload = parsed.data.data;

    if (payload.colors) {
      designSystem.applyImportedColors(payload.colors);
    }

    if (payload.globalStyles) {
      globalStyles.applyImportedGlobalStyles(payload.globalStyles);
    }

    if (payload.typography) {
      typography.applyImportedTypography(payload.typography);
    }
  }

  async function reloadImportedState(
    sectionIds: readonly DesignImportSectionId[],
    options: { silent?: boolean } = {},
  ): Promise<void> {
    const silent = options.silent ?? false;
    const reloads: Array<Promise<unknown>> = [
      loadSettings().catch((error) => {
        if (!silent) {
          throw error;
        }
        log("warn", "[useDesignImporter] Failed to reload site settings", {
          error,
        });
      }),
    ];

    if (sectionIds.includes("colors")) {
      reloads.push(
        designSystem.load().catch((error) => {
          if (!silent) {
            throw error;
          }
          log("warn", "[useDesignImporter] Failed to reload colors", { error });
        }),
      );
    }

    if (sectionIds.includes("globalStyles") || sectionIds.includes("variables")) {
      reloads.push(globalStyles.loadGlobalStyles(true, { silent }));
    }

    if (sectionIds.includes("typography")) {
      reloads.push(typography.loadTypography({ silent }));
    }

    if (sectionIds.includes("classes")) {
      reloads.push(
        classEditor.loadClasses(true).catch((error) => {
          if (!silent) {
            throw error;
          }
          log("warn", "[useDesignImporter] Failed to reload classes", {
            error,
          });
        }),
      );
    }

    if (
      sectionIds.includes("contextRules") ||
      sectionIds.includes("animations") ||
      sectionIds.includes("classes")
    ) {
      reloads.push(
        designSystem.load().catch((error) => {
          if (!silent) {
            throw error;
          }
          log("warn", "[useDesignImporter] Failed to reload design system", {
            error,
          });
        }),
      );
    }

    await Promise.all(reloads);
  }

  async function applyDesignImport(
    plan: DesignImportPlan,
    options: ApplyDesignImportOptions = {},
  ): Promise<boolean> {
    const selectedSectionIds =
      options.selectedSections && options.selectedSections.length > 0
        ? [...options.selectedSections]
        : plan.sections.map((section) => section.id);
    const selectedSet = new Set(selectedSectionIds);
    const selectedSections = plan.sections.filter((section) =>
      selectedSet.has(section.id),
    );

    if (selectedSections.length === 0) {
      toast.error(t("design.import.selectAtLeastOne"));
      return false;
    }

    const sectionsPayload: Record<string, unknown> = {};
    const modesPayload: SelectedImportModes = {};

    for (const section of selectedSections) {
      sectionToPayload(section, sectionsPayload);
      modesPayload[section.id] = resolveSectionMode(
        section,
        options.modes ?? {},
      );
    }

    isImporting.value = true;
    lastError.value = null;

    try {
      const result = (await actions.designSystem.importBundle({
        sections: sectionsPayload,
        modes: modesPayload,
      })) as ActionTransportResult;

      const failureMessage = getActionFailureMessage(
        result,
        t("design.import.failed"),
      );
      if (failureMessage) {
        throw new Error(failureMessage);
      }

      applyImportResponse(result.data);
      await reloadImportedState(selectedSectionIds, { silent: true });
      toast.success(buildSuccessMessage(selectedSectionIds, t));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("design.import.failed");
      lastError.value = message;
      log("error", "[useDesignImporter] Import failed", { error });

      try {
        await reloadImportedState(selectedSectionIds, { silent: true });
      } catch (reloadError) {
        log("warn", "[useDesignImporter] Failed to reload after import error", {
          error: reloadError,
        });
      }

      toast.error(message);
      return false;
    } finally {
      isImporting.value = false;
    }
  }

  return {
    isImporting,
    canImport,
    lastError,
    applyDesignImport,
  };
}
