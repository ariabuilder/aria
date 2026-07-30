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
const DB_VERSION = 2;
const LEGACY_STORE = "drafts";
const SESSION_STORE = "draftSessions";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A module instance maps to one live Composer tab. Do not persist this in
// sessionStorage: duplicated browser tabs clone sessionStorage and would then
// overwrite each other's recovery entries.
const currentSessionId = createSessionId();

export interface DraftEntry {
  id: string;
  collection: "pages" | "layouts" | "components";
  dsl: PageDSL | LayoutDSL | ComponentDSL;
  lastModified: number;
  synced: boolean;
  sessionId?: string;
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
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        const store = db.createObjectStore(LEGACY_STORE, {
          keyPath: ["collection", "id"],
        });
        store.createIndex("collection", "collection");
        store.createIndex("synced", "synced");
        store.createIndex("lastModified", "lastModified");
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, {
          keyPath: ["collection", "id", "sessionId"],
        });
        store.createIndex("collection", "collection");
        store.createIndex("document", ["collection", "id"]);
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
    sessionId: currentSessionId,
    dsl,
    lastModified: Date.now(),
    synced,
    baseVersion,
    cloudVersion: synced ? baseVersion : undefined,
  };

  await db!.put(SESSION_STORE, entry);
}

export async function getDraft(
  collection: "pages" | "layouts" | "components",
  id: string,
): Promise<DraftEntry | null> {
  if (!db) await initDraftCache();

  const current = (await db!.get(SESSION_STORE, [
    collection,
    id,
    currentSessionId,
  ])) as DraftEntry | undefined;
  if (current && !current.synced) {
    return current;
  }

  const tx = db!.transaction(SESSION_STORE, "readonly");
  const sessionDrafts = (await tx.store
    .index("document")
    .getAll([collection, id])) as DraftEntry[];
  const latestSessionDraft = sessionDrafts
    .filter((entry) => !entry.synced)
    .sort((left, right) => right.lastModified - left.lastModified)[0];
  if (latestSessionDraft) {
    return latestSessionDraft;
  }

  const legacy = (await db!.get(LEGACY_STORE, [
    collection,
    id,
  ])) as DraftEntry | undefined;
  return legacy && !legacy.synced ? legacy : null;
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

  entry.sessionId = entry.sessionId ?? currentSessionId;
  await db!.put(SESSION_STORE, entry);
}

export async function getUnsyncedDrafts(): Promise<DraftEntry[]> {
  if (!db) await initDraftCache();

  const tx = db!.transaction(SESSION_STORE, "readonly");
  const index = tx.store.index("synced");
  const drafts = (await index.getAll(
    IDBKeyRange.only(false),
  )) as DraftEntry[];
  const legacyTx = db!.transaction(LEGACY_STORE, "readonly");
  const legacy = (await legacyTx.store
    .index("synced")
    .getAll(IDBKeyRange.only(false))) as DraftEntry[];

  return [...drafts, ...legacy];
}

export async function deleteDraft(
  collection: "pages" | "layouts" | "components",
  id: string,
  sessionId = currentSessionId,
): Promise<void> {
  if (!db) await initDraftCache();

  await Promise.all([
    db!.delete(SESSION_STORE, [collection, id, sessionId]),
    ...(sessionId === currentSessionId
      ? [db!.delete(LEGACY_STORE, [collection, id])]
      : []),
  ]);
}

export async function clearAllDrafts(): Promise<void> {
  if (!db) await initDraftCache();

  await Promise.all([db!.clear(SESSION_STORE), db!.clear(LEGACY_STORE)]);
}

export async function getDraftsByCollection(
  collection: "pages" | "layouts" | "components",
): Promise<DraftEntry[]> {
  if (!db) await initDraftCache();

  const tx = db!.transaction(SESSION_STORE, "readonly");
  const index = tx.store.index("collection");
  const drafts = (await index.getAll(collection)) as DraftEntry[];
  const legacyTx = db!.transaction(LEGACY_STORE, "readonly");
  const legacy = (await legacyTx.store
    .index("collection")
    .getAll(collection)) as DraftEntry[];

  return [...drafts, ...legacy];
}
