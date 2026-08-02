/**
 * Component Version Migrations Automatically migrates component props when component versions
 * change. Prevents breaking existing pages when component APIs are updated.
 */

import type { BuilderNode, PageDSL } from "../types/nodes";
import { blockRegistry } from "../blocks/blockRegistry";

/**
 * Loose type for raw stored data that may still contain legacy fields.
 * Zod's `.strict()` on `BuilderNodeSchema` will reject `className`,
 * `props.class`, and `props.className` — this type lets us handle
 * them before validation.
 */
type LooseNode = {
  className?: string;
  props?: Record<string, unknown>;
  children?: LooseNode[];
  [key: string]: unknown;
};

/**
 * Strip legacy class fields from a node tree before Zod validation.
 *
 * Stored data may still contain `className`, `props.class`, or
 * `props.className` from before the migration. Zod's `.strict()` mode
 * on `BuilderNodeSchema` rejects unknown keys, so stale `className`
 * fields would cause validation to fail. This function removes them
 * so data loads cleanly.
 *
 * `props.class` and `props.className` are also stripped since they
 * have been replaced by the `classNames` field.
 */
export function stripLegacyClassFields<T extends { nodes: unknown[] }>(
  dsl: T,
): T {
  const nodes = dsl.nodes as LooseNode[];
  return {
    ...dsl,
    nodes: stripLegacyFieldsFromNodes(nodes),
  };
}

function stripLegacyFieldsFromNodes(nodes: LooseNode[]): LooseNode[] {
  return nodes.map(stripLegacyFieldsFromNode);
}

function stripLegacyFieldsFromNode(node: LooseNode): LooseNode {
  // Remove className from node root
  const { className: _cn, ...rest } = node;

  // Remove class and className from props
  if (rest.props && typeof rest.props === "object") {
    const {
      class: _c,
      className: _pcn,
      ...cleanProps
    } = rest.props as Record<string, unknown>;
    rest.props = cleanProps;
  }

  if (rest.children && Array.isArray(rest.children)) {
    rest.children = stripLegacyFieldsFromNodes(rest.children as LooseNode[]);
  }

  return rest;
}

/**
 * Migrate a single node to the latest component version
 */
export function migrateNode(node: BuilderNode): BuilderNode {
  const componentMeta = blockRegistry.get(node.type);

  if (!componentMeta || !componentMeta.migrations) {
    return node; // No migrations needed
  }

  // Get current node version (default to 1 if not set)
  const nodeVersion = node.metadata?.version || 1;
  const targetVersion = componentMeta.version || 1;

  if (nodeVersion >= targetVersion) {
    return node; // Already up to date
  }

  // Apply migrations sequentially
  let migratedProps = { ...node.props };
  let currentVersion = nodeVersion;

  const migrationLog: string[] = [];

  while (currentVersion < targetVersion) {
    const nextVersion = currentVersion + 1;
    const migration = componentMeta.migrations[nextVersion];

    if (migration) {
      console.log(
        `[Migration] ${node.type} v${currentVersion} → v${nextVersion}: ${migration.description}`,
      );

      try {
        migratedProps = migration.migrate(migratedProps);
        migrationLog.push(
          `v${currentVersion} → v${nextVersion}: ${migration.description}`,
        );
      } catch (error) {
        console.error(
          `[Migration Error] Failed to migrate ${node.type} from v${currentVersion} to v${nextVersion}`,
          error instanceof Error ? error.message : "Unknown migration error",
        );
        // Continue with partial migration
      }
    }

    currentVersion = nextVersion;
  }

  // Return migrated node with updated version
  return {
    ...node,
    props: migratedProps,
    metadata: {
      ...node.metadata,
      version: targetVersion,
      migrationLog: migrationLog.length > 0 ? migrationLog : undefined,
    },
  };
}

/**
 * Migrate all nodes in a page DSL to latest versions
 */
export function migratePageDSL(dsl: PageDSL): {
  dsl: PageDSL;
  migrationsApplied: MigrationReport[];
} {
  const migrationsApplied: MigrationReport[] = [];

  function migrateNodes(nodes: BuilderNode[]): BuilderNode[] {
    return nodes.map((node) => {
      const originalVersion = node.metadata?.version || 1;
      const migratedNode = migrateNode(node);
      const newVersion = migratedNode.metadata?.version || 1;

      // Track migrations applied
      if (newVersion > originalVersion) {
        migrationsApplied.push({
          nodeId: node.id,
          type: node.type,
          fromVersion: originalVersion,
          toVersion: newVersion,
          description: migratedNode.metadata?.migrationLog?.join(", ") || "",
        });
      }

      // Recursively migrate children
      if (migratedNode.children) {
        return {
          ...migratedNode,
          children: migrateNodes(migratedNode.children),
        };
      }

      return migratedNode;
    });
  }

  return {
    dsl: {
      ...dsl,
      nodes: migrateNodes(dsl.nodes),
    },
    migrationsApplied,
  };
}

/**
 * Migration report for UI display
 */
export interface MigrationReport {
  nodeId: string;
  type: string;
  fromVersion: number;
  toVersion: number;
  description: string;
}

/**
 * Check if a page DSL needs migrations
 */
export function needsMigrations(dsl: PageDSL): boolean {
  function checkNode(node: BuilderNode): boolean {
    const componentMeta = blockRegistry.get(node.type);
    if (!componentMeta) return false;

    const nodeVersion = node.metadata?.version || 1;
    const targetVersion = componentMeta.version || 1;

    if (nodeVersion < targetVersion) {
      return true;
    }

    // Check children recursively
    if (node.children) {
      return node.children.some(checkNode);
    }

    return false;
  }

  return dsl.nodes.some(checkNode);
}

/**
 * Get migration preview without applying
 */
export function previewMigrations(dsl: PageDSL): MigrationReport[] {
  const previews: MigrationReport[] = [];

  function previewNode(node: BuilderNode): void {
    const componentMeta = blockRegistry.get(node.type);
    if (!componentMeta || !componentMeta.migrations) {
      if (node.children) node.children.forEach(previewNode);
      return;
    }

    const nodeVersion = node.metadata?.version || 1;
    const targetVersion = componentMeta.version || 1;

    if (nodeVersion < targetVersion) {
      const migrationDescriptions: string[] = [];
      let currentVersion = nodeVersion;

      while (currentVersion < targetVersion) {
        const nextVersion = currentVersion + 1;
        const migration = componentMeta.migrations[nextVersion];
        if (migration) {
          migrationDescriptions.push(migration.description);
        }
        currentVersion = nextVersion;
      }

      previews.push({
        nodeId: node.id,
        type: node.type,
        fromVersion: nodeVersion,
        toVersion: targetVersion,
        description: migrationDescriptions.join(", "),
      });
    }

    if (node.children) {
      node.children.forEach(previewNode);
    }
  }

  dsl.nodes.forEach(previewNode);
  return previews;
}
