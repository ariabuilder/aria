import { ref, toRaw, watch, type Ref } from "vue";
import { z } from "zod";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";

import { log } from "@/lib/utils/logger";
import { recordStateSnapshot } from "../../History";
import {
  GLOBAL_STYLE_VARIABLE_CATEGORIES,
  GlobalStylesConfigSchema,
  GlobalStyleDefaultsSchema,
  GlobalStyleVariableCategorySchema,
  GlobalStyleVariablesSchema,
  VariableSourceTypeSchema,
  createDefaultGlobalStylesConfig,
  type GlobalStyleVariableCategory,
  type GlobalStyleVariables,
  type GlobalStylesConfig,
} from "../../../../lib/styles/universalDesignSystem";
import {
  createEmptyVariableSet,
  mergeImportedVariableSet,
} from "../lib/variableManagerImport";
import { createSequentialDuplicateKey } from "../lib/variableManagerKeys";
import {
  GlobalStylesLoadActionSuccessSchema,
  GlobalStylesSaveActionSuccessSchema,
  unwrapGlobalStylesActionResult,
} from "./globalStylesActionResults";
import { useSiteSettings } from "../../../composables/useSiteSettings";

const globalStyles: Ref<GlobalStylesConfig> = ref(
  createDefaultGlobalStylesConfig(),
);
const isLoading = ref(false);
const isSaving = ref(false);
const hasUnsavedChanges = ref(false);
const hasLoaded = ref(false);
const persistedSnapshot = ref(JSON.stringify(globalStyles.value));
const { loadSettings: reloadSiteSettings } = useSiteSettings();
let loadGlobalStylesPromise: Promise<void> | null = null;

const GLOBAL_STYLE_VARIABLE_CATEGORY_SET = new Set<string>(
  GLOBAL_STYLE_VARIABLE_CATEGORIES,
);

const GlobalStyleVariableDefinitionDraftSchema = z.object({
  label: z.string(),
  value: z.string(),
  category: GlobalStyleVariableCategorySchema,
  description: z.string().optional(),
});

const GlobalStyleVariableAliasDraftSchema = z.object({
  label: z.string(),
  sourceType: VariableSourceTypeSchema,
  sourceKey: z.string(),
  fallback: z.string().optional(),
});

const GlobalStylesDraftSnapshotSchema = z
  .object({
    globalStyles: z.object({
      defaults: GlobalStyleDefaultsSchema,
      variables: z.object({
        custom: z.record(z.string(), GlobalStyleVariableDefinitionDraftSchema),
        aliases: z.record(z.string(), GlobalStyleVariableAliasDraftSchema),
      }),
    }),
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceString(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function sanitizeStyleSection<T extends object>(
  template: T,
  value: unknown,
): T {
  const source = isRecord(value) ? value : {};

  return Object.fromEntries(
    Object.entries(template as Record<string, unknown>).map(
      ([key, templateValue]) => {
      const nextValue = source[key];

      if (isRecord(templateValue)) {
        return [key, sanitizeStyleSection(templateValue, nextValue)];
      }

      return [key, coerceString(nextValue)];
      },
    ),
  ) as T;
}

function sanitizeVariableCategory(value: unknown): GlobalStyleVariableCategory {
  return GLOBAL_STYLE_VARIABLE_CATEGORY_SET.has(String(value))
    ? (String(value) as GlobalStyleVariableCategory)
    : "other";
}

function sanitizeSourceType(value: unknown): "token" | "custom" {
  return value === "token" ? "token" : "custom";
}

function normalizeGlobalStylesConfig(
  config: GlobalStylesConfig,
): GlobalStylesConfig {
  const template = createDefaultGlobalStylesConfig();
  const source: Record<string, unknown> = isRecord(toRaw(config))
    ? (toRaw(config) as unknown as Record<string, unknown>)
    : {};
  const sourceVariables = isRecord(source.variables) ? source.variables : {};
  const sourceCustom = isRecord(sourceVariables.custom)
    ? sourceVariables.custom
    : {};
  const sourceAliases = isRecord(sourceVariables.aliases)
    ? sourceVariables.aliases
    : {};

  return {
    defaults: sanitizeStyleSection(template.defaults, source.defaults),
    variables: {
      custom: Object.fromEntries(
        Object.entries(sourceCustom).map(([key, value]) => {
          const definition = isRecord(value) ? value : {};

          return [
            key,
            {
              label: coerceString(definition.label),
              value: coerceString(definition.value),
              category: sanitizeVariableCategory(definition.category),
              description: coerceString(definition.description),
            },
          ];
        }),
      ),
      aliases: Object.fromEntries(
        Object.entries(sourceAliases).map(([key, value]) => {
          const alias = isRecord(value) ? value : {};

          return [
            key,
            {
              label: coerceString(alias.label),
              sourceType: sanitizeSourceType(alias.sourceType),
              sourceKey: coerceString(alias.sourceKey),
              fallback: coerceString(alias.fallback),
            },
          ];
        }),
      ),
    },
  };
}

function cloneGlobalStyles(config: GlobalStylesConfig): GlobalStylesConfig {
  return normalizeGlobalStylesConfig(config);
}

function setPersistedState(config: GlobalStylesConfig): void {
  const nextConfig = cloneGlobalStyles(config);
  globalStyles.value = nextConfig;
  persistedSnapshot.value = JSON.stringify(nextConfig);
  hasUnsavedChanges.value = false;
  hasLoaded.value = true;
}

function applyWorkingState(config: GlobalStylesConfig): void {
  const nextConfig = cloneGlobalStyles(config);
  globalStyles.value = nextConfig;
  hasUnsavedChanges.value =
    JSON.stringify(nextConfig) !== persistedSnapshot.value;
  hasLoaded.value = true;
}

function captureHistorySnapshot(): z.infer<
  typeof GlobalStylesDraftSnapshotSchema
> {
  return GlobalStylesDraftSnapshotSchema.parse({
    globalStyles: cloneGlobalStyles(globalStyles.value),
  });
}

function applyHistorySnapshot(snapshot: Record<string, unknown>): void {
  const parsedSnapshot = GlobalStylesDraftSnapshotSchema.safeParse(snapshot);
  if (!parsedSnapshot.success) {
    log("warn", "[useGlobalStyles] Invalid history snapshot", {
      issues: parsedSnapshot.error.issues,
    });
    return;
  }

  applyWorkingState(parsedSnapshot.data.globalStyles);
}

async function recordVariableHistoryChange<T>(options: {
  type:
    | "reset-global-variables"
    | "create-global-variable"
    | "delete-global-variable"
    | "delete-global-variables"
    | "rename-global-variable"
    | "duplicate-global-variable"
    | "create-global-alias"
    | "delete-global-alias"
    | "delete-global-aliases"
    | "rename-global-alias"
    | "duplicate-global-alias"
    | "import-global-variables";
  description: string;
  action: () => T | Promise<T>;
}): Promise<T> {
  return await recordStateSnapshot({
    type: options.type,
    description: options.description,
    captureState: captureHistorySnapshot,
    action: async () => {
      const result = await options.action();
      // Auto-persist after every variable mutation
      await saveGlobalStyles({ silent: true });
      return result;
    },
    applySnapshot: applyHistorySnapshot,
  });
}

function createUniqueKey(prefix: string, existingKeys: string[]): string {
  let index = existingKeys.length + 1;

  while (existingKeys.includes(`${prefix}-${index}`)) {
    index += 1;
  }

  return `${prefix}-${index}`;
}

watch(
  globalStyles,
  (nextConfig) => {
    hasUnsavedChanges.value =
      JSON.stringify(normalizeGlobalStylesConfig(nextConfig)) !==
      persistedSnapshot.value;
  },
  { deep: true },
);

function applyImportedGlobalStyles(config: GlobalStylesConfig): void {
  setPersistedState(config);
}

function hydrateGlobalStyles(config: GlobalStylesConfig): void {
  setPersistedState(config);
}

async function loadGlobalStyles(
  force = false,
  options: { silent?: boolean } = {},
): Promise<void> {
  if (hasLoaded.value && !force) {
    return;
  }

  if (loadGlobalStylesPromise && !force) {
    return loadGlobalStylesPromise;
  }

  isLoading.value = true;

  loadGlobalStylesPromise = (async () => {
    try {
      const result = unwrapGlobalStylesActionResult(
        await actions.designSystem.getGlobalStyles({}),
        GlobalStylesLoadActionSuccessSchema,
        "Failed to load global styles",
        {
          source: "useGlobalStyles.loadGlobalStyles",
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setPersistedState(result.data.data.globalStyles);
    } catch (error) {
      log("error", "[useGlobalStyles] Failed to load global styles", {
        error,
      });
      if (!options.silent) {
        toast.error("Failed to load global styles");
      }
    } finally {
      isLoading.value = false;
      loadGlobalStylesPromise = null;
    }
  })();

  return loadGlobalStylesPromise;
}

async function saveGlobalStyles(options?: { silent?: boolean }): Promise<void> {
  isSaving.value = true;

  try {
    const parsedGlobalStyles = GlobalStylesConfigSchema.safeParse(
      cloneGlobalStyles(globalStyles.value),
    );
    if (!parsedGlobalStyles.success) {
      throw new Error(
        parsedGlobalStyles.error.issues[0]?.message ??
          "Invalid global styles configuration",
      );
    }

    const result = unwrapGlobalStylesActionResult(
      await actions.designSystem.saveGlobalStyles({
        globalStyles: parsedGlobalStyles.data,
      }),
      GlobalStylesSaveActionSuccessSchema,
      "Failed to save global styles",
      {
        source: "useGlobalStyles.saveGlobalStyles",
      },
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    setPersistedState(result.data.data.globalStyles);

    // Keep the shared site settings singleton in sync so styleRevision updates
    // propagate to StageFrame and trigger a render-style reload.
    try {
      await reloadSiteSettings();
    } catch (reloadError) {
      log("warn", "[useGlobalStyles] Failed to refresh site settings", {
        error: reloadError,
      });
    }

    if (!options?.silent) {
      toast.success("Global styles saved");
    }
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to save global styles", {
      error,
    });
    toast.error("Failed to save global styles");
  } finally {
    isSaving.value = false;
  }
}

function resetGlobalStyles(): void {
  globalStyles.value = createDefaultGlobalStylesConfig();
}

function resetVariables(): void {
  globalStyles.value.variables = createEmptyVariableSet();
}

async function resetVariablesWithHistory(): Promise<boolean> {
  try {
    await recordVariableHistoryChange({
      type: "reset-global-variables",
      description: "Reset variables",
      action: async () => {
        resetVariables();
      },
    });

    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to reset variables", {
      error,
    });
    toast.error("Failed to reset variables");
    return false;
  }
}

function addCustomVariable(): string {
  const key = createUniqueKey(
    "custom-var",
    Object.keys(globalStyles.value.variables.custom),
  );

  globalStyles.value.variables.custom[key] = {
    label: key,
    value: "",
    category: "other" satisfies GlobalStyleVariableCategory,
    description: "",
  };

  return key;
}

async function addCustomVariableWithHistory(): Promise<string | null> {
  try {
    return await recordVariableHistoryChange({
      type: "create-global-variable",
      description: "Create variable",
      action: async () => addCustomVariable(),
    });
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to create variable", {
      error,
    });
    toast.error("Failed to create variable");
    return null;
  }
}

function removeCustomVariable(key: string): void {
  delete globalStyles.value.variables.custom[key];

  for (const alias of Object.values(globalStyles.value.variables.aliases)) {
    if (alias.sourceType === "custom" && alias.sourceKey === key) {
      alias.sourceKey = "";
    }
  }
}

async function removeCustomVariableWithHistory(key: string): Promise<boolean> {
  if (!(key in globalStyles.value.variables.custom)) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "delete-global-variable",
      description: `Delete variable: ${key}`,
      action: async () => {
        removeCustomVariable(key);
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to delete variable", {
      key,
      error,
    });
    toast.error("Failed to delete variable");
    return false;
  }
}

async function removeCustomVariablesWithHistory(
  keys: string[],
): Promise<boolean> {
  keys = keys.filter((key) => key in globalStyles.value.variables.custom);

  if (keys.length === 0) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "delete-global-variables",
      description: `Delete ${keys.length} variable${keys.length === 1 ? "" : "s"}: ${keys.join(", ")}`,
      action: async () => {
        for (const key of keys) {
          removeCustomVariable(key);
        }
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to delete variables", {
      keys,
      error,
    });
    toast.error("Failed to delete variables");
    return false;
  }
}

function duplicateCustomVariable(key: string): string | null {
  const entry = globalStyles.value.variables.custom[key];
  if (!entry) {
    return null;
  }

  const nextKey = createSequentialDuplicateKey(
    key,
    Object.keys(globalStyles.value.variables.custom),
  );

  globalStyles.value.variables.custom[nextKey] = {
    ...entry,
  };

  return nextKey;
}

async function duplicateCustomVariableWithHistory(
  key: string,
): Promise<string | null> {
  if (!(key in globalStyles.value.variables.custom)) {
    return null;
  }

  try {
    return await recordVariableHistoryChange({
      type: "duplicate-global-variable",
      description: `Duplicate variable: ${key}`,
      action: async () => duplicateCustomVariable(key),
    });
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to duplicate variable", {
      key,
      error,
    });
    toast.error("Failed to duplicate variable");
    return null;
  }
}

function renameCustomVariableKey(currentKey: string, nextKeyRaw: string): void {
  const nextKey = nextKeyRaw.trim();
  if (!nextKey || nextKey === currentKey) return;
  if (nextKey in globalStyles.value.variables.custom) return;

  const entry = globalStyles.value.variables.custom[currentKey];
  if (!entry) return;

  const nextEntries = { ...globalStyles.value.variables.custom };
  delete nextEntries[currentKey];
  nextEntries[nextKey] = entry;
  globalStyles.value.variables.custom = nextEntries;

  for (const alias of Object.values(globalStyles.value.variables.aliases)) {
    if (alias.sourceType === "custom" && alias.sourceKey === currentKey) {
      alias.sourceKey = nextKey;
    }
  }
}

async function renameCustomVariableKeyWithHistory(
  currentKey: string,
  nextKeyRaw: string,
): Promise<boolean> {
  const nextKey = nextKeyRaw.trim();

  if (
    !nextKey ||
    nextKey === currentKey ||
    !(currentKey in globalStyles.value.variables.custom) ||
    nextKey in globalStyles.value.variables.custom
  ) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "rename-global-variable",
      description: `Rename variable: ${currentKey} to ${nextKey}`,
      action: async () => {
        renameCustomVariableKey(currentKey, nextKey);
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to rename variable", {
      currentKey,
      nextKey,
      error,
    });
    toast.error("Failed to rename variable");
    return false;
  }
}

function addAlias(): string {
  const key = createUniqueKey(
    "alias-var",
    Object.keys(globalStyles.value.variables.aliases),
  );

  globalStyles.value.variables.aliases[key] = {
    label: key,
    sourceType: "custom",
    sourceKey: "",
    fallback: "",
  };

  return key;
}

async function addAliasWithHistory(): Promise<string | null> {
  try {
    return await recordVariableHistoryChange({
      type: "create-global-alias",
      description: "Create alias",
      action: async () => addAlias(),
    });
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to create alias", {
      error,
    });
    toast.error("Failed to create alias");
    return null;
  }
}

function removeAlias(key: string): void {
  delete globalStyles.value.variables.aliases[key];
}

async function removeAliasWithHistory(key: string): Promise<boolean> {
  if (!(key in globalStyles.value.variables.aliases)) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "delete-global-alias",
      description: `Delete alias: ${key}`,
      action: async () => {
        removeAlias(key);
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to delete alias", {
      key,
      error,
    });
    toast.error("Failed to delete alias");
    return false;
  }
}

async function removeAliasesWithHistory(keys: string[]): Promise<boolean> {
  keys = keys.filter((key) => key in globalStyles.value.variables.aliases);

  if (keys.length === 0) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "delete-global-aliases",
      description: `Delete ${keys.length} alias${keys.length === 1 ? "" : "es"}: ${keys.join(", ")}`,
      action: async () => {
        for (const key of keys) {
          removeAlias(key);
        }
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to delete aliases", {
      keys,
      error,
    });
    toast.error("Failed to delete aliases");
    return false;
  }
}

function duplicateAlias(key: string): string | null {
  const entry = globalStyles.value.variables.aliases[key];
  if (!entry) {
    return null;
  }

  const nextKey = createSequentialDuplicateKey(
    key,
    Object.keys(globalStyles.value.variables.aliases),
  );

  globalStyles.value.variables.aliases[nextKey] = {
    ...entry,
  };

  return nextKey;
}

async function duplicateAliasWithHistory(key: string): Promise<string | null> {
  if (!(key in globalStyles.value.variables.aliases)) {
    return null;
  }

  try {
    return await recordVariableHistoryChange({
      type: "duplicate-global-alias",
      description: `Duplicate alias: ${key}`,
      action: async () => duplicateAlias(key),
    });
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to duplicate alias", {
      key,
      error,
    });
    toast.error("Failed to duplicate alias");
    return null;
  }
}

function renameAliasKey(currentKey: string, nextKeyRaw: string): void {
  const nextKey = nextKeyRaw.trim();
  if (!nextKey || nextKey === currentKey) return;
  if (nextKey in globalStyles.value.variables.aliases) return;

  const entry = globalStyles.value.variables.aliases[currentKey];
  if (!entry) return;

  const nextEntries = { ...globalStyles.value.variables.aliases };
  delete nextEntries[currentKey];
  nextEntries[nextKey] = entry;
  globalStyles.value.variables.aliases = nextEntries;
}

async function renameAliasKeyWithHistory(
  currentKey: string,
  nextKeyRaw: string,
): Promise<boolean> {
  const nextKey = nextKeyRaw.trim();

  if (
    !nextKey ||
    nextKey === currentKey ||
    !(currentKey in globalStyles.value.variables.aliases) ||
    nextKey in globalStyles.value.variables.aliases
  ) {
    return false;
  }

  try {
    await recordVariableHistoryChange({
      type: "rename-global-alias",
      description: `Rename alias: ${currentKey} to ${nextKey}`,
      action: async () => {
        renameAliasKey(currentKey, nextKey);
      },
    });
    return true;
  } catch (error) {
    log("error", "[useGlobalStyles] Failed to rename alias", {
      currentKey,
      nextKey,
      error,
    });
    toast.error("Failed to rename alias");
    return false;
  }
}

function importVariables(importedVariables: GlobalStyleVariables): {
  customCount: number;
  aliasCount: number;
} {
  const parsedImportedVariables =
    GlobalStyleVariablesSchema.safeParse(importedVariables);

  if (!parsedImportedVariables.success) {
    throw new Error(
      parsedImportedVariables.error.issues[0]?.message ??
        "Invalid imported variables",
    );
  }

  globalStyles.value.variables = mergeImportedVariableSet(
    globalStyles.value.variables,
    parsedImportedVariables.data,
  );

  return {
    customCount: Object.keys(parsedImportedVariables.data.custom).length,
    aliasCount: Object.keys(parsedImportedVariables.data.aliases).length,
  };
}

async function importVariablesWithHistory(
  importedVariables: GlobalStyleVariables,
): Promise<{
  customCount: number;
  aliasCount: number;
}> {
  return await recordVariableHistoryChange({
    type: "import-global-variables",
    description: "Import variables",
    action: async () => importVariables(importedVariables),
  });
}

function replaceVariables(importedVariables: GlobalStyleVariables): {
  customCount: number;
  aliasCount: number;
} {
  const parsedImportedVariables =
    GlobalStyleVariablesSchema.safeParse(importedVariables);

  if (!parsedImportedVariables.success) {
    throw new Error(
      parsedImportedVariables.error.issues[0]?.message ??
        "Invalid imported variables",
    );
  }

  globalStyles.value.variables = mergeImportedVariableSet(
    createEmptyVariableSet(),
    parsedImportedVariables.data,
  );

  return {
    customCount: Object.keys(parsedImportedVariables.data.custom).length,
    aliasCount: Object.keys(parsedImportedVariables.data.aliases).length,
  };
}

async function replaceVariablesWithHistory(
  importedVariables: GlobalStyleVariables,
): Promise<{
  customCount: number;
  aliasCount: number;
}> {
  return await recordVariableHistoryChange({
    type: "import-global-variables",
    description: "Replace variables",
    action: async () => replaceVariables(importedVariables),
  });
}

export function useGlobalStyles() {
  return {
    globalStyles,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    hasLoaded,
    loadGlobalStyles,
    hydrateGlobalStyles,
    applyImportedGlobalStyles,
    saveGlobalStyles,
    resetGlobalStyles,
    resetVariables,
    resetVariablesWithHistory,
    addCustomVariable,
    addCustomVariableWithHistory,
    duplicateCustomVariable,
    duplicateCustomVariableWithHistory,
    removeCustomVariable,
    removeCustomVariableWithHistory,
    removeCustomVariablesWithHistory,
    renameCustomVariableKey,
    renameCustomVariableKeyWithHistory,
    addAlias,
    addAliasWithHistory,
    duplicateAlias,
    duplicateAliasWithHistory,
    removeAlias,
    removeAliasWithHistory,
    removeAliasesWithHistory,
    renameAliasKey,
    renameAliasKeyWithHistory,
    importVariables,
    importVariablesWithHistory,
    replaceVariables,
    replaceVariablesWithHistory,
  };
}
