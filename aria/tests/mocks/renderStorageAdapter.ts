import { vi } from "vitest";
import type { StorageAdapter } from "../../lib/storage/adapter";

const emptyList = async () => [];

export function createRenderStorageAdapterStub(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter {
  return {
    getSnapshot: vi.fn(async () => null),
    getPageDSL: vi.fn(async () => null),
    getPublishedPageDSL: vi.fn(async () => null),
    getSiteSettings: vi.fn(async () => ({})),
    getDesignSystem: vi.fn(async () => null),
    getLayoutDSL: vi.fn(async () => null),
    getComponentDSL: vi.fn(async () => null),
    listPagesDSL: vi.fn(emptyList),
    listLayoutsDSL: vi.fn(emptyList),
    listComponentsDSL: vi.fn(emptyList),
    listCollections: vi.fn(emptyList),
    ...overrides,
  } as StorageAdapter;
}
