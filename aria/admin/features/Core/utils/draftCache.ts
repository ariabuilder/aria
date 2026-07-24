/**
 * Detection. Prevents data loss from multi-tab/multi-device editing.
 */

import { openDB, type IDBPDatabase } from "idb";
import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../../../lib/types/nodes";

const DB_NAME = "aria-draft-cache";
const DB_VERSION = 1;

export interface DraftEntry {
  id: string;
  collection: "pages" | "layouts" | "components";
  dsl: PageDSL | LayoutDSL | ComponentDSL;
  lastModified: number;
  synced: boolean;
  baseVersion?: string; // Version when draft was created (for conflict detection)
  cloudVersion?: string; // Last known cloud version
}

let db: IDBPDatabase | null = null;

/**
 * Initialize IndexedDB for draft storage
 */
export async function initDraftCache(): Promise<void> {
  if (db) return;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("drafts")) {
        const store = db.createObjectStore("drafts", {
          keyPath: ["collection", "id"],
        });
        store.createIndex("collection", "collection");
        store.createIndex("synced", "synced");
        store.createIndex("lastModified", "lastModified");
      }
    },
  });
}

export async function saveDraft(
  collection: "pages" | "layouts" | "components",
  id: string,
  dsl: PageDSL | LayoutDSL | ComponentDSL,
  synced = false,
  baseVersion?: string,
): Promise<void> {
  if (!db) await initDraftCache();

  const entry: DraftEntry = {
    id,
    collection,
    dsl,
    lastModified: Date.now(),
    synced,
    baseVersion,
    cloudVersion: synced ? baseVersion : undefined,
  };

  await db!.put("drafts", entry);
}

export async function getDraft(
  collection: "pages" | "layouts" | "components",
  id: string,
): Promise<DraftEntry | null> {
  if (!db) await initDraftCache();

  const entry = await db!.get("drafts", [collection, id]);
  return entry || null;
}

/**
 * Mark a draft as synced with cloud version
 */
export async function markSynced(
  collection: "pages" | "layouts" | "components",
  id: string,
  version: string,
): Promise<void> {
  if (!db) await initDraftCache();

  const entry = await getDraft(collection, id);
  if (!entry) return;

  entry.synced = true;
  entry.cloudVersion = version;
  entry.baseVersion = version;

  await db!.put("drafts", entry);
}

export async function getUnsyncedDrafts(): Promise<DraftEntry[]> {
  if (!db) await initDraftCache();

  const tx = db!.transaction("drafts", "readonly");
  const index = tx.store.index("synced");
  const drafts = await index.getAll(IDBKeyRange.only(false));

  return drafts;
}

export async function deleteDraft(
  collection: "pages" | "layouts" | "components",
  id: string,
): Promise<void> {
  if (!db) await initDraftCache();

  await db!.delete("drafts", [collection, id]);
}

export async function clearAllDrafts(): Promise<void> {
  if (!db) await initDraftCache();

  await db!.clear("drafts");
}

export async function getDraftsByCollection(
  collection: "pages" | "layouts" | "components",
): Promise<DraftEntry[]> {
  if (!db) await initDraftCache();

  const tx = db!.transaction("drafts", "readonly");
  const index = tx.store.index("collection");
  const drafts = await index.getAll(collection);

  return drafts;
}
