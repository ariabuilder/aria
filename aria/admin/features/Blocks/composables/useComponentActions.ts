/**
 * Type-safe component CRUD against Astro actions.
 */
import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { log } from "@/lib/utils/logger";
import { z } from "zod";
import { generateNodeId } from "../../../../lib/ids/nodeId";
import {
  BuilderNodeSchema,
  ComponentDSLSchema,
  SlotDefinitionSchema,
} from "../../../../lib/schemas/nodes";
import type { ComponentDSL, BuilderNode } from "../../../../lib/types/nodes";
import {
  unwrapComponentCrudActionResult,
  unwrapComponentItemResult,
} from "./componentCrudActionResults";

/**
 * Component creation input
 */
interface CreateComponentInput {
  readonly name: string;
  readonly nodes: readonly BuilderNode[];
  readonly description?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly slots?: readonly {
    readonly name: string;
    readonly defaultContent?: readonly BuilderNode[];
    readonly required?: boolean;
    readonly label?: string;
    readonly isDefault?: boolean;
  }[];
}

/**
 * Component update input
 */
interface UpdateComponentInput {
  readonly slug: string;
  readonly name?: string;
  readonly nodes?: readonly BuilderNode[];
  readonly description?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly slots?: readonly {
    readonly name: string;
    readonly defaultContent?: readonly BuilderNode[];
    readonly required?: boolean;
    readonly label?: string;
    readonly isDefault?: boolean;
  }[];
}

/**
 * Component action result (discriminated union)
 */
type ComponentActionResult<T = ComponentDSL> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

/**
 * Composable return type
 */
interface UseComponentActionsReturn {
  /** Create a new component */
  readonly createComponent: (
    input: CreateComponentInput,
  ) => Promise<ComponentActionResult<ComponentDSL>>;

  /** Update an existing component */
  readonly updateComponent: (
    input: UpdateComponentInput,
  ) => Promise<ComponentActionResult<ComponentDSL>>;

  /** Delete a component */
  readonly deleteComponent: (
    slug: string,
  ) => Promise<ComponentActionResult<{ deleted: true }>>;

  /** Duplicate a component */
  readonly duplicateComponent: (
    slug: string,
    newName?: string,
  ) => Promise<ComponentActionResult<ComponentDSL>>;

  /** Check if component is in use */
  readonly checkComponentUsage: (
    slug: string,
  ) => Promise<{ inUse: boolean; pages: string[]; layouts: string[] }>;

  /** Operation in progress */
  readonly operating: Ref<boolean>;

  /** Last error */
  readonly lastError: Ref<string | null>;
}

const operating = ref(false);
const lastError = ref<string | null>(null);

const ComponentSlugSchema = z.string().trim().min(1);

const CreateComponentInputSchema = z
  .object({
    name: z.string().trim().min(1),
    nodes: z.array(BuilderNodeSchema),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    slots: z.array(SlotDefinitionSchema).optional(),
  })
  .strict();

const UpdateComponentInputSchema = z
  .object({
    slug: ComponentSlugSchema,
    name: z.string().trim().min(1).optional(),
    nodes: z.array(BuilderNodeSchema).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    slots: z.array(SlotDefinitionSchema).optional(),
  })
  .strict();

const DuplicateComponentInputSchema = z
  .object({
    slug: ComponentSlugSchema,
    newName: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * Generate a unique slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

/**
 * Ensure slug is unique by appending a number if needed
 */
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const parsedBaseSlug = ComponentSlugSchema.safeParse(baseSlug);
  if (!parsedBaseSlug.success) {
    throw new Error("Unable to generate component slug");
  }

  let slug = parsedBaseSlug.data;
  let counter = 1;

  while (true) {
    const result = await actions.getItem({
      collection: "components",
      slug,
    });

    if (result.error || !result.data) {
      // Slug is available
      return slug;
    }

    const existingComponent = unwrapComponentItemResult(
      result,
      "Failed to verify existing component slug",
      {
        source: "useComponentActions.ensureUniqueSlug",
        slug,
      },
    );
    if (!existingComponent.success) {
      throw new Error(existingComponent.error);
    }

    // Slug exists, try with counter
    slug = `${parsedBaseSlug.data}-${counter}`;
    counter++;

    // Safety: prevent infinite loop
    if (counter > 100) {
      throw new Error("Unable to generate unique slug");
    }
  }
}

/**
 * Clone nodes for duplication (remove IDs to avoid conflicts)
 */
function cloneNodesForDuplication(
  nodes: readonly BuilderNode[],
): BuilderNode[] {
  const cloneNode = (node: BuilderNode): BuilderNode => {
    const cloned: BuilderNode = {
      ...node,
      id: generateNodeId(),
      children: node.children ? node.children.map(cloneNode) : [],
    };

    return cloned;
  };

  return nodes.map(cloneNode);
}

/**
 * Component CRUD against Astro actions
 *
 * @example
 * ```typescript
 * const { createComponent, deleteComponent } = useComponentActions();
 *
 * // Create a new component
 * const result = await createComponent({
 *   name: 'My Component',
 *   nodes: [heroNode],
 *   category: 'Marketing'
 * });
 *
 * if (result.success) {
 *   toast.success('Component created!');
 * }
 * ```
 */
export function useComponentActions(): UseComponentActionsReturn {

  /**
   * Create a new component in storage
   *
   * @param input - Component creation data
   * @returns Result with created component or error
   */
  const createComponent = async (
    input: CreateComponentInput,
  ): Promise<ComponentActionResult<ComponentDSL>> => {
    operating.value = true;
    lastError.value = null;

    try {
      const parsedInput = CreateComponentInputSchema.safeParse(input);
      if (!parsedInput.success) {
        log("warn", "[useComponentActions] Invalid create input", {
          issues: parsedInput.error.issues,
        });
        throw new Error("Invalid component input");
      }

      // Generate unique slug
      const baseSlug = generateSlug(parsedInput.data.name);
      const slug = await ensureUniqueSlug(baseSlug);

      // Build component DSL
      const componentDSL: ComponentDSL = {
        id: slug,
        name: parsedInput.data.name,
        nodes: [...parsedInput.data.nodes],
        description: parsedInput.data.description || "",
        category: parsedInput.data.category || "Custom",
        // tags field not currently supported in ComponentDSL
        slots: parsedInput.data.slots
          ? parsedInput.data.slots.map((slot) => ({
              name: slot.name,
              defaultContent: slot.defaultContent
                ? [...slot.defaultContent]
                : undefined,
              required: slot.required,
              label: slot.label,
              isDefault: slot.isDefault,
            }))
          : undefined,
        // status field not currently supported in ComponentDSL
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsedComponentDSL = ComponentDSLSchema.safeParse(componentDSL);
      if (!parsedComponentDSL.success) {
        log("warn", "[useComponentActions] Invalid component create payload", {
          source: "useComponentActions.createComponent",
          slug,
          issues: parsedComponentDSL.error.issues,
        });
        throw new Error("Invalid component input");
      }

      // Save via Astro actions
      const result = unwrapComponentCrudActionResult(
        "create",
        await actions.createItem({
          collection: "components",
          slug,
          data: parsedComponentDSL.data,
        }),
        {
          source: "useComponentActions.createComponent",
          slug,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      log("info", "[useComponentActions] Created component", {
        slug: result.slug ?? slug,
      });
      toast.success(`Component "${parsedInput.data.name}" created`);

      return {
        success: true,
        data: parsedComponentDSL.data,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      lastError.value = errorMessage;
      log("error", "[useComponentActions] Create failed", {
        error: errorMessage,
      });
      toast.error("Failed to create component");

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      operating.value = false;
    }
  };

  /**
   * Update an existing component
   *
   * @param input - Component update data
   * @returns Result with updated component or error
   */
  const updateComponent = async (
    input: UpdateComponentInput,
  ): Promise<ComponentActionResult<ComponentDSL>> => {
    operating.value = true;
    lastError.value = null;

    try {
      const parsedInput = UpdateComponentInputSchema.safeParse(input);
      if (!parsedInput.success) {
        log("warn", "[useComponentActions] Invalid update input", {
          issues: parsedInput.error.issues,
        });
        throw new Error("Invalid component update");
      }

      // Fetch existing component
      const fetchResult = await actions.getItem({
        collection: "components",
        slug: parsedInput.data.slug,
      });

      if (fetchResult.error || !fetchResult.data) {
        throw new Error(`Component "${parsedInput.data.slug}" not found`);
      }

      const existingResult = unwrapComponentItemResult(
        fetchResult,
        `Failed to load component "${parsedInput.data.slug}"`,
        {
          source: "useComponentActions.updateComponent",
          slug: parsedInput.data.slug,
        },
      );
      if (!existingResult.success) {
        throw new Error(existingResult.error);
      }

      const existing = existingResult.data;

      // Build updated component DSL
      const updatedDSL: ComponentDSL = {
        ...existing,
        name: parsedInput.data.name ?? existing.name,
        nodes: parsedInput.data.nodes
          ? [...parsedInput.data.nodes]
          : existing.nodes,
        description: parsedInput.data.description ?? existing.description,
        category: parsedInput.data.category ?? existing.category,
        // tags field not currently supported in ComponentDSL
        slots: parsedInput.data.slots
          ? parsedInput.data.slots.map((slot) => ({
              name: slot.name,
              defaultContent: slot.defaultContent
                ? [...slot.defaultContent]
                : undefined,
              required: slot.required,
              label: slot.label,
              isDefault: slot.isDefault,
            }))
          : existing.slots,
        updatedAt: new Date().toISOString(),
      };

      const parsedUpdatedDSL = ComponentDSLSchema.safeParse(updatedDSL);
      if (!parsedUpdatedDSL.success) {
        log("warn", "[useComponentActions] Invalid component update payload", {
          source: "useComponentActions.updateComponent",
          slug: parsedInput.data.slug,
          issues: parsedUpdatedDSL.error.issues,
        });
        throw new Error("Invalid component update");
      }

      // Update via Astro actions
      const result = unwrapComponentCrudActionResult(
        "update",
        await actions.updateItem({
          collection: "components",
          slug: parsedInput.data.slug,
          data: parsedUpdatedDSL.data,
        }),
        {
          source: "useComponentActions.updateComponent",
          slug: parsedInput.data.slug,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      log("info", "[useComponentActions] Updated component", {
        slug: result.slug ?? parsedInput.data.slug,
      });
      toast.success(`Component "${parsedUpdatedDSL.data.name}" updated`);

      return {
        success: true,
        data: parsedUpdatedDSL.data,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      lastError.value = errorMessage;
      log("error", "[useComponentActions] Update failed", {
        error: errorMessage,
      });
      toast.error("Failed to update component");

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      operating.value = false;
    }
  };

  /**
   * Delete a component
   *
   * Checks if component is in use before deletion.
   *
   * @param slug - Component slug to delete
   * @returns Result with success status or error
   */
  const deleteComponent = async (
    slug: string,
  ): Promise<ComponentActionResult<{ deleted: true }>> => {
    operating.value = true;
    lastError.value = null;

    try {
      const parsedSlug = ComponentSlugSchema.safeParse(slug);
      if (!parsedSlug.success) {
        log("warn", "[useComponentActions] Invalid delete slug", {
          issues: parsedSlug.error.issues,
        });
        throw new Error("Invalid component slug");
      }

      // Check if component is in use
      const usage = await checkComponentUsage(parsedSlug.data);

      if (usage.inUse) {
        const locations = [
          ...usage.pages.map((p) => `Page: ${p}`),
          ...usage.layouts.map((l) => `Layout: ${l}`),
        ].join(", ");

        throw new Error(
          `Component is in use: ${locations}. Remove references first.`,
        );
      }

      // Delete via Astro actions
      const result = unwrapComponentCrudActionResult(
        "delete",
        await actions.deleteItem({
          collection: "components",
          slug: parsedSlug.data,
        }),
        {
          source: "useComponentActions.deleteComponent",
          slug: parsedSlug.data,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      log("info", "[useComponentActions] Deleted component", {
        slug: parsedSlug.data,
      });
      toast.success("Component deleted");

      return {
        success: true,
        data: { deleted: true },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      lastError.value = errorMessage;
      log("error", "[useComponentActions] Delete failed", {
        error: errorMessage,
      });
      toast.error(errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      operating.value = false;
    }
  };

  /**
   * Duplicate an existing component
   *
   * @param slug - Component slug to duplicate
   * @param newName - Optional new name (defaults to "Copy of...")
   * @returns Result with new component or error
   */
  const duplicateComponent = async (
    slug: string,
    newName?: string,
  ): Promise<ComponentActionResult<ComponentDSL>> => {
    operating.value = true;
    lastError.value = null;

    try {
      const parsedInput = DuplicateComponentInputSchema.safeParse({
        slug,
        newName,
      });
      if (!parsedInput.success) {
        log("warn", "[useComponentActions] Invalid duplicate input", {
          issues: parsedInput.error.issues,
        });
        throw new Error("Invalid component duplication input");
      }

      // Fetch original component
      const fetchResult = await actions.getItem({
        collection: "components",
        slug: parsedInput.data.slug,
      });

      if (fetchResult.error || !fetchResult.data) {
        throw new Error(`Component "${parsedInput.data.slug}" not found`);
      }

      const originalResult = unwrapComponentItemResult(
        fetchResult,
        `Failed to load component "${parsedInput.data.slug}"`,
        {
          source: "useComponentActions.duplicateComponent",
          slug: parsedInput.data.slug,
        },
      );
      if (!originalResult.success) {
        throw new Error(originalResult.error);
      }

      const original = originalResult.data;

      // Clone nodes (new IDs)
      const clonedNodes = cloneNodesForDuplication(original.nodes);

      // Determine new name
      const duplicatedName =
        parsedInput.data.newName || `Copy of ${original.name}`;

      // Create duplicate via createComponent
      return await createComponent({
        name: duplicatedName,
        nodes: clonedNodes,
        description: original.description,
        category: original.category,
        slots: original.slots,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      lastError.value = errorMessage;
      log("error", "[useComponentActions] Duplicate failed", {
        error: errorMessage,
      });
      toast.error("Failed to duplicate component");

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      operating.value = false;
    }
  };

  /**
   * Check if a component is in use across pages and layouts
   *
   * Note: Reference checking is now built into the delete action.
   * If component is in use, delete will fail with ERROR_CODES.RESOURCE_IN_USE.
   * This function returns conservative values since we can't directly query references.
   *
   * @param slug - Component slug to check
   * @returns Usage information (client cannot query references; server enforces on delete)
   */
  const checkComponentUsage = async (
    slug: string,
  ): Promise<{ inUse: boolean; pages: string[]; layouts: string[] }> => {
    try {
      // Note: There's no direct action to query references.
      // Reference checking happens server-side during deletion.
      // Client cannot query references; server enforces during deletion.
      log(
        "debug",
        "[useComponentActions] Reference checking moved to server-side deletion",
        {
          slug,
        },
      );
      return { inUse: false, pages: [], layouts: [] };
    } catch (err) {
      log("error", "[useComponentActions] Usage check failed", {
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
      return { inUse: false, pages: [], layouts: [] };
    }
  };

  return {
    createComponent,
    updateComponent,
    deleteComponent,
    duplicateComponent,
    checkComponentUsage,
    operating,
    lastError,
  };
}
