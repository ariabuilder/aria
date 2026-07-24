import fs from "fs/promises";
import path from "path";
import { log } from "../utils/logger";

export class SlugIndex {
  private indexPath: string;
  private index: Map<string, string> = new Map(); // slug -> uuid
  private reverseIndex: Map<string, string> = new Map(); // uuid -> slug
  private isInitialized = false;

  constructor(storageDir: string) {
    this.indexPath = path.join(storageDir, "metadata", "slug-index.json");
  }

  private async ensureInitialized() {
    if (this.isInitialized) return;

    try {
      const content = await fs.readFile(this.indexPath, "utf-8");
      const data = JSON.parse(content);
      this.index = new Map(Object.entries(data.slugs));
      this.reverseIndex = new Map(Object.entries(data.uuids));
    } catch {
      // Index doesn't exist or is corrupt, start empty
      this.index = new Map();
      this.reverseIndex = new Map();
    }
    this.isInitialized = true;
  }

  private async save() {
    const data = {
      slugs: Object.fromEntries(this.index),
      uuids: Object.fromEntries(this.reverseIndex),
    };
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get(slug: string): Promise<string | undefined> {
    await this.ensureInitialized();
    const normalizedSlug = this.normalizeSlug(slug);
    return this.index.get(normalizedSlug);
  }

  async set(slug: string, uuid: string) {
    await this.ensureInitialized();
    const normalizedSlug = this.normalizeSlug(slug);

    // Remove old mapping if UUID had a different slug
    const oldSlug = this.reverseIndex.get(uuid);
    if (oldSlug && oldSlug !== normalizedSlug) {
      this.index.delete(oldSlug);
    }

    this.index.set(normalizedSlug, uuid);
    this.reverseIndex.set(uuid, normalizedSlug);
    await this.save();
  }

  async remove(uuid: string) {
    await this.ensureInitialized();
    const slug = this.reverseIndex.get(uuid);
    if (slug) {
      this.index.delete(slug);
    }
    this.reverseIndex.delete(uuid);
    await this.save();
  }

  async rebuild(pagesDir: string) {
    this.index.clear();
    this.reverseIndex.clear();

    try {
      const dirs = await fs.readdir(pagesDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        try {
          const metaPath = path.join(pagesDir, dir.name, "meta.json");
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent);

          if (meta.slug && meta.id) {
            const normalizedSlug = this.normalizeSlug(meta.slug);
            this.index.set(normalizedSlug, meta.id);
            this.reverseIndex.set(meta.id, normalizedSlug);
          }
        } catch (e) {
          console.warn(`[SlugIndex] Failed to index page ${dir.name}:`, e);
        }
      }
      await this.save();
      this.isInitialized = true;
    } catch (e) {
      log("error", "[SlugIndex] Failed to rebuild index", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private normalizeSlug(slug: string): string {
    let s = slug.trim();
    if (s.startsWith("/")) s = s.slice(1);
    if (s === "" || s === "/") return "index";
    return s;
  }
}
