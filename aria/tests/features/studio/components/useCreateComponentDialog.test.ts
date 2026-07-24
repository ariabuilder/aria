import { describe, expect, it, vi } from "vitest";
import { useCreateComponentDialog } from "../../../../admin/features/Studio/components/composables/useCreateComponentDialog";

describe("useCreateComponentDialog", () => {
  it("creates a component and closes the dialog on success", async () => {
    const createComponent = vi.fn(async () => "hero-banner");
    const dialog = useCreateComponentDialog();

    dialog.open();
    expect(dialog.isOpen.value).toBe(true);

    const slug = await dialog.submitCreateComponent(
      "Hero Banner",
      { category: "Hero" },
      createComponent,
    );

    expect(slug).toBe("hero-banner");
    expect(createComponent).toHaveBeenCalledWith({
      name: "Hero Banner",
      category: "Hero",
    });
    expect(dialog.isOpen.value).toBe(false);
  });

  it("returns null when create fails", async () => {
    const createComponent = vi.fn(async () => null);
    const dialog = useCreateComponentDialog();

    dialog.open();
    const slug = await dialog.submitCreateComponent(
      "Hero Banner",
      undefined,
      createComponent,
    );

    expect(slug).toBeNull();
    expect(dialog.isOpen.value).toBe(true);
  });
});
