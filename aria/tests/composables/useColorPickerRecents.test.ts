import { beforeEach, describe, expect, it } from "vitest";

import { useColorPickerRecents } from "../../admin/composables/useColorPickerRecents";

describe("useColorPickerRecents", () => {
  beforeEach(() => {
    localStorage.removeItem("aria-color-picker-recents");
  });

  it("stores literal hex colors", () => {
    const { pushRecent, recents } = useColorPickerRecents();

    pushRecent("#ff0000");
    expect(recents.value).toContain("#ff0000");
  });

  it("skips CSS variable references", () => {
    const { pushRecent, recents } = useColorPickerRecents();

    pushRecent("var(--brand)");
    expect(recents.value).not.toContain("var(--brand)");
  });

  it("dedupes and caps the list", () => {
    const { pushRecent, recents } = useColorPickerRecents();

    for (let i = 0; i < 20; i += 1) {
      pushRecent(`#${i.toString(16).padStart(6, "0")}`);
    }

    expect(recents.value.length).toBeLessThanOrEqual(13);
  });
});
