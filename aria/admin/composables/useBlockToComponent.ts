/**
 * Block to Component Converter Composable functionality to convert selected BuilderNode
 * instances into reusable components. Supports deep cloning, automatic slug.
 */

import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { log } from "@/lib/utils/logger";
import { z } from "zod";
import { generateNodeId } from "../../lib/ids/nodeId";
import { BuilderNodeSchema, ComponentDSLSchema } from "../../lib/schemas/nodes";
import type { BuilderNode, ComponentDSL } from "../../lib/types/nodes";
import {
  resolveBlockConversionSlugCheckResult,
  unwrapBlockConversionCreateResult,
} from "./blockConversionActionResults";

type ConversionResult =
  | {
      readonly success: true;
      readonly slug: string;
      readonly component: ComponentDSL;
    }
  | {
      readonly success: false;
      readonly error: string;
    };

interface ConversionOptions {
  /** Component name (defaults to node type) */
  readonly name?: string;
  readonly description?: string;
  readonly category?: string;
  readonly silent?: boolean;
  readonly deepClone?: boolean;
}

interface InferredProp {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "object" | "array";
  readonly default?: unknown;
  readonly required: boolean;
}

/**
 * Composable return type
 */
interface UseBlockToComponentReturn {
  readonly converting: Ref<boolean>;
  readonly error: Ref<string | null>;
  readonly convertToComponent: (
    node: BuilderNode,
    options?: ConversionOptions,
  ) => Promise<ConversionResult>;
  readonly convertNodesToComponent: (
    nodes: readonly BuilderNode[],
    options?: ConversionOptions,
  ) => Promise<ConversionResult>;
  readonly clearError: () => void;
}

const ConversionOptionsSchema = z
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
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove invalid chars
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/-+/g, "-") // Multiple hyphens to single
    .replace(/^-|-$/g, ""); // Trim hyphens from ends
}

async function generateUniqueSlug(baseName: string): Promise<string> {
  let slug = generateSlug(baseName);
  let counter = 1;

  // Check if slug exists
  while (true) {
    const slugCheck = resolveBlockConversionSlugCheckResult(
      await actions.getItem({
        collection: "components",
        slug,
      }),
      "Failed to verify existing component slug",
      {
        source: "useBlockToComponent.generateUniqueSlug",
        slug,
      },
    );

    if (slugCheck.status === "available") {
      // Component doesn't exist, slug is available
      break;
    }

    if (slugCheck.status === "invalid") {
      throw new Error(slugCheck.error);
    }

    // Slug exists, try with counter
    slug = generateSlug(`${baseName}-${counter}`);
    counter++;
  }

  return slug;
}

/**
 * Deep clone node and optionally strip IDs for fresh instances
 */
function cloneNode(node: BuilderNode, stripIds = true): BuilderNode {
  const cloned: BuilderNode = {
    ...node,
    id: stripIds ? generateNodeId() : node.id,
    children: node.children?.map((child) => cloneNode(child, stripIds)),
  };

  return cloned;
}

function inferPropSchema(node: BuilderNode): InferredProp[] {
  const props: InferredProp[] = [];

  if (!node.props) {
    return props;
  }

  // Analyze node props to infer editable properties
  for (const [key, value] of Object.entries(node.props)) {
    if (key.startsWith("_") || key === "id" || key === "className") {
      continue;
    }

    let type: InferredProp["type"] = "string";

    if (typeof value === "number") {
      type = "number";
    } else if (typeof value === "boolean") {
      type = "boolean";
    } else if (Array.isArray(value)) {
      type = "array";
    } else if (value && typeof value === "object") {
      type = "object";
    }

    props.push({
      name: key,
      type,
      default: value,
      required: false,
    });
  }

  return props;
}

/**
 * Infer slots from node children structure
 */
function inferSlots(node: BuilderNode): Array<{
  name: string;
  label: string;
  required: boolean;
}> {
  const slots: Array<{ name: string; label: string; required: boolean }> = [];

  // If node has children, create a default slot
  if (node.children && node.children.length > 0) {
    slots.push({
      name: "default",
      label: "Content",
      required: false,
    });
  }

  // Analyze node structure for named slots
  if (node.slot) {
    const slotName = node.slot;
    if (!slots.find((s) => s.name === slotName)) {
      slots.push({
        name: slotName,
        label: slotName.charAt(0).toUpperCase() + slotName.slice(1),
        required: false,
      });
    }
  }

  return slots;
}

function createComponentDSL(
  nodes: readonly BuilderNode[],
  options: ConversionOptions,
  slug: string,
): ComponentDSL {
  const timestamp = new Date().toISOString();
  const firstNode = nodes[0];

  // Infer schemas from first node
  const propSchema = inferPropSchema(firstNode);
  const slots = inferSlots(firstNode);

  return {
    id: slug,
    name: options.name || `${firstNode.type} Component`,
    description:
      options.description ||
      `Reusable component created from ${nodes.length > 1 ? `${nodes.length} nodes` : firstNode.type}`,
    category: options.category || "custom",
    nodes: nodes.map((node) =>
      options.deepClone ? cloneNode(node, true) : cloneNode(node, false),
    ),
    propSchema,
    slots,
    settings: {
      canHaveChildren: nodes.some((n) => n.children && n.children.length > 0),
      breakpoints: [],
    },
    version: Date.now().toString(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Validate node(s) before conversion
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
 * Converts BuilderNode instances into reusable ComponentDSL entries
 *
 * @example
 * ```vue
 * <script setup>
 * const { convertToComponent, converting, error } = useBlockToComponent();
 *
 * async function handleConvert(selectedNode: BuilderNode) {
 *   const result = await convertToComponent(selectedNode, {
 *     name: 'My Custom Hero',
 *     category: 'heroes',
 *     deepClone: true
 *   });
 *
 *   if (result.success) {
 *     console.log('Created component:', result.slug);
 *   }
 * }
 * </script>
 * ```
 */
export function useBlockToComponent(): UseBlockToComponentReturn {

  const converting = ref<boolean>(false);
  const error = ref<string | null>(null);

  /**
   * Convert a single node to a component
   */
  async function convertToComponent(
    node: BuilderNode,
    options: ConversionOptions = {},
  ): Promise<ConversionResult> {
    return convertNodesToComponent([node], options);
  }

  /**
   * Convert multiple nodes into a single component
   */
  async function convertNodesToComponent(
    nodes: readonly BuilderNode[],
    options: ConversionOptions = {},
  ): Promise<ConversionResult> {
    converting.value = true;
    error.value = null;

    try {
      const parsedOptions = ConversionOptionsSchema.safeParse(options);
      if (!parsedOptions.success) {
        log("warn", "[useBlockToComponent] Invalid conversion options", {
          issues: parsedOptions.error.issues,
        });
        throw new Error("Invalid component conversion options");
      }

      const validationError = validateNodes(nodes);
      if (validationError) {
        throw new Error(validationError);
      }

      const parsedNodes = ConversionNodesSchema.parse(nodes);

      const baseName =
        parsedOptions.data.name ||
        `${parsedNodes[0].type}-component-${Date.now()}`;
      const slug = await generateUniqueSlug(baseName);

      log("debug", "[useBlockToComponent] Converting nodes to component", {
        slug,
        nodeCount: parsedNodes.length,
      });

      const componentDSL = createComponentDSL(
        parsedNodes,
        parsedOptions.data,
        slug,
      );
      const parsedComponentDSL = ComponentDSLSchema.safeParse(componentDSL);
      if (!parsedComponentDSL.success) {
        log(
          "warn",
          "[useBlockToComponent] Invalid component payload before createItem",
          {
            slug,
            issues: parsedComponentDSL.error.issues,
          },
        );
        throw new Error("Invalid component payload");
      }

      const createResult = unwrapBlockConversionCreateResult(
        await actions.createItem({
          collection: "components",
          slug,
          data: parsedComponentDSL.data,
        }),
        "Failed to save component",
        {
          source: "useBlockToComponent.convertNodesToComponent",
          slug,
        },
      );

      if (!createResult.success) {
        throw new Error(createResult.error);
      }

      if (!parsedOptions.data.silent) {
        toast.success(
          `Component "${parsedComponentDSL.data.name}" created successfully`,
        );
      }

      log("info", "[useBlockToComponent] Component created", {
        slug: createResult.slug,
      });

      return {
        success: true,
        slug,
        component: parsedComponentDSL.data,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error during conversion";
      error.value = errorMessage;

      log("error", "[useBlockToComponent] Conversion failed", {
        error: errorMessage,
        nodes: nodes.map((n) => ({ id: n.id, type: n.type })),
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
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = null;
  }

  return {
    converting,
    error,
    convertToComponent,
    convertNodesToComponent,
    clearError,
  };
}
