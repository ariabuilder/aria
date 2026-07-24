import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("vue-sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    isReady: ref(false),
    isContributor: ref(false),
    canEditItemInComposer: vi.fn(() => true),
    composerOperationForItem: vi.fn(() => "save.page"),
    getForbiddenMessage: vi.fn(() => "Forbidden"),
  }),
}));

describe("useStageSidebarLoadActions", () => {
  it("does not switch Composer state until the leave decision allows it", async () => {
    const { useStageSidebarLoadActions } = await import(
      "../../../admin/features/Stage/composables/useStageSidebarLoadActions"
    );
    const startEditing = vi.fn();
    const confirmComposerItemSwitch = vi.fn().mockResolvedValue(false);
    const { handleSidebarSelectPage } = useStageSidebarLoadActions({
      appRouter: { startEditing } as never,
      confirmComposerItemSwitch,
    });

    await handleSidebarSelectPage("about");

    expect(confirmComposerItemSwitch).toHaveBeenCalledOnce();
    expect(startEditing).not.toHaveBeenCalled();
  });

  it("switches only after the leave decision resolves", async () => {
    const { useStageSidebarLoadActions } = await import(
      "../../../admin/features/Stage/composables/useStageSidebarLoadActions"
    );
    const callOrder: string[] = [];
    const startEditing = vi.fn(() => callOrder.push("switch"));
    const confirmComposerItemSwitch = vi.fn(async () => {
      callOrder.push("confirm");
      return true;
    });
    const { handleSidebarSelectComponent } = useStageSidebarLoadActions({
      appRouter: { startEditing } as never,
      confirmComposerItemSwitch,
    });

    await handleSidebarSelectComponent("hero-card");

    expect(callOrder).toEqual(["confirm", "switch"]);
    expect(startEditing).toHaveBeenCalledWith({
      itemType: "component",
      itemSlug: "hero-card",
    });
  });
});
