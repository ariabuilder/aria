/**
 * Convert canvas nodes into reusable components.
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
} from "../../../../lib/schemas/nodes";
import type { BuilderNode, ComponentDSL } from "../../../../lib/types/nodes";
import type {
  NodeToComponentOptions,
  ConversionResult,
  InferredProp,
} from "../types";
import {
  resolveBlockConversionSlugCheckResult,
  unwrapBlockConversionCreateResult,
} from "../../../composables/blockConversionActionResults";

/**
 * Component slot inference result
 */
interface InferredSlot {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly allowedTypes?: readonly string[];
}

/**
 * Composable return type with strict typing
 */
interface UseBlockDataReturn {
  /** Whether conversion is in progress */
  readonly converting: Ref<boolean>;

  /** Last conversion error */
  readonly error: Ref<string | null>;

  /** Convert a single node to a component */
  readonly convertNodeToComponent: (
    node: BuilderNode,
    options?: NodeToComponentOptions,
  ) => Promise<ConversionResult>;

  /** Convert multiple nodes into a single component */
  readonly convertNodesToComponent: (
    nodes: readonly BuilderNode[],
    options?: NodeToComponentOptions,
  ) => Promise<ConversionResult>;

  /** Clear error state */
  readonly clearError: () => void;
}

const NodeToComponentOptionsSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    silent: z.boolean().optional(),
    deepClone: z.boolean().optional(),
  })
  .strict();

const ConversionNodesSchema = z.array(BuilderNodeSchema).min(1);

/**
 * Generate valid component slug from name
 *
 * Rules:
 * - Lowercase only
 * - Alphanumeric and hyphens only
 * - No consecutive hyphens
 * - No leading/trailing hyphens
 * - Max 50 characters
 *
 * @param name - Component name
 * @returns Valid slug
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove invalid chars
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/-+/g, "-") // Multiple hyphens to single
    .replace(/^-|-$/g, "") // Trim hyphens from ends
    .substring(0, 50); // Max length
}

/**
 * Generate unique slug by checking storage
 *
 * Appends -1, -2, -3, etc. until unique slug is found.
 * Safety limit of 100 iterations to prevent infinite loops.
 *
 * @param baseName - Base component name
 * @returns Unique slug guaranteed to not exist
 * @throws Error if unable to generate unique slug after 100 attempts
 */
async function generateUniqueSlug(baseName: string): Promise<string> {
  let slug = generateSlug(baseName);
  let counter = 1;

  // Safety limit
  const MAX_ATTEMPTS = 100;

  while (counter < MAX_ATTEMPTS) {
    const slugCheck = resolveBlockConversionSlugCheckResult(
      await actions.getItem({
        collection: "components",
        slug,
      }),
      "Failed to verify existing component slug",
      {
        source: "useBlockData.generateUniqueSlug",
        slug,
      },
    );

    if (slugCheck.status === "available") {
      // Slug is available
      return slug;
    }

    if (slugCheck.status === "invalid") {
      throw new Error(slugCheck.error);
    }

    // Slug exists, try with counter
    slug = generateSlug(`${baseName}-${counter}`);
    counter++;
  }

  throw new Error("Unable to generate unique slug after 100 attempts");
}

/**
 * Deep clone node with optional ID regeneration
 *
 * @param node - Node to clone
 * @param stripIds - If true, generate new UUIDs for all nodes
 * @returns Deep cloned node
 */
function cloneNode(node: BuilderNode, stripIds: boolean): BuilderNode {
  const cloned: BuilderNode = {
    ...node,
    id: stripIds ? generateNodeId() : node.id,
    props: node.props ? { ...node.props } : {},
    styles: node.styles ? { ...node.styles } : {},
    children: node.children
      ? node.children.map((child) => cloneNode(child, stripIds))
      : [],
  };

  return cloned;
}

/**
 * Clone multiple nodes
 *
 * @param nodes - Nodes to clone
 * @param stripIds - If true, generate new UUIDs
 * @returns Cloned nodes
 */
function cloneNodes(
  nodes: readonly BuilderNode[],
  stripIds: boolean,
): BuilderNode[] {
  return nodes.map((node) => cloneNode(node, stripIds));
}

/**
 * Infer prop schema from node properties
 *
 * Analyzes node.props and creates editable property definitions.
 * Skips internal properties (starting with _) and system props.
 *
 * @param node - Node to analyze
 * @returns Inferred prop definitions
 */
function inferPropSchema(node: BuilderNode): readonly InferredProp[] {
  if (!node.props || typeof node.props !== "object") {
    return [];
  }

  const props: InferredProp[] = [];

  for (const [key, value] of Object.entries(node.props)) {
    // Skip internal/system properties
    if (
      key.startsWith("_") ||
      key === "id" ||
      key === "className" ||
      key === "data-component-ref"
    ) {
      continue;
    }

    // Infer type from value
    let type: InferredProp["type"] = "string";

    if (typeof value === "number") {
      type = "number";
    } else if (typeof value === "boolean") {
      type = "boolean";
    } else if (Array.isArray(value)) {
      type = "array";
    } else if (value !== null && typeof value === "object") {
      type = "object";
    }

    props.push({
      name: key,
      type,
      defaultValue: value,
      required: false,
    });
  }

  return Object.freeze(props);
}

/**
 * Infer slots from node children structure
 *
 * Creates slot definitions based on:
 * - Node has children -> default slot
 * - Node has slot property -> named slot
 *
 * @param node - Node to analyze
 * @returns Inferred slot definitions
 */
function inferSlots(node: BuilderNode): readonly InferredSlot[] {
  const slots: InferredSlot[] = [];

  // Default slot if node has children
  if (node.children && node.children.length > 0) {
    slots.push({
      name: "default",
      label: "Content",
      required: false,
    });
  }

  // Named slot from node.slot property
  if (node.slot && typeof node.slot === "string") {
    const slotName = node.slot;
    if (!slots.find((s) => s.name === slotName)) {
      const label = slotName.charAt(0).toUpperCase() + slotName.slice(1);
      slots.push({
        name: slotName,
        label,
        required: false,
      });
    }
  }

  return Object.freeze(slots);
}

/**
 * Create ComponentDSL from node(s)
 *
 * Builds a complete ComponentDSL object with:
 * - Auto-generated metadata (timestamps, version)
 * - Inferred prop schemas
 * - Inferred slot definitions
 * - Proper type safety
 *
 * @param nodes - Nodes to convert
 * @param options - Conversion options
 * @param slug - Unique component slug
 * @returns Complete ComponentDSL object
 */
function createComponentDSL(
  nodes: readonly BuilderNode[],
  options: NodeToComponentOptions,
  slug: string,
): ComponentDSL {
  const timestamp = new Date().toISOString();
  const firstNode = nodes[0];

  // Infer schemas from first node
  const propSchema = inferPropSchema(firstNode);
  const slots = inferSlots(firstNode);
  const normalizedPropSchema = propSchema.map((prop) => ({
    name: prop.name,
    type: prop.type,
    default: prop.defaultValue,
    required: prop.required,
  }));
  const normalizedSlots =
    slots.length > 0
      ? slots.map((slot) => ({
          name: slot.name,
          label: slot.label,
          required: slot.required,
        }))
      : undefined;

  // Clone nodes (strip IDs if deepClone option is true)
  const clonedNodes = cloneNodes(nodes, options.deepClone ?? true);

  // Build ComponentDSL
  const componentDSL: ComponentDSL = {
    id: slug,
    name: options.name || `${firstNode.type} Component`,
    description:
      options.description ||
      `Reusable component created from ${nodes.length > 1 ? `${nodes.length} nodes` : firstNode.type}`,
    category: options.category || "Custom",
    nodes: clonedNodes,
    propSchema: normalizedPropSchema,
    slots: normalizedSlots,
    settings: {
      canHaveChildren: nodes.some((n) => n.children && n.children.length > 0),
      breakpoints: [],
    },
    version: Date.now().toString(),
    // status field not currently supported in ComponentDSL
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return componentDSL;
}

/**
 * Validate nodes before conversion
 *
 * Checks:
 * - At least one node provided
 * - All nodes have required type property
 * - All nodes have required id property
 *
 * @param nodes - Nodes to validate
 * @returns Error message if invalid, null if valid
 */
function validateNodes(nodes: readonly BuilderNode[]): string | null {
  const parsedNodes = ConversionNodesSchema.safeParse(nodes);
  if (!parsedNodes.success) {
    const firstIssue = parsedNodes.error.issues[0];
    if (firstIssue?.message) {
      return firstIssue.message;
    }
    return "Invalid nodes provided for conversion";
  }

  return null;
}

/**
 * Convert canvas nodes into components
 *
 * @example
 * ```typescript
 * const { convertNodeToComponent, converting } = useBlockData();
 *
 * const result = await convertNodeToComponent(selectedNode, {
 *   name: 'My Custom Hero',
 *   category: 'Marketing',
 *   deepClone: true
 * });
 *
 * if (result.success) {
 *   console.log('Created:', result.component);
 * }
 * ```
 */
export function useBlockData(): UseBlockDataReturn {

  const converting = ref(false);
  const error = ref<string | null>(null);

  /**
   * Convert a single node to a component
   *
   * @param node - Node to convert
   * @param options - Conversion options
   * @returns Conversion result
   */
  const convertNodeToComponent = async (
    node: BuilderNode,
    options: NodeToComponentOptions = {},
  ): Promise<ConversionResult> => {
    return convertNodesToComponent([node], options);
  };

  /**
   * Convert multiple nodes into a single component
   *
   * All nodes will be children of the created component.
   *
   * @param nodes - Nodes to convert
   * @param options - Conversion options
   * @returns Conversion result
   */
  const convertNodesToComponent = async (
    nodes: readonly BuilderNode[],
    options: NodeToComponentOptions = {},
  ): Promise<ConversionResult> => {
    converting.value = true;
    error.value = null;

    try {
      const parsedOptions = NodeToComponentOptionsSchema.safeParse(options);
      if (!parsedOptions.success) {
        log("warn", "[useBlockData] Invalid conversion options", {
          issues: parsedOptions.error.issues,
        });
        throw new Error("Invalid component conversion options");
      }

      // STEP 1: Validation

      const validationError = validateNodes(nodes);
      if (validationError) {
        throw new Error(validationError);
      }

      const parsedNodes = ConversionNodesSchema.parse(nodes);

      // STEP 2: Generate unique slug

      const baseName =
        parsedOptions.data.name ||
        `${parsedNodes[0].type}-component-${Date.now()}`;
      const slug = await generateUniqueSlug(baseName);

      log("debug", "[useBlockData] Converting nodes to component", {
        slug,
        nodeCount: parsedNodes.length,
      });

      // STEP 3: Create component DSL

      const componentDSL = createComponentDSL(
        parsedNodes,
        parsedOptions.data,
        slug,
      );
      const parsedComponentDSL = ComponentDSLSchema.safeParse(componentDSL);
      if (!parsedComponentDSL.success) {
        log(
          "warn",
          "[useBlockData] Invalid component payload before createItem",
          {
            slug,
            issues: parsedComponentDSL.error.issues,
          },
        );
        throw new Error("Invalid component payload");
      }

      // STEP 4: Save via Astro actions

      const result = unwrapBlockConversionCreateResult(
        await actions.createItem({
          collection: "components",
          slug,
          data: parsedComponentDSL.data,
        }),
        "Failed to save component",
        {
          source: "useBlockData.convertNodesToComponent",
          slug,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // STEP 5: Success feedback

      if (!parsedOptions.data.silent) {
        toast.success(`Component "${parsedComponentDSL.data.name}" created`);
      }

      log("info", "[useBlockData] Component created", {
        slug: result.slug,
      });

      return {
        success: true,
        slug,
        component: parsedComponentDSL.data,
      };
    } catch (err) {
      // Error handling

      const errorMessage =
        err instanceof Error ? err.message : "Unknown error during conversion";

      error.value = errorMessage;

      log("error", "[useBlockData] Conversion failed", {
        error: errorMessage,
        nodeCount: nodes.length,
        nodeTypes: nodes.map((n) => n.type),
      });

      if (!options.silent) {
        toast.error(`Failed to create component: ${errorMessage}`);
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      converting.value = false;
    }
  };

  /**
   * Clear error state
   */
  const clearError = (): void => {
    error.value = null;
  };

  return {
    converting,
    error,
    convertNodeToComponent,
    convertNodesToComponent,
    clearError,
  };
}
