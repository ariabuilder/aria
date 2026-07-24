/**
 * Validates nodes against their schema requirements (required props, types, etc. ).
 */

import { normalizeContainerNodeType } from "../../../../lib/blocks/containerTypes";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  PropValidationResult,
  NodeTypeRequirements,
  ValidationError,
} from "../types";
import { isLeafNodeType } from "../utils/nodeHelpers";

/**
 * Node type requirements map.
 * Defines required properties for each node type.
 */
const NODE_TYPE_REQUIREMENTS: Readonly<Record<string, NodeTypeRequirements>> = {
  Image: {
    required: ["src", "alt"],
    optional: ["width", "height", "loading"],
    types: { src: "string", alt: "string" },
    allowChildren: false,
  },
  Link: {
    required: ["href"],
    optional: ["target", "rel"],
    types: { href: "string" },
    allowChildren: true,
  },
  Button: {
    required: ["text"],
    optional: ["variant", "size"],
    types: { text: "string" },
    allowChildren: false,
  },
  Video: {
    required: ["src"],
    optional: ["controls", "autoplay", "loop"],
    types: { src: "string" },
    allowChildren: false,
  },
  Input: {
    required: ["type", "name"],
    optional: ["placeholder", "value"],
    types: { type: "string", name: "string" },
    allowChildren: false,
  },
  Form: {
    required: ["action"],
    optional: ["method", "enctype"],
    types: { action: "string" },
    allowChildren: true,
  },
  Container: {
    required: [],
    optional: [],
    allowChildren: true,
  },
  Section: {
    required: [],
    optional: [],
    allowChildren: true,
  },
} as const;

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Get the JavaScript type of a value as a string.
 */
function getValueType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Schema validation rules for nodes.
 *
 * Validates nodes against their type requirements (required props, type checking).
 *
 * @example
 * ```ts
 * const schema = useSchemaRules();
 *
 * // Check if node meets schema requirements
 * const errors = schema.validateNodeSchema(node);
 *
 * // Check specific property
 * const propValid = schema.validateProp(node, 'src');
 *
 * // Get requirements for a type
 * const reqs = schema.getRequirements('Image');
 * ```
 */
export function useSchemaRules() {
  /**
   * Get schema requirements for a node type.
   *
   * @param nodeType - Node type to get requirements for
   * @returns Requirements object or null if no requirements defined
   */
  function getRequirements(nodeType: string): NodeTypeRequirements | null {
    return NODE_TYPE_REQUIREMENTS[normalizeContainerNodeType(nodeType)] || null;
  }

  /**
   * Check if a node type can have children.
   *
   * @param nodeType - Node type to check
   * @returns True if type can have children
   */
  function canHaveChildren(nodeType: string): boolean {
    const requirements = getRequirements(nodeType);

    // If no requirements defined, check if it's a known leaf type
    if (!requirements) {
      return !isLeafNodeType(nodeType);
    }

    return requirements.allowChildren !== false;
  }

  /**
   * Validate a single property against schema requirements.
   *
   * @param node - Node to validate property of
   * @param propName - Property name to validate
   * @returns Validation result
   */
  function validateProp(
    node: BuilderNode,
    propName: string,
  ): PropValidationResult {
    const requirements = getRequirements(node.type);

    // No requirements = always valid
    if (!requirements) {
      return { valid: true };
    }

    const propValue = node.props[propName];

    // Check if required prop is missing
    if (requirements.required.includes(propName) && isEmptyValue(propValue)) {
      return {
        valid: false,
        error: `Property "${propName}" is required for ${node.type}`,
        suggestion: `Add the "${propName}" property to this ${node.type} node`,
      };
    }

    // Check type if specified
    if (requirements.types && propName in requirements.types) {
      const expectedType = requirements.types[propName];
      const actualType = getValueType(propValue);

      if (expectedType && actualType !== expectedType) {
        return {
          valid: false,
          error: `Property "${propName}" should be ${expectedType}, got ${actualType}`,
          suggestion: `Change "${propName}" to a ${expectedType} value`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate all properties of a node against its schema.
   *
   * @param node - Node to validate
   * @returns Array of validation errors (empty if valid)
   */
  function validateNodeSchema(node: BuilderNode): readonly ValidationError[] {
    const errors: ValidationError[] = [];
    const requirements = getRequirements(node.type);

    // No requirements = always valid
    if (!requirements) {
      return [];
    }

    for (const propName of requirements.required) {
      const result = validateProp(node, propName);

      if (!result.valid) {
        errors.push({
          nodeId: node.id,
          path: [node.id],
          message: result.error || `Invalid property: ${propName}`,
          severity: "error",
          field: propName,
          code: "SCHEMA_VIOLATION",
        });
      }
    }

    if (node.children && node.children.length > 0) {
      if (requirements.allowChildren === false) {
        errors.push({
          nodeId: node.id,
          path: [node.id],
          message: `Node type "${node.type}" cannot have children`,
          severity: "error",
          code: "TARGET_NO_CHILDREN",
        });
      }
    }

    return errors;
  }

  /**
   * Validate all required properties are present.
   *
   * @param node - Node to validate
   * @returns Array of missing required property names
   */
  function getMissingRequiredProps(node: BuilderNode): readonly string[] {
    const requirements = getRequirements(node.type);

    if (!requirements) {
      return [];
    }

    return requirements.required.filter((propName) =>
      isEmptyValue(node.props[propName]),
    );
  }

  /**
   * Check if a node's schema is valid.
   *
   * @param node - Node to check
   * @returns True if node meets all schema requirements
   */
  function isNodeSchemaValid(node: BuilderNode): boolean {
    const errors = validateNodeSchema(node);
    return errors.length === 0;
  }

  /**
   * Get all allowed property names for a node type.
   *
   * @param nodeType - Node type to get properties for
   * @returns Array of allowed property names
   */
  function getAllowedProps(nodeType: string): readonly string[] {
    const requirements = getRequirements(nodeType);

    if (!requirements) {
      return [];
    }

    return [...requirements.required, ...(requirements.optional || [])];
  }

  /**
   * Check for duplicate IDs in a tree.
   *
   * @param nodes - Node array to check
   * @returns Array of duplicate node IDs found
   */
  function checkDuplicateIds(nodes: readonly BuilderNode[]): readonly string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    function traverse(node: BuilderNode): void {
      if (seen.has(node.id)) {
        duplicates.add(node.id);
      }
      seen.add(node.id);

      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    nodes.forEach(traverse);
    return Array.from(duplicates);
  }

  /**
   * Check tree depth and warn if exceeds maximum.
   *
   * @param nodes - Node array to check
   * @param maxDepth - Maximum allowed depth
   * @returns Nodes that exceed max depth
   */
  function checkTreeDepth(
    nodes: readonly BuilderNode[],
    maxDepth: number = 100,
  ): readonly ValidationError[] {
    const errors: ValidationError[] = [];

    function traverse(
      node: BuilderNode,
      path: readonly string[],
      depth: number,
    ): void {
      if (depth > maxDepth) {
        errors.push({
          nodeId: node.id,
          path: [...path] as string[],
          message: `Maximum tree depth (${maxDepth}) exceeded at depth ${depth}`,
          severity: "warning",
          code: "SCHEMA_VIOLATION",
        });
        return; // Don't traverse deeper
      }

      if (node.children) {
        node.children.forEach((child) =>
          traverse(child, [...path, node.id], depth + 1),
        );
      }
    }

    nodes.forEach((node) => traverse(node, [node.id], 1));
    return errors;
  }

  /**
   * Get all required properties for a node type.
   *
   * @param nodeType - Node type to check
   * @returns Array of required property names
   */
  function getRequiredProps(nodeType: string): readonly string[] {
    const requirements = getRequirements(nodeType);
    return requirements?.required || [];
  }

  return {
    getRequirements,
    canHaveChildren,
    getAllowedProps,
    getRequiredProps,

    validateNodeSchema,
    validateProp,
    isNodeSchemaValid,
    getMissingRequiredProps,

    checkDuplicateIds,
    checkTreeDepth,
  };
}
