/**
 * Validates slot assignments for layouts and components.
 * Part of the micro-composable split from useNodeValidation.
 */

import { ref, readonly, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  ValidationError,
  VirtualSlotName,
  ValidationSeverity,
} from "../types";
import { VIRTUAL_SLOT_NAMES } from "../types";

export interface SlotDefinition {
  name: string;
  required?: boolean;
  allowedTypes?: readonly string[];
  label?: string;
}

/**
 * Layout or component with slots
 */
export interface SlottedContainer {
  id: string;
  type: "layout" | "component";
  /** Slot definitions */
  slots: readonly SlotDefinition[];
}

function isVirtualSlot(slotName: string): slotName is VirtualSlotName {
  return Object.values(VIRTUAL_SLOT_NAMES).includes(
    slotName as VirtualSlotName
  );
}

/**
 * Slot validation rules for layouts and components.
 *
 * Slot definitions and assignment validation.
 *
 * @example
 * ```ts
 * const slots = useSlotRules();
 *
 * // Register layout slots
 * slots.setLayoutSlots({
 *   id: 'main-layout',
 *   type: 'layout',
 *   slots: [
 *     { name: 'header', required: true },
 *     { name: 'content', required: true },
 *     { name: 'footer' }
 *   ]
 * });
 *
 * // Validate node slot assignment
 * const isValid = slots.isValidSlot(node, 'header');
 *
 * // Get validation errors
 * const errors = slots.validateSlotAssignments(nodes);
 * ```
 */
export function useSlotRules() {

  /**
   * Current layout slot definitions
   */
  const layoutSlots = ref<SlottedContainer | null>(null);

  /**
   * Component slot definitions (keyed by component ID)
   */
  const componentSlots = ref<Map<string, SlottedContainer>>(new Map());

  /**
   * Set the current layout slot definitions.
   *
   * @param layout - Layout with slot definitions
   */
  function setLayoutSlots(layout: SlottedContainer | null): void {
    layoutSlots.value = layout;
  }

  /**
   * Register component slot definitions.
   *
   * @param componentId - Component ID
   * @param container - Component with slot definitions
   */
  function registerComponentSlots(
    componentId: string,
    container: SlottedContainer
  ): void {
    componentSlots.value.set(componentId, container);
  }

  /**
   * Clear all slot definitions.
   */
  function clearSlots(): void {
    layoutSlots.value = null;
    componentSlots.value.clear();
  }

  /**
   * Get all valid slot names for the current context.
   *
   * @returns Array of valid slot names (includes virtual slots)
   */
  function getValidSlotNames(): readonly string[] {
    const slotNames = new Set<string>();

    if (layoutSlots.value) {
      for (const slot of layoutSlots.value.slots) {
        slotNames.add(slot.name);
      }
    }

    for (const virtualSlot of Object.values(VIRTUAL_SLOT_NAMES)) {
      slotNames.add(virtualSlot);
    }

    return Array.from(slotNames);
  }

  /**
   * Get slot definition by name.
   *
   * @param slotName - Slot name to find
   * @returns Slot definition or null if not found
   */
  function getSlotDefinition(slotName: string): SlotDefinition | null {
    if (!layoutSlots.value) {
      return null;
    }

    return layoutSlots.value.slots.find((s) => s.name === slotName) || null;
  }

  /**
   * Get all required slot names.
   *
   * @returns Array of required slot names
   */
  function getRequiredSlots(): readonly string[] {
    if (!layoutSlots.value) {
      return [];
    }

    return layoutSlots.value.slots.filter((s) => s.required).map((s) => s.name);
  }

  /**
   * Check if a slot name is valid in the current context.
   *
   * @param slotName - Slot name to validate
   * @returns True if slot is valid
   */
  function isValidSlotName(slotName: string | undefined): boolean {
    // Undefined/empty slot is valid (will use default slot)
    if (!slotName) {
      return true;
    }

    if (isVirtualSlot(slotName)) {
      return true;
    }

    if (layoutSlots.value) {
      return layoutSlots.value.slots.some((s) => s.name === slotName);
    }

    // No layout defined = any slot is valid
    return true;
  }

  /**
   * Check if a node can be placed in a specific slot.
   *
   * @param node - Node to validate
   * @param slotName - Slot name to check
   * @returns True if node can be placed in slot
   */
  function canNodeUseSlot(node: BuilderNode, slotName: string): boolean {
    if (isVirtualSlot(slotName)) {
      return true;
    }

    const slotDef = getSlotDefinition(slotName);

    // Slot not found = invalid
    if (!slotDef) {
      return false;
    }

    // No type restrictions = any node allowed
    if (!slotDef.allowedTypes || slotDef.allowedTypes.length === 0) {
      return true;
    }

    // Check if node type is allowed
    return slotDef.allowedTypes.includes(node.type);
  }

  /**
   * Validate slot assignment for a single node.
   *
   * @param node - Node to validate
   * @returns Validation error or null if valid
   */
  function validateNodeSlot(node: BuilderNode): ValidationError | null {
    const slotName = node.slot;

    // No slot = valid (default slot)
    if (!slotName) {
      return null;
    }

    // Check if slot name is valid
    if (!isValidSlotName(slotName)) {
      const validSlots = getValidSlotNames();
      return {
        nodeId: node.id,
        path: [node.id],
        message: `Invalid slot: "${slotName}". Valid slots: ${validSlots.join(", ")}`,
        severity: "error",
        code: "INVALID_SLOT",
        field: "slot",
      };
    }

    // Check if node type is allowed in slot
    if (!canNodeUseSlot(node, slotName)) {
      const slotDef = getSlotDefinition(slotName);
      const allowed = slotDef?.allowedTypes?.join(", ") || "none";

      return {
        nodeId: node.id,
        path: [node.id],
        message: `Node type "${node.type}" is not allowed in slot "${slotName}". Allowed types: ${allowed}`,
        severity: "error",
        code: "INVALID_SLOT",
        field: "slot",
      };
    }

    return null;
  }

  /**
   * Validate slot assignments for an array of nodes.
   *
   * @param nodes - Nodes to validate
   * @returns Array of validation errors (empty if valid)
   */
  function validateSlotAssignments(
    nodes: readonly BuilderNode[]
  ): readonly ValidationError[] {
    const errors: ValidationError[] = [];

    for (const node of nodes) {
      const error = validateNodeSlot(node);
      if (error) {
        errors.push(error);
      }

      if (node.children && node.children.length > 0) {
        errors.push(...validateSlotAssignments(node.children));
      }
    }

    return errors;
  }

  /**
   * Check if all required slots are filled.
   *
   * @param nodes - Nodes to check
   * @returns Array of missing required slot names
   */
  function getMissingRequiredSlots(
    nodes: readonly BuilderNode[]
  ): readonly string[] {
    const requiredSlots = getRequiredSlots();

    if (requiredSlots.length === 0) {
      return [];
    }

    const assignedSlots = new Set<string>();

    function collectSlots(nodeList: readonly BuilderNode[]): void {
      for (const node of nodeList) {
        if (node.slot) {
          assignedSlots.add(node.slot);
        }
        if (node.children) {
          collectSlots(node.children);
        }
      }
    }

    collectSlots(nodes);

    return requiredSlots.filter((slot) => !assignedSlots.has(slot));
  }

  /**
   * Check for orphaned slots (nodes with invalid slot assignments).
   *
   * @param nodes - Nodes to check
   * @returns Array of validation errors for orphaned slots
   */
  function checkOrphanedSlots(
    nodes: readonly BuilderNode[]
  ): readonly ValidationError[] {
    const errors: ValidationError[] = [];
    const validSlots = getValidSlotNames();

    function traverse(node: BuilderNode, path: readonly string[]): void {
      if (node.slot && !isValidSlotName(node.slot)) {
        errors.push({
          nodeId: node.id,
          path: [...path] as string[],
          message: `Invalid slot: "${node.slot}". Valid slots: ${validSlots.join(", ")}`,
          severity: "error",
          code: "INVALID_SLOT",
          field: "slot",
        });
      }

      if (node.children) {
        node.children.forEach((child) => traverse(child, [...path, node.id]));
      }
    }

    nodes.forEach((node) => traverse(node, [node.id]));
    return errors;
  }

  /**
   * Clear all slot errors for a specific severity.
   *
   * @param errors - Current error list
   * @param severity - Severity to clear
   * @returns Filtered error list
   */
  function clearErrorsBySeverity(
    errors: readonly ValidationError[],
    severity: ValidationSeverity
  ): readonly ValidationError[] {
    return errors.filter((e) => e.severity !== severity);
  }

  return {
    // State (readonly)
    layoutSlots: readonly(layoutSlots) as Readonly<
      Ref<SlottedContainer | null>
    >,

    setLayoutSlots: readonly(setLayoutSlots),
    registerComponentSlots: readonly(registerComponentSlots),
    clearSlots: readonly(clearSlots),
    getValidSlotNames: readonly(getValidSlotNames),
    getSlotDefinition: readonly(getSlotDefinition),
    getRequiredSlots: readonly(getRequiredSlots),

    isValidSlotName: readonly(isValidSlotName),
    canNodeUseSlot: readonly(canNodeUseSlot),
    validateNodeSlot: readonly(validateNodeSlot),
    validateSlotAssignments: readonly(validateSlotAssignments),
    getMissingRequiredSlots: readonly(getMissingRequiredSlots),

    checkOrphanedSlots: readonly(checkOrphanedSlots),
    clearErrorsBySeverity: readonly(clearErrorsBySeverity),
  };
}
