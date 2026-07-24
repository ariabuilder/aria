import { describe, expect, it, vi } from "vitest";

import { useStageShellActions } from "@/features/Stage/composables/useStageShellActions";

describe("useStageShellActions picker guard", () => {
  it("opens picker only for empty component payloads", () => {
    const openComponentPicker = vi.fn();
    const handleAddElement = vi.fn();

    const { handleSidebarAddElement } = useStageShellActions({
      openPicker: vi.fn(),
      openComponentPicker,
      openLeftSidebar: vi.fn(),
      setEditingTab: vi.fn(),
      handleAddElement,
    });

    handleSidebarAddElement({
      type: "component",
      data: { type: "Component" },
    });
    expect(openComponentPicker).toHaveBeenCalledTimes(1);
    expect(handleAddElement).not.toHaveBeenCalled();

    openComponentPicker.mockClear();

    handleSidebarAddElement({
      type: "component",
      componentSlug: "hero-cta",
      data: {
        type: "Component",
        reference: { type: "instance", masterId: "hero-cta" },
      },
    });

    expect(openComponentPicker).not.toHaveBeenCalled();
    expect(handleAddElement).toHaveBeenCalledTimes(1);
  });
});
