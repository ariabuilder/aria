import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalChatHistory,
  LOCAL_CHAT_HISTORY_STORAGE_KEY,
  readLocalChatHistory,
  writeLocalChatHistory,
} from "../../../admin/features/Agent/lib/localChatHistory";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("local chat history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes and reads versioned local history", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());

    writeLocalChatHistory([
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: "Hello",
        createdAt: "2026-06-12T12:00:00.000Z",
      },
    ]);

    expect(readLocalChatHistory()).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: "Hello",
        createdAt: "2026-06-12T12:00:00.000Z",
      },
    ]);
  });

  it("clears corrupt local history", () => {
    const storage = createLocalStorageMock();
    vi.stubGlobal("localStorage", storage);
    storage.setItem(LOCAL_CHAT_HISTORY_STORAGE_KEY, "{not-json");

    expect(readLocalChatHistory()).toEqual([]);
    expect(storage.getItem(LOCAL_CHAT_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("clears stored history", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    writeLocalChatHistory([
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: "Hello",
        createdAt: "2026-06-12T12:00:00.000Z",
      },
    ]);

    clearLocalChatHistory();
    expect(readLocalChatHistory()).toEqual([]);
  });
});
