import { ref, computed, readonly } from "vue";
import type { BuilderNode } from "../../lib/types/nodes";
import { validateNodeTree } from "../../lib/blocks/nodeUtils";
import { BuilderNodeSchema, validateBuilderNode } from "../../lib/schemas/nodes";

type ValidationSeverity = "error" | "warning" | "info";

interface ValidationError {
  nodeId: string;
  path: string[];
  message: string;
  severity: ValidationSeverity;
  field?: string;
  code?: string;
}

interface PropValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

interface NodeTypeRequirements {
  required: string[];
  optional?: string[];
  types?: Record<string, string>;
}

interface NodeValidationOptions {
  debug?: boolean;
  autoValidate?: boolean;
  maxDepth?: number;
  /** When true, warnings are treated as errors */
  strictMode?: boolean;
}

interface ValidationStats {
  totalNodes: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Duration in milliseconds */
  duration: number;
}

/** Required/optional props per built-in node type. */
const NODE_TYPE_REQUIREMENTS: Record<string, NodeTypeRequirements> = {
  Image: {
    required: ["src", "alt"],
    optional: ["width", "height", "loading"],
    types: { src: "string", alt: "string" },
  },
  Link: {
    required: ["href"],
    optional: ["target", "rel"],
    types: { href: "string" },
  },
  Button: {
    required: ["text"],
    optional: ["variant", "size"],
    types: { text: "string" },
  },
  Video: {
    required: ["src"],
    optional: ["controls", "autoplay", "loop"],
    types: { src: "string" },
  },
  Input: {
    required: ["type", "name"],
    optional: ["placeholder", "value"],
    types: { type: "string", name: "string" },
  },
  Form: {
    required: ["action"],
    optional: ["method", "enctype"],
    types: { action: "string" },
  },
};

const DEFAULT_MAX_DEPTH = 100;

/**
 * Error message templates.
 */
const ERROR_MESSAGES = {
  DUPLICATE_ID: (id: string) => `Duplicate node ID: ${id}`,
  CIRCULAR_REFERENCE: (path: string) => `Circular reference detected: ${path}`,
  INVALID_SLOT: (slot: string, valid: string[]) =>
    `Invalid slot: "${slot}". Valid slots: ${valid.join(", ")}`,
  REQUIRED_PROP: (prop: string) => `${prop} is required`,
  MAX_DEPTH_EXCEEDED: (depth: number) =>
    `Maximum tree depth exceeded: ${depth}`,
  INVALID_NODE_TYPE: (type: string) => `Invalid node type: ${type}`,
  EMPTY_NODE_ID: "Node ID cannot be empty",
  INVALID_CHILDREN: "Invalid children array",
} as const;

/**
 * Validates that a node ID is non-empty and valid.
 *
 * @param nodeId - Node ID to validate
 * @returns True if valid node ID
 */

/**
 * Validates that a value is a valid BuilderNode.
 *
 * @param node - Value to validate
 * @returns True if valid BuilderNode
 */
function isValidNode(node: unknown): node is BuilderNode {
  return BuilderNodeSchema.safeParse(node).success;
}

/**
 * Validates that a value is an array of BuilderNodes.
 *
 * @param nodes - Value to validate
 * @returns True if valid node array
 */
function isValidNodeArray(nodes: unknown): nodes is BuilderNode[] {
  return Array.isArray(nodes) && nodes.every(isValidNode);
}

/**
 * Validates that a property value is not empty.
 *
 * @param value - Value to check
 * @returns True if value is not empty
 */
function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Validates that a slot name is in the allowed list.
 *
 * @param slot - Slot name to validate
 * @param validSlots - Array of valid slot names
 * @returns True if slot is valid
 */
function isValidSlot(slot: string, validSlots: string[]): boolean {
  return validSlots.includes(slot);
}

/**
 * Gets the node type requirements.
 *
 * @param nodeType - Node type to get requirements for
 * @returns Requirements object or undefined
 */
function getNodeTypeRequirements(
  nodeType: string,
): NodeTypeRequirements | undefined {
  return NODE_TYPE_REQUIREMENTS[nodeType];
}

/**
 * Counts total nodes in a tree.
 *
 * @param nodes - Node array to count
 * @returns Total node count
 */
function countNodes(nodes: BuilderNode[]): number {
  let count = 0;

  function traverse(node: BuilderNode): void {
    count++;
    node.children?.forEach(traverse);
  }

  nodes.forEach(traverse);
  return count;
}

/**
 * Node tree validation manager for Aria builder.
 *
 * Validates node trees against schema and structural rules.
 * Live node-tree validation for the editor.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const validation = useNodeValidation({ debug: true });
 *
 * // Validate entire tree
 * const isValid = validation.validateTree(nodes);
 *
 * // Validate single node
 * const nodeValid = validation.validateNode(node);
 *
 * // Check for structural issues
 * validation.checkDuplicateIds(nodes);
 * validation.checkCircularReferences(nodes);
 *
 * // Get errors for specific node
 * const errors = validation.getNodeErrors('node-123');
 * ```
 */
export function useNodeValidation(options: NodeValidationOptions = {}) {
  const {
    debug = false,
    maxDepth = DEFAULT_MAX_DEPTH,
    strictMode = false,
  } = options;

  /**
   * Array of all validation errors.
   */
  const validationErrors = ref<ValidationError[]>([]);

  /**
   * Whether validation is currently in progress.
   */
  const isValidating = ref(false);

  /**
   * Last validation statistics.
   */
  const lastValidationStats = ref<ValidationStats | null>(null);

  /**
   * Whether there are any errors (severity: error).
   */
  const hasErrors = computed<boolean>(() => {
    return validationErrors.value.some((e) => e.severity === "error");
  });

  /**
   * Whether there are any warnings.
   */
  const hasWarnings = computed<boolean>(() => {
    return validationErrors.value.some((e) => e.severity === "warning");
  });

  /**
   * Whether there are any info messages.
   */
  const hasInfo = computed<boolean>(() => {
    return validationErrors.value.some((e) => e.severity === "info");
  });

  /**
   * Total number of errors.
   */
  const errorCount = computed<number>(() => {
    return validationErrors.value.filter((e) => e.severity === "error").length;
  });

  /**
   * Total number of warnings.
   */
  const warningCount = computed<number>(() => {
    return validationErrors.value.filter((e) => e.severity === "warning")
      .length;
  });

  /**
   * Total number of info messages.
   */
  const infoCount = computed<number>(() => {
    return validationErrors.value.filter((e) => e.severity === "info").length;
  });

  /**
   * Total number of all validation messages.
   */
  const totalIssues = computed<number>(() => {
    return validationErrors.value.length;
  });

  /**
   * Whether the tree is currently valid (no errors).
   * Warnings don't affect validity unless strict mode is enabled.
   */
  const isValid = computed<boolean>(() => {
    if (strictMode) {
      return !hasErrors.value && !hasWarnings.value;
    }
    return !hasErrors.value;
  });

  /**
   * Errors grouped by node ID for quick lookup.
   */
  const errorsByNode = computed<Map<string, ValidationError[]>>(() => {
    const map = new Map<string, ValidationError[]>();

    for (const error of validationErrors.value) {
      const existing = map.get(error.nodeId) || [];
      existing.push(error);
      map.set(error.nodeId, existing);
    }

    return map;
  });

  /**
   * Adds a validation error to the error list.
   *
   * @param error - Validation error to add
   */
  function addError(error: ValidationError): void {
    validationErrors.value.push(error);

    if (debug) {
      console.log(
        `[useNodeValidation] Added ${error.severity}:`,
        error.message,
      );
    }
  }

  /**
   * Adds multiple validation errors.
   *
   * @param errors - Array of errors to add
   */
  function addErrors(errors: ValidationError[]): void {
    validationErrors.value.push(...errors);

    if (debug) {
      console.log(`[useNodeValidation] Added ${errors.length} errors`);
    }
  }

  /**
   * Removes all errors for a specific node.
   *
   * @param nodeId - Node ID to clear errors for
   */
  function removeNodeErrors(nodeId: string): void {
    const beforeCount = validationErrors.value.length;
    validationErrors.value = validationErrors.value.filter(
      (e) => e.nodeId !== nodeId,
    );

    if (debug) {
      const removed = beforeCount - validationErrors.value.length;
      console.log(
        `[useNodeValidation] Removed ${removed} errors for node: ${nodeId}`,
      );
    }
  }

  /**
   * Validates an entire node tree.
   * Runs schema validation and structural checks.
   *
   * @param nodes - Node array to validate
   * @returns True if tree is valid
   *
   * @example
   * ```ts
   * const isValid = validateTree(pageBlocks);
   * if (!isValid) {
   *   console.error('Tree has errors:', validation.errorCount.value);
   * }
   * ```
   */
  function validateTree(nodes: BuilderNode[]): boolean {
    isValidating.value = true;
    const startTime = performance.now();

    validationErrors.value = [];

    try {
      if (!isValidNodeArray(nodes)) {
        addError({
          nodeId: "root",
          path: [],
          message: ERROR_MESSAGES.INVALID_CHILDREN,
          severity: "error",
          code: "INVALID_INPUT",
        });
        return false;
      }

      const result = validateNodeTree(nodes);

      if (!result.valid) {
        const errors: ValidationError[] = result.errors.map((error) => ({
          nodeId: error.nodeId,
          path: error.path,
          message: error.message,
          severity: "error",
        }));
        addErrors(errors);
      }

      const duration = performance.now() - startTime;
      lastValidationStats.value = {
        totalNodes: countNodes(nodes),
        errorCount: errorCount.value,
        warningCount: warningCount.value,
        infoCount: infoCount.value,
        duration,
      };

      if (debug) {
        console.log(
          "[useNodeValidation] Tree validation complete:",
          lastValidationStats.value,
        );
      }

      return result.valid;
    } catch (error) {
      console.error("[useNodeValidation] Tree validation error:", error);

      addError({
        nodeId: "root",
        path: [],
        message:
          error instanceof Error ? error.message : "Unknown validation error",
        severity: "error",
        code: "VALIDATION_EXCEPTION",
      });

      return false;
    } finally {
      isValidating.value = false;
    }
  }

  /**
   * Validates a single node against schema.
   * Updates error list for this node.
   *
   * @param node - Node to validate
   * @returns True if node is valid
   *
   * @example
   * ```ts
   * const isValid = validateNode(myNode);
   * if (!isValid) {
   *   const errors = getNodeErrors(myNode.id);
   *   console.error('Node errors:', errors);
   * }
   * ```
   */
  function validateNode(node: BuilderNode): boolean {
    try {
      if (!isValidNode(node)) {
        return false;
      }

      const result = validateBuilderNode(node);

      if (!result.success) {
        const errors: ValidationError[] = result.error.issues.map((err) => ({
          nodeId: node.id,
          path: err.path.map((segment) => String(segment)),
          message: err.message,
          severity: "error" as const,
          field: String(err.path[0] || ""),
          code: "code" in err ? String(err.code) : undefined,
        }));

        // Remove old errors for this node
        removeNodeErrors(node.id);

        addErrors(errors);

        return false;
      }

      // Remove errors for this node if validation passed
      removeNodeErrors(node.id);

      return true;
    } catch (error) {
      console.error("[useNodeValidation] Node validation error:", error);
      return false;
    }
  }

  /**
   * Validates a single property value for a node.
   *
   * @param node - Node containing the property
   * @param propName - Property name to validate
   * @param value - Property value to validate
   * @returns Validation result with error message if invalid
   *
   * @example
   * ```ts
   * const result = validateProp(imageNode, 'src', '');
   * if (!result.valid) {
   *   console.error(result.error); // "src is required"
   * }
   * ```
   */
  function validateProp(
    node: BuilderNode,
    propName: string,
    value: unknown,
  ): PropValidationResult {
    // Get requirements for this node type
    const requirements = getNodeTypeRequirements(node.type);

    if (!requirements) {
      // No specific requirements for this type
      return { valid: true };
    }

    if (requirements.required.includes(propName)) {
      if (isEmptyValue(value)) {
        return {
          valid: false,
          error: ERROR_MESSAGES.REQUIRED_PROP(propName),
          suggestion: `Provide a value for ${propName}`,
        };
      }
    }

    if (requirements.types && propName in requirements.types) {
      const expectedType = requirements.types[propName];
      const actualType = typeof value;

      if (actualType !== expectedType && !isEmptyValue(value)) {
        return {
          valid: false,
          error: `${propName} must be of type ${expectedType}, got ${actualType}`,
          suggestion: `Convert ${propName} to ${expectedType}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Gets required properties for a node type.
   *
   * @param nodeType - Node type to get requirements for
   * @returns Array of required property names
   *
   * @example
   * ```ts
   * const required = getRequiredProps('Image');
   * console.log(required); // ['src', 'alt']
   * ```
   */
  function getRequiredProps(nodeType: string): string[] {
    const requirements = getNodeTypeRequirements(nodeType);
    return requirements?.required || [];
  }

  /**
   * Checks for duplicate node IDs in the tree.
   * Adds errors for any duplicates found.
   *
   * @param nodes - Node array to check
   * @returns True if no duplicates found
   *
   * @example
   * ```ts
   * const noDuplicates = checkDuplicateIds(nodes);
   * if (!noDuplicates) {
   *   console.error('Duplicate IDs detected!');
   * }
   * ```
   */
  function checkDuplicateIds(nodes: BuilderNode[]): boolean {
    const ids = new Set<string>();
    const duplicates: string[] = [];

    function traverse(node: BuilderNode, path: string[]): void {
      if (ids.has(node.id)) {
        duplicates.push(node.id);
        addError({
          nodeId: node.id,
          path,
          message: ERROR_MESSAGES.DUPLICATE_ID(node.id),
          severity: "error",
          code: "DUPLICATE_ID",
        });
      } else {
        ids.add(node.id);
      }

      node.children?.forEach((child) => {
        traverse(child, [...path, node.id]);
      });
    }

    nodes.forEach((node) => traverse(node, []));

    if (debug && duplicates.length > 0) {
      console.warn(
        `[useNodeValidation] Found ${duplicates.length} duplicate IDs:`,
        duplicates,
      );
    }

    return duplicates.length === 0;
  }

  /**
   * Checks for circular references in the tree.
   * Uses depth-first search to detect cycles.
   *
   * @param nodes - Node array to check
   * @returns True if no circular references found
   *
   * @example
   * ```ts
   * const noCircular = checkCircularReferences(nodes);
   * if (!noCircular) {
   *   console.error('Circular references detected!');
   * }
   * ```
   */
  function checkCircularReferences(nodes: BuilderNode[]): boolean {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let hasCircular = false;

    function traverse(node: BuilderNode, path: string[]): void {
      if (visiting.has(node.id)) {
        hasCircular = true;
        const cyclePath = [...path, node.id].join(" → ");
        addError({
          nodeId: node.id,
          path,
          message: ERROR_MESSAGES.CIRCULAR_REFERENCE(cyclePath),
          severity: "error",
          code: "CIRCULAR_REFERENCE",
        });
        return;
      }

      // Already visited in another branch
      if (visited.has(node.id)) {
        return;
      }

      visiting.add(node.id);

      node.children?.forEach((child) => {
        traverse(child, [...path, node.id]);
      });

      // Mark as visited and remove from visiting
      visiting.delete(node.id);
      visited.add(node.id);
    }

    nodes.forEach((node) => traverse(node, []));

    if (debug && hasCircular) {
      console.warn("[useNodeValidation] Circular references detected");
    }

    return !hasCircular;
  }

  /**
   * Checks for orphaned or invalid slots.
   * Validates that all slot names are in the allowed list.
   *
   * @param nodes - Node array to check
   * @param validSlots - Array of valid slot names
   * @returns True if no orphaned slots found
   *
   * @example
   * ```ts
   * const validSlots = ['header', 'footer', 'sidebar'];
   * const noOrphans = checkOrphanedSlots(nodes, validSlots);
   * ```
   */
  function checkOrphanedSlots(
    nodes: BuilderNode[],
    validSlots: string[],
  ): boolean {
    let hasOrphans = false;

    function traverse(node: BuilderNode, path: string[]): void {
      if (node.slot && !isValidSlot(node.slot, validSlots)) {
        hasOrphans = true;
        addError({
          nodeId: node.id,
          path,
          message: ERROR_MESSAGES.INVALID_SLOT(node.slot, validSlots),
          severity: strictMode ? "error" : "warning",
          code: "INVALID_SLOT",
          field: "slot",
        });
      }

      node.children?.forEach((child) => {
        traverse(child, [...path, node.id]);
      });
    }

    nodes.forEach((node) => traverse(node, []));

    if (debug && hasOrphans) {
      console.warn("[useNodeValidation] Orphaned slots detected");
    }

    return !hasOrphans;
  }

  /**
   * Checks tree depth doesn't exceed maximum.
   *
   * @param nodes - Node array to check
   * @returns True if depth is within limits
   */
  function checkTreeDepth(nodes: BuilderNode[]): boolean {
    let maxDepthExceeded = false;

    function traverse(node: BuilderNode, path: string[], depth: number): void {
      if (depth > maxDepth) {
        maxDepthExceeded = true;
        addError({
          nodeId: node.id,
          path,
          message: ERROR_MESSAGES.MAX_DEPTH_EXCEEDED(maxDepth),
          severity: "warning",
          code: "MAX_DEPTH_EXCEEDED",
        });
        return;
      }

      node.children?.forEach((child) => {
        traverse(child, [...path, node.id], depth + 1);
      });
    }

    nodes.forEach((node) => traverse(node, [], 1));

    return !maxDepthExceeded;
  }

  /**
   * Gets all errors for a specific node.
   *
   * @param nodeId - Node ID to get errors for
   * @returns Array of validation errors for this node
   *
   * @example
   * ```ts
   * const errors = getNodeErrors('hero-section');
   * errors.forEach(err => console.error(err.message));
   * ```
   */
  function getNodeErrors(nodeId: string): ValidationError[] {
    return errorsByNode.value.get(nodeId) || [];
  }

  /**
   * Gets errors by severity level.
   *
   * @param severity - Severity level to filter by
   * @returns Array of errors with matching severity
   */
  function getErrorsBySeverity(
    severity: ValidationSeverity,
  ): ValidationError[] {
    return validationErrors.value.filter((e) => e.severity === severity);
  }

  /**
   * Checks if a specific node has errors.
   *
   * @param nodeId - Node ID to check
   * @returns True if node has any errors
   */
  function hasNodeErrors(nodeId: string): boolean {
    return getNodeErrors(nodeId).length > 0;
  }

  /**
   * Clears all validation errors.
   *
   * @example
   * ```ts
   * clearErrors(); // Start fresh
   * ```
   */
  function clearErrors(): void {
    const clearedCount = validationErrors.value.length;
    validationErrors.value = [];

    if (debug) {
      console.log(`[useNodeValidation] Cleared ${clearedCount} errors`);
    }
  }

  /**
   * Clears errors for a specific node.
   *
   * @param nodeId - Node ID to clear errors for
   *
   * @example
   * ```ts
   * clearNodeErrors('my-node-123');
   * ```
   */
  function clearNodeErrors(nodeId: string): void {
    removeNodeErrors(nodeId);
  }

  /**
   * Clears errors by severity level.
   *
   * @param severity - Severity level to clear
   */
  function clearErrorsBySeverity(severity: ValidationSeverity): void {
    const beforeCount = validationErrors.value.length;
    validationErrors.value = validationErrors.value.filter(
      (e) => e.severity !== severity,
    );

    if (debug) {
      const cleared = beforeCount - validationErrors.value.length;
      console.log(
        `[useNodeValidation] Cleared ${cleared} ${severity} messages`,
      );
    }
  }

  return {
    // State (readonly to prevent external mutations)
    validationErrors: readonly(validationErrors),
    isValidating: readonly(isValidating),
    lastValidationStats: readonly(lastValidationStats),

    hasErrors,
    hasWarnings,
    hasInfo,
    errorCount,
    warningCount,
    infoCount,
    totalIssues,
    isValid,
    errorsByNode,

    validateTree,

    validateNode,

    validateProp,
    getRequiredProps,

    checkDuplicateIds,
    checkCircularReferences,
    checkOrphanedSlots,
    checkTreeDepth,

    getNodeErrors,
    getErrorsBySeverity,
    hasNodeErrors,

    clearErrors,
    clearNodeErrors,
    clearErrorsBySeverity,
  };
}
