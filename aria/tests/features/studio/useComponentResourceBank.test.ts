import { beforeEach, describe, expect, it } from "vitest";
import type { ComponentDSL } from "@/lib/types/nodes";
import {
  __resetComponentResourceBankForTests,
  __setComponentResourceBankLoaderForTests,
  getCachedComponentResource,
  invalidateComponentResource,
  isComponentResourceInvalidated,
  loadComponentResource,
  updateCachedComponentResource,
} from "@/features/Studio/components/composables/useComponentResourceBank";

function component(id: string, name = id): ComponentDSL {
  return {
    id,
    name,
    category: "custom",
    nodes: [],
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

describe("useComponentResourceBank", () => {
  beforeEach(() => {
    __resetComponentResourceBankForTests();
  });

  it("keeps a loaded component valid until explicit invalidation", async () => {
    let calls = 0;
    __setComponentResourceBankLoaderForTests(async (id) => {
      calls += 1;
      return component(id);
    });

    const first = await loadComponentResource("hero");
    const second = await loadComponentResource("hero");

    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("deduplicates concurrent component loads", async () => {
    let calls = 0;
    let resolveLoad!: (value: ComponentDSL) => void;
    __setComponentResourceBankLoaderForTests(
      () =>
        new Promise((resolve) => {
          calls += 1;
          resolveLoad = resolve;
        }),
    );

    const first = loadComponentResource("hero");
    const second = loadComponentResource("hero");
    resolveLoad(component("hero"));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(calls).toBe(1);
  });

  it("retains invalidated content until a targeted refresh replaces it", async () => {
    let calls = 0;
    __setComponentResourceBankLoaderForTests(async (id) => {
      calls += 1;
      return component(id, calls === 1 ? "Old" : "New");
    });

    await loadComponentResource("hero");
    invalidateComponentResource("hero", "remote-mutation");

    const stale = getCachedComponentResource("hero");
    expect(stale?.component.name).toBe("Old");
    expect(stale && isComponentResourceInvalidated(stale)).toBe(true);

    const fresh = await loadComponentResource("hero", { revalidate: true });
    expect(fresh.component.name).toBe("New");
    expect(isComponentResourceInvalidated(fresh)).toBe(false);
    expect(calls).toBe(2);
  });

  it("applies a canonical mutation result without a follow-up read", () => {
    const entry = updateCachedComponentResource(component("hero", "Saved"));

    expect(entry.component.name).toBe("Saved");
    expect(getCachedComponentResource("hero")).toBe(entry);
  });

  it("does not let an older load overwrite a committed save", async () => {
    let resolveLoad!: (value: ComponentDSL) => void;
    __setComponentResourceBankLoaderForTests(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const staleLoad = loadComponentResource("hero");
    const committed = updateCachedComponentResource(component("hero", "Saved"));
    resolveLoad(component("hero", "Old"));

    await expect(staleLoad).resolves.toBe(committed);
    expect(getCachedComponentResource("hero")?.component.name).toBe("Saved");
  });

  it("refetches when an uncached in-flight load is invalidated", async () => {
    const resolvers: Array<(value: ComponentDSL) => void> = [];
    __setComponentResourceBankLoaderForTests(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const staleLoad = loadComponentResource("hero");
    invalidateComponentResource("hero", "realtime");
    resolvers[0]?.(component("hero", "Old"));
    await Promise.resolve();
    resolvers[1]?.(component("hero", "Fresh"));

    await expect(staleLoad).resolves.toMatchObject({
      component: { name: "Fresh" },
    });
    expect(getCachedComponentResource("hero")?.component.name).toBe("Fresh");
  });
});
