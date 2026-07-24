import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../../lib/content-sync/mutations";
import {
  normalizeCssRuleList,
  normalizeStoredCssProperty,
  cssPropertiesEquivalent,
} from "../../lib/types/classes";
import { generateCustomClasses } from "../../lib/styles/generateCustomCSS";
import {
  createDefaultUniversalDesignSystem,
  resolveBreakpointWidthMapFromDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import {
  type CustomClass as NewCustomClass,
  CreateClassInputSchema,
  UpdateClassRuleInputSchema,
  RemoveClassRuleInputSchema,
  DeleteClassInputSchema,
  RenameClassInputSchema,
  DuplicateClassInputSchema,
  ReplaceClassStylesInputSchema,
  ReplaceClassVariantRulesInputSchema,
} from "../../lib/schemas/classEditor";
import {
  resolveAuthorizedMutation,
  saveResource,
  type CollectionType,
} from "../_shared";
import type { AuthorshipSaveContext, SaveableResource } from "../_shared";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";
import {
  endPerformanceTracking,
  getDesignSystem,
  log,
  saveDesignSystem,
  startPerformanceTracking,
  type StylesStorageAdapter,
} from "./_shared";
import { safelyRefreshStyleArtifactsAfterMutation } from "./globalCssArtifacts";

type ClassReferenceResource = PageDSL | LayoutDSL | ComponentDSL;

interface ClassReferenceMigrationUpdate {
  collection: CollectionType;
  id: string;
  resource: ClassReferenceResource;
  referencesUpdated: number;
}

interface ClassReferenceMigration {
  updates: ClassReferenceMigrationUpdate[];
  documentsUpdated: number;
  referencesUpdated: number;
}

function replaceCustomClassReferenceList(
  classNames: readonly string[] | undefined,
  oldName: string,
  newName: string,
): { classNames: string[] | undefined; referencesUpdated: number } {
  if (!classNames?.length) {
    return {
      classNames: classNames ? [...classNames] : undefined,
      referencesUpdated: 0,
    };
  }

  const nextClassNames: string[] = [];
  let referencesUpdated = 0;

  for (const className of classNames) {
    const nextClassName = className === oldName ? newName : className;
    if (className === oldName) {
      referencesUpdated += 1;
    }

    if (!nextClassNames.includes(nextClassName)) {
      nextClassNames.push(nextClassName);
    }
  }

  if (referencesUpdated === 0) {
    return { classNames: [...classNames], referencesUpdated };
  }

  return { classNames: nextClassNames, referencesUpdated };
}

function replaceCustomClassReferencesInNode(
  node: BuilderNode,
  oldName: string,
  newName: string,
): { node: BuilderNode; referencesUpdated: number } {
  const classResult = replaceCustomClassReferenceList(
    node.customClasses,
    oldName,
    newName,
  );

  let referencesUpdated = classResult.referencesUpdated;
  let childrenChanged = false;

  const children = node.children.map((child) => {
    const childResult = replaceCustomClassReferencesInNode(
      child,
      oldName,
      newName,
    );
    referencesUpdated += childResult.referencesUpdated;
    if (childResult.node !== child) {
      childrenChanged = true;
    }
    return childResult.node;
  });

  if (classResult.referencesUpdated === 0 && !childrenChanged) {
    return { node, referencesUpdated };
  }

  return {
    node: {
      ...node,
      ...(classResult.referencesUpdated > 0
        ? { customClasses: classResult.classNames ?? [] }
        : {}),
      ...(childrenChanged ? { children } : {}),
    },
    referencesUpdated,
  };
}

function replaceCustomClassReferencesInNodes(
  nodes: readonly BuilderNode[],
  oldName: string,
  newName: string,
): { nodes: BuilderNode[]; referencesUpdated: number } {
  let referencesUpdated = 0;
  let changed = false;

  const nextNodes = nodes.map((node) => {
    const result = replaceCustomClassReferencesInNode(node, oldName, newName);
    referencesUpdated += result.referencesUpdated;
    if (result.node !== node) {
      changed = true;
    }
    return result.node;
  });

  return {
    nodes: changed ? nextNodes : [...nodes],
    referencesUpdated,
  };
}

function withUpdatedNodes<TResource extends ClassReferenceResource>(
  resource: TResource,
  nodes: BuilderNode[],
  updatedAt: string,
): TResource {
  return {
    ...resource,
    nodes,
    updatedAt,
  };
}

async function buildCustomClassReferenceMigration(
  adapter: StylesStorageAdapter,
  oldName: string,
  newName: string,
): Promise<ClassReferenceMigration> {
  const [pages, layouts, components] = await Promise.all([
    adapter.listPagesDSL(),
    adapter.listLayoutsDSL(),
    adapter.listComponentsDSL(),
  ]);

  const now = new Date().toISOString();
  const updates: ClassReferenceMigrationUpdate[] = [];

  for (const page of pages) {
    const id = page.slug ?? page.id;
    const pageDsl = await adapter.getPageDSL(id);
    if (!pageDsl) {
      throw new Error(`Page "${id}" could not be loaded for class rename`);
    }

    const result = replaceCustomClassReferencesInNodes(
      pageDsl.nodes,
      oldName,
      newName,
    );
    if (result.referencesUpdated === 0) {
      continue;
    }

    updates.push({
      collection: "pages",
      id,
      resource: withUpdatedNodes(pageDsl, result.nodes, now),
      referencesUpdated: result.referencesUpdated,
    });
  }

  for (const layout of layouts) {
    const id = layout.slug ?? layout.id;
    const result = replaceCustomClassReferencesInNodes(
      layout.nodes,
      oldName,
      newName,
    );
    if (result.referencesUpdated === 0) {
      continue;
    }

    updates.push({
      collection: "layouts",
      id,
      resource: withUpdatedNodes(layout, result.nodes, now),
      referencesUpdated: result.referencesUpdated,
    });
  }

  for (const component of components) {
    const id = component.id;
    const result = replaceCustomClassReferencesInNodes(
      component.nodes,
      oldName,
      newName,
    );
    if (result.referencesUpdated === 0) {
      continue;
    }

    updates.push({
      collection: "components",
      id,
      resource: withUpdatedNodes(component, result.nodes, now),
      referencesUpdated: result.referencesUpdated,
    });
  }

  return {
    updates,
    documentsUpdated: updates.length,
    referencesUpdated: updates.reduce(
      (total, update) => total + update.referencesUpdated,
      0,
    ),
  };
}

async function saveCustomClassReferenceMigration(
  adapter: StylesStorageAdapter,
  context: ActionAPIContext,
  authorship: AuthorshipSaveContext,
  migration: ClassReferenceMigration,
): Promise<void> {
  for (const update of migration.updates) {
    await saveResource(
      adapter,
      context,
      update.collection,
      update.id,
      update.resource as SaveableResource,
      authorship,
      { locals: context.locals },
    );
  }
}

export async function generateCustomClassesForAdapter(
  adapter: StylesStorageAdapter,
  classes: Record<string, NewCustomClass>,
): Promise<string> {
  const designSystem = await adapter
    .getDesignSystem()
    .then((value) => value ?? createDefaultUniversalDesignSystem());

  return generateCustomClasses(
    classes,
    resolveBreakpointWidthMapFromDesignSystem(designSystem),
  );
}

export async function handleCreateClass(
  input: z.infer<typeof CreateClassInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { name, description, initialRules } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.createClass",
    "save-styles",
  );

  const operation = "createClass";
  startPerformanceTracking(operation);

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const classes = designSystem.semanticClasses;

    // Check for duplicate
    if (classes[name]) {
      return {
        success: false,
        error: {
          code: "CLASS_EXISTS",
          message: `Class "${name}" already exists`,
        },
      };
    }

    const now = new Date().toISOString();
    const newClass: NewCustomClass = {
      id: name,
      name,
      description,
      variants: initialRules?.length
        ? [{ breakpoint: "base", rules: initialRules }]
        : [],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    classes[name] = newClass;

    await saveDesignSystem(adapter, designSystem, authorship);
    await safelyRefreshStyleArtifactsAfterMutation(
      adapter,
      `custom-class:${name}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `custom-class:${name}`,
      },
      context,
    );

    const css = await generateCustomClassesForAdapter(adapter, classes);

    const duration = endPerformanceTracking(operation);
    log("info", "Class created", { name, duration: `${duration}ms` });

    return {
      success: true,
      data: { class: newClass, css },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to create class", { error });
    return {
      success: false,
      error: {
        code: "CREATE_CLASS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to create class",
      },
    };
  }
}

export async function handleUpdateClassRule(
  input: z.infer<typeof UpdateClassRuleInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { className, breakpoint, property, value, important } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.updateClassRule",
    "save-styles",
  );

  const operation = "updateClassRule";
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

    // Find or create the variant for this breakpoint
    let variant = cls.variants.find((v) => v.breakpoint === breakpoint);
    if (!variant) {
      variant = { breakpoint, rules: [] };
      cls.variants.push(variant);
    }

    const normalizedProperty = normalizeStoredCssProperty(property);

    // Find or create the rule
    const existingRuleIndex = variant.rules.findIndex((r) =>
      cssPropertiesEquivalent(r.property, normalizedProperty),
    );
    if (existingRuleIndex >= 0) {
      variant.rules[existingRuleIndex] = {
        property: normalizedProperty,
        value,
        important: important ?? false,
      };
    } else {
      variant.rules.push({
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
    log("info", "Class rule updated", {
      className,
      breakpoint,
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
    log("error", "Failed to update class rule", { error });
    return {
      success: false,
      error: {
        code: "UPDATE_RULE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to update class rule",
      },
    };
  }
}

export async function handleRemoveClassRule(
  input: z.infer<typeof RemoveClassRuleInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { className, breakpoint, property } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.removeClassRule",
    "save-styles",
  );

  const operation = "removeClassRule";
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

    const variant = cls.variants.find((v) => v.breakpoint === breakpoint);
    if (variant) {
      variant.rules = variant.rules.filter(
        (r) => !cssPropertiesEquivalent(r.property, normalizedProperty),
      );
      if (variant.rules.length === 0) {
        cls.variants = cls.variants.filter((v) => v.breakpoint !== breakpoint);
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
    log("info", "Class rule removed", {
      className,
      breakpoint,
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
    log("error", "Failed to remove class rule", { error });
    return {
      success: false,
      error: {
        code: "REMOVE_RULE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to remove class rule",
      },
    };
  }
}

export async function handleDeleteClass(
  input: z.infer<typeof DeleteClassInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { name } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.deleteClass",
    "save-styles",
  );

  const operation = "deleteClass";
  startPerformanceTracking(operation);

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const classes = designSystem.semanticClasses;

    if (!classes[name]) {
      return {
        success: false,
        error: {
          code: "CLASS_NOT_FOUND",
          message: `Class "${name}" not found`,
        },
      };
    }

    delete classes[name];

    await saveDesignSystem(adapter, designSystem, authorship);
    await safelyRefreshStyleArtifactsAfterMutation(
      adapter,
      `custom-class:${name}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `custom-class:${name}`,
      },
      context,
    );

    const css = await generateCustomClassesForAdapter(adapter, classes);

    const duration = endPerformanceTracking(operation);
    log("info", "Class deleted", { name, duration: `${duration}ms` });

    return {
      success: true,
      data: { css },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to delete class", { error });
    return {
      success: false,
      error: {
        code: "DELETE_CLASS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to delete class",
      },
    };
  }
}

export async function handleRenameClass(
  input: z.infer<typeof RenameClassInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { oldName, newName } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.renameClass",
    "save-styles",
  );

  const operation = "renameClass";
  startPerformanceTracking(operation);

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const classes = designSystem.semanticClasses;

    if (!classes[oldName]) {
      return {
        success: false,
        error: {
          code: "CLASS_NOT_FOUND",
          message: `Class "${oldName}" not found`,
        },
      };
    }

    if (classes[newName]) {
      return {
        success: false,
        error: {
          code: "CLASS_EXISTS",
          message: `Class "${newName}" already exists`,
        },
      };
    }

    const referenceMigration = await buildCustomClassReferenceMigration(
      adapter,
      oldName,
      newName,
    );

    const cls = classes[oldName];
    cls.id = newName;
    cls.name = newName;
    cls.updatedAt = new Date().toISOString();

    classes[newName] = cls;
    delete classes[oldName];

    await saveDesignSystem(adapter, designSystem, authorship);
    await saveCustomClassReferenceMigration(
      adapter,
      context,
      authorship,
      referenceMigration,
    );
    await safelyRefreshStyleArtifactsAfterMutation(
      adapter,
      `custom-class:${newName}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `custom-class:${newName}`,
      },
      context,
    );

    const css = await generateCustomClassesForAdapter(adapter, classes);

    const duration = endPerformanceTracking(operation);
    log("info", "Class renamed", {
      oldName,
      newName,
      referencesUpdated: referenceMigration.referencesUpdated,
      documentsUpdated: referenceMigration.documentsUpdated,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      data: {
        class: cls,
        css,
        referencesUpdated: referenceMigration.referencesUpdated,
        documentsUpdated: referenceMigration.documentsUpdated,
      },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to rename class", { error });
    return {
      success: false,
      error: {
        code: "RENAME_CLASS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to rename class",
      },
    };
  }
}

export async function handleDuplicateClass(
  input: z.infer<typeof DuplicateClassInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { sourceName, newName } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.duplicateClass",
    "save-styles",
  );

  const operation = "duplicateClass";
  startPerformanceTracking(operation);

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const classes = designSystem.semanticClasses;

    if (!classes[sourceName]) {
      return {
        success: false,
        error: {
          code: "CLASS_NOT_FOUND",
          message: `Class "${sourceName}" not found`,
        },
      };
    }

    if (classes[newName]) {
      return {
        success: false,
        error: {
          code: "CLASS_EXISTS",
          message: `Class "${newName}" already exists`,
        },
      };
    }

    const source = classes[sourceName];
    const now = new Date().toISOString();

    const newClass: NewCustomClass = {
      id: newName,
      name: newName,
      description: source.description
        ? `${source.description} (copy)`
        : undefined,
      variants: JSON.parse(JSON.stringify(source.variants)),
      pseudoVariants: JSON.parse(JSON.stringify(source.pseudoVariants)),
      compoundVariants: JSON.parse(
        JSON.stringify(source.compoundVariants ?? []),
      ),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    classes[newName] = newClass;

    await saveDesignSystem(adapter, designSystem, authorship);
    await safelyRefreshStyleArtifactsAfterMutation(
      adapter,
      `custom-class:${newName}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `custom-class:${newName}`,
      },
      context,
    );

    const css = await generateCustomClassesForAdapter(adapter, classes);

    const duration = endPerformanceTracking(operation);
    log("info", "Class duplicated", {
      sourceName,
      newName,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      data: { class: newClass, css },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to duplicate class", { error });
    return {
      success: false,
      error: {
        code: "DUPLICATE_CLASS_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to duplicate class",
      },
    };
  }
}

export async function handleReplaceClassStyles(
  input: z.infer<typeof ReplaceClassStylesInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { sourceName, targetName } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.updateClassRule",
    "save-styles",
  );

  const operation = "replaceClassStyles";
  startPerformanceTracking(operation);

  try {
    const adapter = await getStorageAdapterAsync(context.locals);
    const designSystem = await getDesignSystem(adapter);
    const classes = designSystem.semanticClasses;

    const target = classes[targetName];
    if (!target) {
      return {
        success: false,
        error: {
          code: "CLASS_NOT_FOUND",
          message: `Class "${targetName}" not found`,
        },
      };
    }

    const replacement =
      sourceName !== undefined
        ? classes[sourceName]
        : {
            variants: input.variants ?? [],
            pseudoVariants: input.pseudoVariants ?? [],
          };

    if (!replacement) {
      return {
        success: false,
        error: {
          code: "CLASS_NOT_FOUND",
          message: `Class "${sourceName}" not found`,
        },
      };
    }

    const updatedTarget: NewCustomClass = {
      ...target,
      variants: structuredClone(replacement.variants),
      pseudoVariants: structuredClone(replacement.pseudoVariants),
      updatedAt: new Date().toISOString(),
    };

    classes[targetName] = updatedTarget;

    await saveDesignSystem(adapter, designSystem, authorship);
    await safelyRefreshStyleArtifactsAfterMutation(
      adapter,
      `custom-class:${targetName}`,
      authorship,
    );
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-styles",
        mutationTarget: `custom-class:${targetName}`,
      },
      context,
    );

    const css = await generateCustomClassesForAdapter(adapter, classes);

    const duration = endPerformanceTracking(operation);
    log("info", "Class styles replaced", {
      sourceName: sourceName ?? "snapshot",
      targetName,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      data: { class: updatedTarget, css },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to replace class styles", { error });
    return {
      success: false,
      error: {
        code: "REPLACE_CLASS_STYLES_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to replace class styles",
      },
    };
  }
}

export async function handleReplaceClassVariantRules(
  input: z.infer<typeof ReplaceClassVariantRulesInputSchema>,
  context: ActionAPIContext,
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}> {
  const { className, breakpoint, pseudoState, rules } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "styles.updateClassRule",
    "save-styles",
  );

  const operation = "replaceClassVariantRules";
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

    const nextRules = normalizeCssRuleList(structuredClone(rules));

    if (!pseudoState || pseudoState === "default") {
      const existingIndex = cls.variants.findIndex(
        (variant) => variant.breakpoint === breakpoint,
      );

      if (nextRules.length === 0) {
        if (existingIndex >= 0) {
          cls.variants.splice(existingIndex, 1);
        }
      } else if (existingIndex >= 0) {
        cls.variants[existingIndex] = {
          breakpoint,
          rules: nextRules,
        };
      } else {
        cls.variants.push({
          breakpoint,
          rules: nextRules,
        });
      }
    } else {
      const existingIndex = cls.pseudoVariants.findIndex(
        (variant) =>
          variant.state === pseudoState && variant.breakpoint === breakpoint,
      );

      if (nextRules.length === 0) {
        if (existingIndex >= 0) {
          cls.pseudoVariants.splice(existingIndex, 1);
        }
      } else if (existingIndex >= 0) {
        cls.pseudoVariants[existingIndex] = {
          state: pseudoState,
          breakpoint,
          rules: nextRules,
        };
      } else {
        cls.pseudoVariants.push({
          state: pseudoState,
          breakpoint,
          rules: nextRules,
        });
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
    log("info", "Class variant rules replaced", {
      className,
      breakpoint,
      pseudoState,
      ruleCount: nextRules.length,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      data: { class: cls, css },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    if (error instanceof ActionError) throw error;
    log("error", "Failed to replace class variant rules", { error });
    return {
      success: false,
      error: {
        code: "REPLACE_CLASS_VARIANT_RULES_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to replace class variant rules",
      },
    };
  }
}
