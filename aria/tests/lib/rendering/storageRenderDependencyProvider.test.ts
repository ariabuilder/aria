import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { ComponentDSL, LayoutDSL } from "../../../lib/types/nodes";
import { createStorageRenderDependencyProvider } from "../../../lib/rendering/storageRenderDependencyProvider";

const layout: LayoutDSL = {
  id: "layout-main",
  name: "Main",
  nodes: [],
  slots: [],
};

const component: ComponentDSL = {
  id: "component-card",
  name: "Card",
  nodes: [],
};

describe("createStorageRenderDependencyProvider", () => {
  it("passes exact dependency revisions through the shared adapter", async () => {
    const getLayoutDSL = vi.fn(async () => layout);
    const getComponentDSL = vi.fn(async () => component);
    const adapter = {
      getLayoutDSL,
      getComponentDSL,
    } as unknown as StorageAdapter;
    const provider = createStorageRenderDependencyProvider(adapter);

    await expect(
      provider.getLayout({ id: layout.id, version: "layout-v4" }),
    ).resolves.toBe(layout);
    await expect(
      provider.getComponent({ id: component.id, version: "component-v7" }),
    ).resolves.toBe(component);
    expect(getLayoutDSL).toHaveBeenCalledWith(layout.id, "layout-v4");
    expect(getComponentDSL).toHaveBeenCalledWith(component.id, "component-v7");
  });

  it("uses an explicitly selected localized layout without storage access", async () => {
    const getLayoutDSL = vi.fn(async () => null);
    const adapter = {
      getLayoutDSL,
      getComponentDSL: vi.fn(async () => null),
    } as unknown as StorageAdapter;
    const provider = createStorageRenderDependencyProvider(adapter, {
      layoutOverride: layout,
    });

    await expect(provider.getLayout({ id: layout.id })).resolves.toBe(layout);
    expect(getLayoutDSL).not.toHaveBeenCalled();
  });
});
