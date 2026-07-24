/**
 * Type system for the block library and component management. All
 * types are 100% type-safe and extend core Aria types.
 */

import type { Component } from "vue";
import type { BuilderNode, ComponentDSL } from "../../../../lib/types/nodes";

/**
 * Block category classifier
 * Used to organize blocks in the sidebar library
 */
export type BlockCategoryType = "primitive" | "container" | "component";

export interface BlockCategory {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly description?: string;
  readonly order?: number;
}

/**
 * Draggable block element definition
 * Represents a block that can be dragged from the library onto the canvas
 */
export interface BlockElement {
  readonly id: string;
  readonly type: string;
  readonly component: Component;
  readonly category: BlockCategoryType;
  readonly label?: string;
  readonly icon?: string;
  readonly description?: string;
}

export interface BlockLibraryItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly category: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly thumbnail?: string;
  readonly framework?: "vue" | "react" | "astro";
  readonly isCustom?: boolean;
}

/**
 * Component usage tracking
 * Tracks where a component is used across the site
 */
export interface ComponentUsage {
  readonly pageSlug: string;
  readonly pageName?: string;
  readonly count: number;
  readonly locations?: readonly string[]; // Node IDs where component appears
}

/**
 * Component instance tracking
 * Maps component IDs to their instances across all pages
 */
export interface ComponentInstanceMap {
  readonly componentId: string;
  readonly instances: readonly ComponentInstance[];
  readonly totalCount: number;
}

export interface ComponentInstance {
  readonly pageSlug: string;
  readonly nodeId: string;
  readonly nodePath: readonly number[]; // Index path to node
}

export interface ComponentGridItem {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly thumbnail?: string;
  readonly usageCount: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface NodeToComponentOptions {
  readonly name?: string;
  readonly description?: string;
  readonly category?: string;
  readonly silent?: boolean; // Suppress toast notifications
  readonly deepClone?: boolean; // Remove IDs for fresh instances
}

export interface ConversionSuccess {
  readonly success: true;
  readonly slug: string;
  readonly component: ComponentDSL;
}

/**
 * Failed conversion result
 */
export interface ConversionFailure {
  readonly success: false;
  readonly error: string;
}

export type ConversionResult = ConversionSuccess | ConversionFailure;

/**
 * Inferred prop schema from node analysis
 */
export interface InferredProp {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "object" | "array";
  readonly defaultValue: unknown;
  readonly required: boolean;
}

export interface ComponentDefinition {
  readonly id: string;
  readonly nodes: readonly BuilderNode[];
  readonly name: string;
  readonly slots?: readonly ComponentSlot[];
}

/**
 * Component slot definition
 * Matches ComponentDSL's slot structure from aria/lib/types/nodes.ts
 */
export interface ComponentSlot {
  readonly name: string;
  readonly defaultContent?: readonly BuilderNode[];
  readonly required?: boolean;
  readonly label?: string;
  readonly isDefault?: boolean;
}

export interface ComponentCacheEntry {
  readonly definition: ComponentDefinition;
  readonly timestamp: number;
  readonly ttl?: number; // Time to live in milliseconds
}

/**
 * Element metadata exposed by draggable elements
 */
export interface ElementMeta {
  readonly type: string;
  readonly label: string;
  readonly category: BlockCategoryType;
  readonly icon?: string;
}

export interface ElementData extends BuilderNode {
  readonly elementMeta?: ElementMeta;
}

export interface DragState {
  readonly isDragging: boolean;
  readonly draggedElement: ElementData | null;
  readonly dragSource: "library" | "canvas" | null;
}

export interface DropValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly suggestions?: readonly string[];
}

export interface BlockValidationRules {
  readonly allowedParents?: readonly string[];
  readonly allowedChildren?: readonly string[];
  readonly maxChildren?: number;
  readonly minChildren?: number;
  readonly requiredProps?: readonly string[];
  readonly forbiddenIn?: readonly string[];
}

export type SyncStatus = "synced" | "conflict" | "outdated" | "new";

export interface SyncComponent {
  readonly slug: string;
  readonly name: string;
  readonly status: SyncStatus;
  readonly fileTimestamp?: string;
  readonly dbTimestamp?: string;
  readonly hasConflict: boolean;
}

export type SyncAction = "overwrite" | "accept" | "skip";

export interface ComponentPickerItem {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly thumbnail?: string;
  readonly previewNodes?: readonly BuilderNode[];
}

export interface ComponentSelection {
  readonly component: ComponentPickerItem;
  readonly insertMode: "instance" | "copy";
}

/**
 * Block creation input
 */
export interface CreateBlockInput {
  readonly name: string;
  readonly type: string;
  readonly category?: string;
  readonly nodes: readonly BuilderNode[];
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface UpdateBlockInput {
  readonly id: string;
  readonly name?: string;
  readonly category?: string;
  readonly nodes?: readonly BuilderNode[];
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface BlockDeletionResult {
  readonly success: boolean;
  readonly deletedId: string;
  readonly affectedPages?: readonly string[];
}

export type {
  // Re-export core types for convenience
  BuilderNode,
  ComponentDSL,
};
