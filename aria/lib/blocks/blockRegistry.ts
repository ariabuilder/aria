/**
 * Central registry for all available blocks. Stores metadata for
 * blocks including their component paths, editor components, and schemas.
 */

import type { BlockMeta } from "../storage/adapter";

export interface RegisteredBlock extends BlockMeta {
  id: string;
}

/**
 * Global block registry
 * Optimized for large numbers of blocks with caching and indexed lookups
 */
class BlockRegistry {
  private blocks: Map<string, RegisteredBlock> = new Map();
  private cachedAll: RegisteredBlock[] | null = null;
  private frameworkIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();

  /**
   * Register a new block type
   */
  register(id: string, meta: BlockMeta): void {
    if (this.blocks.has(id)) {
      console.warn(
        `[BlockRegistry] Block "${id}" is already registered. Overwriting.`
      );
    }

    const block = Object.freeze({ id, ...meta }) as RegisteredBlock;
    this.blocks.set(id, block);

    if (!this.frameworkIndex.has(meta.framework)) {
      this.frameworkIndex.set(meta.framework, new Set());
    }
    this.frameworkIndex.get(meta.framework)!.add(id);

    if (!this.typeIndex.has(meta.type)) {
      this.typeIndex.set(meta.type, new Set());
    }
    this.typeIndex.get(meta.type)!.add(id);

    this.cachedAll = null;
  }

  /**
   * Register multiple blocks at once (more efficient for bulk operations)
   */
  registerMany(blocks: Array<[string, BlockMeta]>): void {
    for (const [id, meta] of blocks) {
      const block = Object.freeze({ id, ...meta }) as RegisteredBlock;
      this.blocks.set(id, block);

      if (!this.frameworkIndex.has(meta.framework)) {
        this.frameworkIndex.set(meta.framework, new Set());
      }
      this.frameworkIndex.get(meta.framework)!.add(id);

      if (!this.typeIndex.has(meta.type)) {
        this.typeIndex.set(meta.type, new Set());
      }
      this.typeIndex.get(meta.type)!.add(id);
    }

    // Invalidate cache once at the end
    this.cachedAll = null;
  }

  /**
   * Get a single block by ID
   */
  get(id: string): RegisteredBlock | undefined {
    return this.blocks.get(id);
  }

  /**
   * Get all registered blocks (cached for performance)
   */
  getAll(): RegisteredBlock[] {
    if (!this.cachedAll) {
      this.cachedAll = Array.from(this.blocks.values());
    }
    return this.cachedAll;
  }

  /**
   * Get blocks by framework (indexed for O(n) where n = matching blocks)
   */
  getByFramework(framework: string): RegisteredBlock[] {
    const ids = this.frameworkIndex.get(framework);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.blocks.get(id)!);
  }

  /**
   * Get blocks by type (indexed for O(n) where n = matching blocks)
   */
  getByType(type: string): RegisteredBlock[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.blocks.get(id)!);
  }

  /**
   * Get all frameworks with registered blocks
   */
  getFrameworks(): string[] {
    return Array.from(this.frameworkIndex.keys());
  }

  /**
   * Get all block types
   */
  getTypes(): string[] {
    return Array.from(this.typeIndex.keys());
  }

  /**
   * Check if a block is registered
   */
  has(id: string): boolean {
    return this.blocks.has(id);
  }

  /**
   * Remove a block from registry
   */
  unregister(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    // Remove from indexes
    this.frameworkIndex.get(block.framework)?.delete(id);
    this.typeIndex.get(block.type)?.delete(id);

    // Remove from main registry
    this.blocks.delete(id);

    this.cachedAll = null;

    return true;
  }

  /**
   * Clear all registered blocks
   */
  clear(): void {
    this.blocks.clear();
    this.frameworkIndex.clear();
    this.typeIndex.clear();
    this.cachedAll = null;
  }

  /**
   * Get registry size
   */
  get size(): number {
    return this.blocks.size;
  }
}

export const blockRegistry = new BlockRegistry();

export function getBlockRegistry(): { blocks: Record<string, RegisteredBlock> } {
  const all = blockRegistry.getAll();
  const blocks: Record<string, RegisteredBlock> = {};
  
  for (const block of all) {
    blocks[block.id] = block;
  }
  
  return { blocks };
}
