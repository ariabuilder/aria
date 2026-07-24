import { defineAction, ActionError } from "astro:actions";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../../lib/content-sync/mutations";
import {
  normalizeStoredCssProperty,
  cssPropertiesEquivalent,
} from "../../lib/types/classes";
import {
  type CustomClass as NewCustomClass,
  CreateClassInputSchema,
  UpdateClassRuleInputSchema,
  RemoveClassRuleInputSchema,
  UpdateClassPseudoRuleInputSchema,
  RemoveClassPseudoRuleInputSchema,
  DeleteClassInputSchema,
  DeleteClassesInputSchema,
  RenameClassInputSchema,
  DuplicateClassInputSchema,
  ReplaceClassStylesInputSchema,
  ReplaceClassVariantRulesInputSchema,
  BulkImportClassesInputSchema,
  SetAuthoringModeInputSchema,
  SetFrameworkModeInputSchema,
  UpdateUsageInputSchema,
  authoringModeToFrameworkMode,
  frameworkModeToAuthoringMode,
} from "../../lib/schemas/classEditor";
import { requireAuth, resolveAuthorizedMutation } from "../_shared";
import {
  handleCreateClass,
  handleDeleteClass,
  handleDuplicateClass,
  generateCustomClassesForAdapter,
  handleRemoveClassRule,
  handleRenameClass,
  handleReplaceClassStyles,
  handleReplaceClassVariantRules,
  handleUpdateClassRule,
} from "./classMutations";
import { safelyRefreshStyleArtifactsAfterMutation } from "./globalCssArtifacts";
import {
  endPerformanceTracking,
  getDesignSystem,
  log,
  saveAuthoringMode,
  saveDesignSystem,
  startPerformanceTracking,
} from "./_shared";

export const classStyleActions = {
  getClasses: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const operation = "getClasses";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);

        const classes = designSystem.semanticClasses;
        const authoringMode = designSystem.authoring.preferredMode;
        const css = await generateCustomClassesForAdapter(adapter, classes);

        const duration = endPerformanceTracking(operation);
        log("info", "Classes loaded", {
          count: Object.keys(classes).length,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { classes, authoringMode, css },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get classes", { error });
        return {
          success: false,
          error: {
            code: "GET_CLASSES_FAILED",
            message:
              error instanceof Error ? error.message : "Failed to get classes",
          },
        };
      }
    },
  }),

  /**
   * Create a new custom class
   */
  createClass: defineAction({
    accept: "json",
    input: CreateClassInputSchema,
    handler: handleCreateClass,
  }),

  /**
   * Update a rule in a custom class at a specific breakpoint
   */
  updateClassRule: defineAction({
    accept: "json",
    input: UpdateClassRuleInputSchema,
    handler: handleUpdateClassRule,
  }),

  /**
   * Remove a rule from a custom class
   */
  removeClassRule: defineAction({
    accept: "json",
    input: RemoveClassRuleInputSchema,
    handler: handleRemoveClassRule,
  }),

  /**
   * Update a pseudo-state rule (hover, focus, etc.)
   */
  updateClassPseudoRule: defineAction({
    accept: "json",
    input: UpdateClassPseudoRuleInputSchema,
    handler: async (
      { className, state, breakpoint, property, value, important },
      context,
    ) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.updateClassPseudoRule",
        "save-styles",
      );

      const operation = "updateClassPseudoRule";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const classes = designSystem.semanticClasses;
        const cls = classes[className];

        if (!cls) {
          return {
            success: false,
            error: {
              code: "CLASS_NOT_FOUND",
              message: `Class "${className}" not found`,
            },
          };
        }

        // Find or create the pseudo variant
        let pseudo = cls.pseudoVariants.find(
          (p) => p.state === state && p.breakpoint === breakpoint,
        );
        if (!pseudo) {
          pseudo = { state, breakpoint, rules: [] };
          cls.pseudoVariants.push(pseudo);
        }

        const normalizedProperty = normalizeStoredCssProperty(property);

        // Find or create the rule
        const existingRuleIndex = pseudo.rules.findIndex((r) =>
          cssPropertiesEquivalent(r.property, normalizedProperty),
        );
        if (existingRuleIndex >= 0) {
          pseudo.rules[existingRuleIndex] = {
            property: normalizedProperty,
            value,
            important: important ?? false,
          };
        } else {
          pseudo.rules.push({
            property: normalizedProperty,
            value,
            important: important ?? false,
          });
        }

        cls.updatedAt = new Date().toISOString();

        await saveDesignSystem(adapter, designSystem, authorship);
        await safelyRefreshStyleArtifactsAfterMutation(
          adapter,
          `custom-class:${className}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `custom-class:${className}`,
          },
          context,
        );

        const css = await generateCustomClassesForAdapter(adapter, classes);

        const duration = endPerformanceTracking(operation);
        log("info", "Class pseudo rule updated", {
          className,
          state,
          property,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { class: cls, css },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update pseudo rule", { error });
        return {
          success: false,
          error: {
            code: "UPDATE_PSEUDO_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update pseudo rule",
          },
        };
      }
    },
  }),

  /**
   * Remove a pseudo-state rule
   */
  removeClassPseudoRule: defineAction({
    accept: "json",
    input: RemoveClassPseudoRuleInputSchema,
    handler: async ({ className, state, breakpoint, property }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.removeClassPseudoRule",
        "save-styles",
      );

      const operation = "removeClassPseudoRule";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const classes = designSystem.semanticClasses;
        const cls = classes[className];

        if (!cls) {
          return {
            success: false,
            error: {
              code: "CLASS_NOT_FOUND",
              message: `Class "${className}" not found`,
            },
          };
        }

        const normalizedProperty = normalizeStoredCssProperty(property);

        const pseudo = cls.pseudoVariants.find(
          (p) => p.state === state && p.breakpoint === breakpoint,
        );
        if (pseudo) {
          pseudo.rules = pseudo.rules.filter(
            (r) => !cssPropertiesEquivalent(r.property, normalizedProperty),
          );
          if (pseudo.rules.length === 0) {
            cls.pseudoVariants = cls.pseudoVariants.filter(
              (p) => !(p.state === state && p.breakpoint === breakpoint),
            );
          }
        }

        cls.updatedAt = new Date().toISOString();

        await saveDesignSystem(adapter, designSystem, authorship);
        await safelyRefreshStyleArtifactsAfterMutation(
          adapter,
          `custom-class:${className}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `custom-class:${className}`,
          },
          context,
        );

        const css = await generateCustomClassesForAdapter(adapter, classes);

        const duration = endPerformanceTracking(operation);
        log("info", "Class pseudo rule removed", {
          className,
          state,
          property,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { class: cls, css },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to remove pseudo rule", { error });
        return {
          success: false,
          error: {
            code: "REMOVE_PSEUDO_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to remove pseudo rule",
          },
        };
      }
    },
  }),

  /**
   * Delete a custom class
   */
  deleteClass: defineAction({
    accept: "json",
    input: DeleteClassInputSchema,
    handler: handleDeleteClass,
  }),

  /**
   * Delete multiple custom classes at once
   */
  deleteClasses: defineAction({
    accept: "json",
    input: DeleteClassesInputSchema,
    handler: async ({ names }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.deleteClasses",
        "save-styles",
      );

      const operation = "deleteClasses";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const classes = designSystem.semanticClasses;

        const nameSet = new Set(names);
        const deleted: string[] = [];
        const notFound: string[] = [];

        for (const name of nameSet) {
          if (!classes[name]) {
            notFound.push(name);
          } else {
            delete classes[name];
            deleted.push(name);
          }
        }

        if (deleted.length === 0) {
          const duration = endPerformanceTracking(operation);
          log("info", "No classes to delete", {
            notFound,
            duration: `${duration}ms`,
          });

          return {
            success: true,
            data: {
              css: "",
              deleted: [],
              notFound,
            },
          };
        }

        await saveDesignSystem(adapter, designSystem, authorship);
        await safelyRefreshStyleArtifactsAfterMutation(
          adapter,
          `custom-classes:${deleted.join(",")}`,
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `custom-classes:${deleted.join(",")}`,
          },
          context,
        );

        const css = await generateCustomClassesForAdapter(adapter, classes);

        const duration = endPerformanceTracking(operation);
        log("info", "Classes deleted", {
          count: deleted.length,
          notFound: notFound.length,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: {
            css,
            deleted,
            notFound,
          },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to delete classes", { error });
        return {
          success: false,
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Failed to delete classes",
          },
        };
      }
    },
  }),

  /**
   * Rename a custom class
   */
  renameClass: defineAction({
    accept: "json",
    input: RenameClassInputSchema,
    handler: handleRenameClass,
  }),

  /**
   * Duplicate a custom class
   */
  duplicateClass: defineAction({
    accept: "json",
    input: DuplicateClassInputSchema,
    handler: handleDuplicateClass,
  }),

  /**
   * Replace a custom class's style rules with another custom class's rules
   */
  replaceClassStyles: defineAction({
    accept: "json",
    input: ReplaceClassStylesInputSchema,
    handler: handleReplaceClassStyles,
  }),

  /**
   * Atomically replace all rules in a single class variant slice.
   */
  replaceClassVariantRules: defineAction({
    accept: "json",
    input: ReplaceClassVariantRulesInputSchema,
    handler: handleReplaceClassVariantRules,
  }),

  /**
   * Update usage count for a class
   */
  updateClassUsage: defineAction({
    accept: "json",
    input: UpdateUsageInputSchema,
    handler: async ({ className, delta }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.updateClassUsage",
        "save-styles",
      );

      const operation = "updateClassUsage";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const classes = designSystem.semanticClasses;
        const cls = classes[className];

        if (!cls) {
          return {
            success: false,
            error: {
              code: "CLASS_NOT_FOUND",
              message: `Class "${className}" not found`,
            },
          };
        }

        cls.usageCount = Math.max(0, (cls.usageCount ?? 0) + delta);

        await saveDesignSystem(adapter, designSystem, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: `custom-class:${className}:usage`,
          },
          context,
        );

        const duration = endPerformanceTracking(operation);
        log("debug", "Class usage updated", {
          className,
          delta,
          newCount: cls.usageCount,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { usageCount: cls.usageCount },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update usage", { error });
        return {
          success: false,
          error: {
            code: "UPDATE_USAGE_FAILED",
            message:
              error instanceof Error ? error.message : "Failed to update usage",
          },
        };
      }
    },
  }),

  /**
   * Set the canonical authoring mode.
   */
  setAuthoringMode: defineAction({
    accept: "json",
    input: SetAuthoringModeInputSchema,
    handler: async ({ mode }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.setAuthoringMode",
        "save-styles",
      );

      const operation = "setAuthoringMode";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        await saveAuthoringMode(adapter, mode, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "authoring-mode",
          },
          context,
        );

        const duration = endPerformanceTracking(operation);
        log("info", "Authoring mode set", {
          mode,
          frameworkMode: authoringModeToFrameworkMode(mode),
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: {
            mode,
          },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to set authoring mode", { error });
        return {
          success: false,
          error: {
            code: "SET_AUTHORING_MODE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to set authoring mode",
          },
        };
      }
    },
  }),

  /**
   * Set the framework mode (unocss or custom)
   */
  setFrameworkMode: defineAction({
    accept: "json",
    input: SetFrameworkModeInputSchema,
    handler: async ({ mode }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.setFrameworkMode",
        "save-styles",
      );

      const operation = "setFrameworkMode";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const authoringMode = frameworkModeToAuthoringMode(mode);

        await saveAuthoringMode(adapter, authoringMode, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "authoring-mode",
          },
          context,
        );

        const duration = endPerformanceTracking(operation);
        log("info", "Framework mode set", {
          mode,
          authoringMode,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { mode, authoringMode },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to set framework mode", { error });
        return {
          success: false,
          error: {
            code: "SET_MODE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to set framework mode",
          },
        };
      }
    },
  }),

  /**
   * Get generated CSS for all custom classes
   */
  getGeneratedCSS: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const operation = "getGeneratedCSS";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const classes = designSystem.semanticClasses;
        const css = await generateCustomClassesForAdapter(adapter, classes);

        const duration = endPerformanceTracking(operation);
        log("debug", "Generated CSS retrieved", {
          classCount: Object.keys(classes).length,
          cssLength: css.length,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { css },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get generated CSS", { error });
        return {
          success: false,
          error: {
            code: "GET_CSS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get generated CSS",
          },
        };
      }
    },
  }),

  /**
   * Bulk import custom classes — replaces or merges the entire class map.
   */
  bulkImportClasses: defineAction({
    accept: "json",
    input: BulkImportClassesInputSchema,
    handler: async ({ classes: incomingClasses, mode }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "styles.bulkImportClasses",
        "save-styles",
      );

      const operation = "bulkImportClasses";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const designSystem = await getDesignSystem(adapter);
        const existingClasses = designSystem.semanticClasses;
        const now = new Date().toISOString();

        // Normalise incoming classes — strip user-provided metadata, set server-side
        const normalised: Record<string, NewCustomClass> = {};
        for (const [name, cls] of Object.entries(incomingClasses)) {
          normalised[name] = {
            ...cls,
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
          };
        }

        const merged: Record<string, NewCustomClass> =
          mode === "replace"
            ? { ...normalised }
            : { ...existingClasses, ...normalised };

        designSystem.semanticClasses = merged;
        await saveDesignSystem(adapter, designSystem, authorship);
        await safelyRefreshStyleArtifactsAfterMutation(
          adapter,
          "bulk-import-classes",
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-styles",
            mutationTarget: "bulk-import-classes",
          },
          context,
        );

        const css = await generateCustomClassesForAdapter(adapter, merged);

        const duration = endPerformanceTracking(operation);
        log("info", "Classes bulk imported", {
          count: Object.keys(merged).length,
          mode,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: { classes: merged, css },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to bulk import classes", { error });
        return {
          success: false,
          error: {
            code: "BULK_IMPORT_CLASSES_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to bulk import classes",
          },
        };
      }
    },
  }),
};
