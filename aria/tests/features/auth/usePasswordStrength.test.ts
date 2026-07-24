import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { usePasswordStrength } from "../../../admin/features/Auth/composables/usePasswordStrength";

describe("usePasswordStrength", () => {
  it("advances the meter for every character", () => {
    const password = ref("");
    const { percentWidth } = usePasswordStrength(password);

    expect(percentWidth.value).toBe("0%");

    password.value = "a";
    expect(percentWidth.value).toBe("12%");

    password.value = "ab";
    expect(percentWidth.value).toBe("14%");
  });

  it("rewards password variety without exceeding a full meter", () => {
    const password = ref("Abcdefghijk1!");
    const { colorClass, percentWidth } = usePasswordStrength(password);

    expect(percentWidth.value).toBe("86%");
    expect(colorClass.value).toBe("bg-primary");
  });
});
