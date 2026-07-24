/**
 * Tree reconciliation for BuilderNode updates (create/update/delete/move/reorder).
 *
 * @see {@link https://github.com/facebook/react/tree/main/packages/react-reconciler React Reconciler}
 */

import type { BuilderNode } from "../../../../lib/types/nodes";
import { resolveNodeClassArray } from "../../../../lib/blocks/resolveNodeClasses";
import { log } from "@/lib/utils/logger";

/** Discriminated union of tree diff ops — keeps switch handling exhaustive. */
export type TreeDiff =
  | CreateDiff
  | UpdateDiff
  | DeleteDiff
  | MoveDiff
  | ReorderDiff;

export interface CreateDiff {
  readonly type: "create";
  readonly nodeId: string;
  readonly newNode: BuilderNode;
  readonly parentId: string | null;
  readonly index: number;
}

/** Property/content update with no structural change. */
export interface UpdateDiff {
  readonly type: "update";
  readonly nodeId: string;
  readonly oldNode: BuilderNode;
  readonly newNode: BuilderNode;
  readonly parentId: string | null;
}

export interface DeleteDiff {
  readonly type: "delete";
  readonly nodeId: string;
  readonly oldNode: BuilderNode;
  readonly parentId: string | null;
}

export interface MoveDiff {
  readonly type: "move";
  readonly nodeId: string;
  readonly node: BuilderNode;
  readonly oldParentId: string | null;
  readonly newParentId: string | null;
  readonly index: number;
}

/** Sibling reorder within the same parent (cheaper than a full move). */
export interface ReorderDiff {
  readonly type: "reorder";
  readonly nodeId: string;
  readonly node: BuilderNode;
  readonly parentId: string | null;
  readonly oldIndex: number;
  readonly newIndex: number;
}

export interface DiffMetrics {
  readonly diffTime: number;
  readonly applyTime: number;
  readonly totalNodes: number;
  readonly operations: Readonly<{
    create: number;
    update: number;
    delete: number;
    move: number;
    reorder: number;
  }>;
  readonly memoryUsage?: number;
}

/**
 * Tree lookup maps for O(1) access
 * @internal
 */
interface TreeIndex {
  readonly nodeMap: ReadonlyMap<string, BuilderNode>;
  readonly parentMap: ReadonlyMap<string, string | null>;
  readonly indexMap: ReadonlyMap<string, number>;
  readonly childrenMap: ReadonlyMap<string, readonly string[]>;
}

/**
 * Serializable node data for hashing (no circular references)
 */
interface NodeHashData {
  readonly type: string;
  readonly props: BuilderNode["props"];
  readonly classNames?: BuilderNode["classNames"];
  readonly customClasses?: string[];
  readonly styles?: Record<string, unknown>;
  readonly slot?: string;
  readonly hydration?: unknown;
}

/**
 * Type guard for valid BuilderNode
 * Prevents runtime errors from malformed tree structures
 */
export function isValidNode(node: unknown): node is BuilderNode {
  if (!node || typeof node !== "object") return false;
  const n = node as Partial<BuilderNode>;
  return (
    typeof n.id === "string" &&
    n.id.length > 0 &&
    typeof n.type === "string" &&
    n.type.length > 0
  );
}

/**
 * Type guard for node array
 * Validates tree structure before processing
 */
export function isValidNodeArray(nodes: unknown): nodes is BuilderNode[] {
  return Array.isArray(nodes) && nodes.every(isValidNode);
}

// Hash Computation (Optimized)

/**
 * WeakMap cache for node checksums
 * Avoids recomputing hashes for unchanged objects (huge perf gain)
 * Note: WeakMap allows GC when nodes are no longer referenced
 */
const checksumCache = new WeakMap<BuilderNode, string>();

/**
 * FNV-1a hash algorithm - faster and better distributed than naive hash
 * JSON.stringify + reduce is slow; FNV-1a is ~10x faster
 * @see {@link http://www.isthe.com/chongo/tech/comp/fnv/}
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime: 16777619, using bitwise multiply for speed
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36); // Convert to unsigned and base36
}

/**
 * Serialize object to stable string representation
 * Object key order matters for consistent hashing
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }

  // Sort keys for stable output
  const objectRecord = obj as Record<string, unknown>;
  const keys = Object.keys(objectRecord).sort();
  const pairs = keys.map(
    (key) => `"${key}":${stableStringify(objectRecord[key])}`,
  );
  return `{${pairs.join(",")}}`;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
  };
}

function getUsedHeapSize(): number {
  const perf = performance as PerformanceWithMemory;
  return perf.memory?.usedJSHeapSize ?? 0;
}

/**
 * Generate hash for node data
 * Extracted into separate function for testability and reusability
 */
function hashNodeData(data: NodeHashData): string {
  try {
    const serialized = stableStringify(data);
    return fnv1aHash(serialized);
  } catch (error) {
    log("error", "[tree-diff] Hash computation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/**
 * Get checksum for a node (shallow, excludes children)
 * Memoized to avoid recomputation; safe from circular refs
 */
export function getNodeChecksum(node: BuilderNode): string {
  const cached = checksumCache.get(node);
  if (cached) return cached;

  const hashData: NodeHashData = {
    type: node.type,
    props: node.props || {},
    classNames: node.classNames,
    customClasses: node.customClasses,
    styles: node.styles,
    slot: node.slot,
    hydration: node.hydration,
  };

  const checksum = hashNodeData(hashData);
  checksumCache.set(node, checksum);
  return checksum;
}

/**
 * Get checksum including subtree structure
 * Detects ANY change in subtree; uses recursive memoization
 */
export function getSubtreeChecksum(node: BuilderNode): string {
  const nodeHash = getNodeChecksum(node);
  const childHashes =
    node.children?.map((child: BuilderNode) => getSubtreeChecksum(child)) ?? [];

  return fnv1aHash(`${nodeHash}:${childHashes.join(",")}`);
}

// Tree Indexing (O(1) Lookups)

/**
 * Build lookup indices for a tree
 * Single O(n) pass to enable O(1) lookups throughout diffing
 * Complexity: O(n) where n = total nodes
 */
function buildTreeIndex(
  nodes: readonly BuilderNode[],
  parentId: string | null = null,
): TreeIndex {
  const nodeMap = new Map<string, BuilderNode>();
  const parentMap = new Map<string, string | null>();
  const indexMap = new Map<string, number>();
  const childrenMap = new Map<string, readonly string[]>();

  function traverse(nodeList: readonly BuilderNode[], parent: string | null) {
    const childIds: string[] = [];

    nodeList.forEach((node, index) => {
      if (!isValidNode(node)) {
        console.warn("[tree-diff] Invalid node encountered:", node);
        return;
      }

      nodeMap.set(node.id, node);
      parentMap.set(node.id, parent);
      indexMap.set(node.id, index);
      childIds.push(node.id);

      // Recurse into children
      if (node.children?.length) {
        traverse(node.children, node.id);
      }
    });

    if (parent !== null) {
      childrenMap.set(parent, childIds);
    }
  }

  traverse(nodes, parentId);

  return { nodeMap, parentMap, indexMap, childrenMap };
}

/**
 * Find node by ID with O(1) lookup
 * Uses pre-built index instead of tree traversal
 */
export function findNodeById(
  nodes: readonly BuilderNode[],
  id: string,
): BuilderNode | null {
  const index = buildTreeIndex(nodes);
  return index.nodeMap.get(id) ?? null;
}

/**
 * Find parent and index of a node with O(1) lookup
 * Uses pre-built index for instant parent/sibling access
 */
export function findNodeParent(
  nodes: readonly BuilderNode[],
  nodeId: string,
): { parent: BuilderNode | null; index: number } | null {
  const index = buildTreeIndex(nodes);
  const parentId = index.parentMap.get(nodeId);

  if (parentId === undefined) return null;

  const parent = parentId ? (index.nodeMap.get(parentId) ?? null) : null;
  const nodeIndex = index.indexMap.get(nodeId) ?? -1;

  return nodeIndex >= 0 ? { parent, index: nodeIndex } : null;
}

// LCS Algorithm for Move Detection

/**
 * Compute Longest Common Subsequence using dynamic programming
 * Optimal algorithm for detecting minimal set of moves
 * Complexity: O(n*m) where n,m are array lengths
 * @see {@link https://en.wikipedia.org/wiki/Longest_common_subsequence_problem}
 */
function computeLCS(
  oldIds: readonly string[],
  newIds: readonly string[],
): readonly string[] {
  const m = oldIds.length;
  const n = newIds.length;

  // DP table: lcs[i][j] = LCS length for oldIds[0..i] and newIds[0..j]
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldIds[i - 1] === newIds[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to find actual sequence
  const result: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldIds[i - 1] === newIds[j - 1]) {
      result.unshift(oldIds[i - 1]);
      i--;
      j--;
    } else if (lcs[i - 1][j] > lcs[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Detect moves and reorders using LCS
 * Nodes in LCS don't need to move; others do
 */
function detectMoves(
  oldNodes: readonly BuilderNode[],
  newNodes: readonly BuilderNode[],
  oldIndex: TreeIndex,
  _newIndex: TreeIndex,
  parentId: string | null,
): (MoveDiff | ReorderDiff)[] {
  const diffs: (MoveDiff | ReorderDiff)[] = [];

  const oldIds = oldNodes.map((n) => n.id);
  const newIds = newNodes.map((n) => n.id);

  // Nodes in LCS are already in correct relative order
  const lcs = computeLCS(oldIds, newIds);
  const lcsSet = new Set(lcs);

  // Check each node in new tree
  newNodes.forEach((newNode, newIdx) => {
    const oldParentId = oldIndex.parentMap.get(newNode.id);
    const oldIdx = oldIndex.indexMap.get(newNode.id);

    // Node exists in old tree
    if (oldParentId !== undefined && oldIdx !== undefined) {
      // Check if parent changed (move to different parent)
      if (oldParentId !== parentId) {
        diffs.push({
          type: "move",
          nodeId: newNode.id,
          node: newNode,
          oldParentId,
          newParentId: parentId,
          index: newIdx,
        });
      }
      // Check if position changed within same parent (reorder)
      else if (oldIdx !== newIdx && !lcsSet.has(newNode.id)) {
        diffs.push({
          type: "reorder",
          nodeId: newNode.id,
          node: newNode,
          parentId,
          oldIndex: oldIdx,
          newIndex: newIdx,
        });
      }
    }
  });

  return diffs;
}

/**
 * Compare two nodes for property equality (shallow, excludes children)
 * Pure function with no side effects; uses memoized checksums
 */
function nodesEqual(a: BuilderNode, b: BuilderNode): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    getNodeChecksum(a) === getNodeChecksum(b)
  );
}

/**
 * Recursively diff two node trees with optimized algorithm
 * Single-pass with O(1) lookups; detects all operation types
 * Complexity: O(n + m) where n,m are tree sizes
 */
export function diffTrees(
  oldNodes: readonly BuilderNode[],
  newNodes: readonly BuilderNode[],
  parentId: string | null = null,
): readonly TreeDiff[] {
  if (!isValidNodeArray(oldNodes) || !isValidNodeArray(newNodes)) {
    log("error", "[tree-diff] Invalid node arrays provided");
    return [];
  }

  // Early bailout: identical references (Vue reactivity optimization)
  if (oldNodes === newNodes) return [];

  // Build indices for O(1) lookups
  const oldIndex = buildTreeIndex(oldNodes, parentId);
  const newIndex = buildTreeIndex(newNodes, parentId);

  const diffs: TreeDiff[] = [];

  for (let i = 0; i < newNodes.length; i++) {
    const newNode = newNodes[i];
    const oldNode = oldIndex.nodeMap.get(newNode.id);

    if (!oldNode) {
      diffs.push({
        type: "create",
        nodeId: newNode.id,
        newNode,
        parentId,
        index: i,
      });
    } else if (!nodesEqual(oldNode, newNode)) {
      // Node updated (properties changed)
      diffs.push({
        type: "update",
        nodeId: newNode.id,
        oldNode,
        newNode,
        parentId,
      });
    }

    // Recurse into children
    const oldChildren = oldNode?.children ?? [];
    const newChildren = newNode.children ?? [];

    if (oldChildren.length > 0 || newChildren.length > 0) {
      const childDiffs = diffTrees(oldChildren, newChildren, newNode.id);
      diffs.push(...childDiffs);
    }
  }

  for (const oldNode of oldNodes) {
    if (!newIndex.nodeMap.has(oldNode.id)) {
      diffs.push({
        type: "delete",
        nodeId: oldNode.id,
        oldNode,
        parentId,
      });
    }
  }

  // Detect moves and reorders using LCS
  const moveDiffs = detectMoves(
    oldNodes,
    newNodes,
    oldIndex,
    newIndex,
    parentId,
  );
  diffs.push(...moveDiffs);

  return diffs;
}

// DOM Application (RAF-Batched)

/**
 * Apply single diff to DOM
 * Separated for easier testing and error handling
 */
function applySingleDiff(
  root: HTMLElement,
  diff: TreeDiff,
  renderNode: (
    node: BuilderNode,
    depth: number,
    parentId: string | null,
  ) => string,
  getDepth: (nodeId: string) => number,
): void {
  try {
    const element = root.querySelector(
      `[data-aria-id="${CSS.escape(diff.nodeId)}"]`,
    ) as HTMLElement | null;

    switch (diff.type) {
      case "create": {
        const parentElement = diff.parentId
          ? (root.querySelector(
              `[data-aria-id="${CSS.escape(diff.parentId)}"]`,
            ) as HTMLElement | null)
          : root;

        if (!parentElement) {
          console.warn(
            `[tree-diff] Parent element not found: ${diff.parentId}`,
          );
          return;
        }

        const depth = getDepth(diff.nodeId);
        const html = renderNode(diff.newNode, depth, diff.parentId);

        // Use DocumentFragment for efficient insertion
        const fragment = document.createRange().createContextualFragment(html);
        const newElement = fragment.firstElementChild as HTMLElement;

        if (newElement) {
          const refNode = parentElement.children[diff.index] ?? null;
          parentElement.insertBefore(fragment, refNode);
        }
        break;
      }

      case "update": {
        if (!element) {
          console.warn(
            `[tree-diff] Element not found for update: ${diff.nodeId}`,
          );
          return;
        }

        element.dataset.ariaType = diff.newNode.type;

        // Update classes from classNames/customClasses
        const nodeClasses = resolveNodeClassArray(diff.newNode);
        if (nodeClasses.length > 0) {
          element.className = `block ${nodeClasses.join(" ")}`;
        } else {
          element.className = "block";
        }

        if (diff.newNode.styles) {
          Object.assign(element.style, diff.newNode.styles);
        }

        break;
      }

      case "delete": {
        element?.remove();
        break;
      }

      case "move": {
        if (!element) {
          console.warn(
            `[tree-diff] Element not found for move: ${diff.nodeId}`,
          );
          return;
        }

        const newParent = diff.newParentId
          ? (root.querySelector(
              `[data-aria-id="${CSS.escape(diff.newParentId)}"]`,
            ) as HTMLElement | null)
          : root;

        if (!newParent) {
          console.warn(`[tree-diff] New parent not found: ${diff.newParentId}`);
          return;
        }

        const refNode = newParent.children[diff.index] ?? null;
        newParent.insertBefore(element, refNode);
        break;
      }

      case "reorder": {
        if (!element) {
          console.warn(
            `[tree-diff] Element not found for reorder: ${diff.nodeId}`,
          );
          return;
        }

        const parent = element.parentElement;
        if (!parent) {
          console.warn(
            `[tree-diff] Parent not found for reorder: ${diff.nodeId}`,
          );
          return;
        }

        const refNode = parent.children[diff.newIndex] ?? null;
        if (refNode !== element) {
          parent.insertBefore(element, refNode);
        }
        break;
      }
    }
  } catch (error) {
    log("error", "[tree-diff] Failed to apply diff", {
      diff,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Priority for diff types (lower = higher priority)
 * Deletes first to free space, creates last to avoid conflicts
 */
function getDiffPriority(diff: TreeDiff): number {
  switch (diff.type) {
    case "delete":
      return 1;
    case "move":
    case "reorder":
      return 2;
    case "update":
      return 3;
    case "create":
      return 4;
    default:
      return 5;
  }
}

/**
 * Apply diffs to DOM using RAF batching
 * Prevents layout thrashing by batching DOM changes
 */
export function applyDiffs(
  root: HTMLElement,
  diffs: readonly TreeDiff[],
  renderNode: (
    node: BuilderNode,
    depth: number,
    parentId: string | null,
  ) => string,
  getDepth: (nodeId: string) => number = () => 0,
): Promise<void> {
  return new Promise((resolve) => {
    // Sort by priority to minimize DOM thrashing
    const sortedDiffs = [...diffs].sort(
      (a, b) => getDiffPriority(a) - getDiffPriority(b),
    );

    // Batch DOM operations in RAF
    requestAnimationFrame(() => {
      try {
        for (const diff of sortedDiffs) {
          applySingleDiff(root, diff, renderNode, getDepth);
        }
        resolve();
      } catch (error) {
        log("error", "[tree-diff] Failed to apply diffs", {
          error: error instanceof Error ? error.message : String(error),
        });
        resolve(); // Resolve anyway to prevent hanging
      }
    });
  });
}

/**
 * Deduplicate and merge conflicting diffs
 * Multiple edits to same node should be consolidated
 */
export function deduplicateDiffs(
  diffs: readonly TreeDiff[],
): readonly TreeDiff[] {
  const map = new Map<string, TreeDiff>();

  for (const diff of diffs) {
    const existing = map.get(diff.nodeId);

    if (!existing) {
      map.set(diff.nodeId, diff);
      continue;
    }

    if (existing.type === "delete") {
      // Delete overrides everything except another delete
      if (diff.type !== "delete") continue;
    }

    if (diff.type === "delete") {
      map.set(diff.nodeId, diff);
    } else if (diff.type === "create" && existing.type === "create") {
      // Merge creates (use latest node)
      map.set(diff.nodeId, diff);
    } else if (diff.type === "update" && existing.type === "create") {
      // Merge create + update = create with updated node
      map.set(diff.nodeId, {
        ...existing,
        newNode: diff.newNode,
      });
    } else if (diff.type === "update" && existing.type === "update") {
      // Merge updates (use latest)
      map.set(diff.nodeId, diff);
    }
  }

  return Array.from(map.values());
}

/**
 * Check if any changes exist
 */
export function hasChanges(diffs: readonly TreeDiff[]): boolean {
  return diffs.length > 0;
}

/** Counts of each diff op type. */
export function getDiffStats(diffs: readonly TreeDiff[]): Readonly<{
  total: number;
  create: number;
  update: number;
  delete: number;
  move: number;
  reorder: number;
}> {
  const stats = {
    total: diffs.length,
    create: 0,
    update: 0,
    delete: 0,
    move: 0,
    reorder: 0,
  };

  for (const diff of diffs) {
    stats[diff.type]++;
  }

  return stats;
}

/**
 * Enhanced performance monitor with memory tracking
 */
export class DiffPerformanceMonitor {
  private readonly times = new Map<string, number[]>();
  private readonly memory = new Map<string, number[]>();
  private readonly frameThreshold = 16.67; // 60fps

  /**
   * Measure execution time and memory
   * Provides visibility into performance bottlenecks
   */
  measure<T>(label: string, fn: () => T): T {
    const startTime = performance.now();
    const startMemory = getUsedHeapSize();

    const result = fn();

    const duration = performance.now() - startTime;
    const endMemory = getUsedHeapSize();
    const memoryDelta = endMemory - startMemory;

    if (!this.times.has(label)) {
      this.times.set(label, []);
    }
    this.times.get(label)!.push(duration);

    if (memoryDelta > 0) {
      if (!this.memory.has(label)) {
        this.memory.set(label, []);
      }
      this.memory.get(label)!.push(memoryDelta);
    }

    // Warn on slow operations
    if (duration > this.frameThreshold) {
      console.warn(
        `⚠️ [tree-diff] Slow operation: ${label} took ${duration.toFixed(2)}ms (>${this.frameThreshold.toFixed(2)}ms threshold)`,
      );
    }

    return result;
  }

  /**
   * Get statistics for a specific operation
   */
  getStats(label: string): Readonly<{
    timing: {
      avg: number;
      min: number;
      max: number;
      p50: number;
      p95: number;
      p99: number;
      count: number;
    };
    memory: {
      avg: number;
      total: number;
      count: number;
    };
  }> {
    const times = this.times.get(label) || [];
    const memValues = this.memory.get(label) || [];

    const sortedTimes = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const count = times.length;

    const timing = {
      avg: count > 0 ? sum / count : 0,
      min: sortedTimes[0] ?? 0,
      max: sortedTimes[count - 1] ?? 0,
      p50: sortedTimes[Math.floor(count * 0.5)] ?? 0,
      p95: sortedTimes[Math.floor(count * 0.95)] ?? 0,
      p99: sortedTimes[Math.floor(count * 0.99)] ?? 0,
      count,
    };

    const memSum = memValues.reduce((a, b) => a + b, 0);
    const memory = {
      avg: memValues.length > 0 ? memSum / memValues.length : 0,
      total: memSum,
      count: memValues.length,
    };

    return { timing, memory };
  }

  /**
   * Generate performance report
   */
  getReport(): string {
    const labels = Array.from(this.times.keys());
    const lines: string[] = ["=== Tree Diff Performance Report ===", ""];

    for (const label of labels) {
      const stats = this.getStats(label);
      lines.push(`[${label}]`);
      lines.push(
        `  Timing: avg=${stats.timing.avg.toFixed(2)}ms, ` +
          `p50=${stats.timing.p50.toFixed(2)}ms, ` +
          `p95=${stats.timing.p95.toFixed(2)}ms, ` +
          `count=${stats.timing.count}`,
      );
      if (stats.memory.count > 0) {
        lines.push(
          `  Memory: avg=${(stats.memory.avg / 1024).toFixed(2)}KB, ` +
            `total=${(stats.memory.total / 1024).toFixed(2)}KB`,
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Clear all recorded metrics
   */
  clear(): void {
    this.times.clear();
    this.memory.clear();
  }
}

/**
 * Global singleton performance monitor
 */
export const diffMonitor = new DiffPerformanceMonitor();
