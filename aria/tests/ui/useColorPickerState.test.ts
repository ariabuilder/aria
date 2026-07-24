import { computed, ref } from "vue";
import { colord } from "colord";
import { describe, expect, it, vi } from "vitest";

import { useColorPickerState } from "../../admin/components/ui/color-picker/useColorPickerState";
import { toSerializedHex } from "../../admin/features/Design/lib/colorFormat";
import { createDefaultGlobalStylesConfig } from "../../lib/styles/universalDesignSystem";

function createPickerState(
  modelValue: string,
  resolvedModelValue: string | null = null,
) {
  const modelValueRef = ref(modelValue);
  const onUpdate = vi.fn<(value: string) => void>();
  const variables = createDefaultGlobalStylesConfig().variables;
  variables.custom["brand-primary"] = {
    label: "Brand Primary",
    value: "#ff0000",
    category: "color",
    description: "",
  };

  const state = useColorPickerState({
    modelValue: modelValueRef,
    resolvedModelValue: ref(resolvedModelValue),
    showAlpha: ref(false),
    variables: computed(() => variables),
    tokenOptions: computed(() => []),
    previewContext: computed(() => ({
      palettes: [],
      semanticColors: {
        success: "#22c55e",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",
      },
    })),
    onUpdate,
  });

  return { state, modelValueRef, onUpdate, variables };
}

describe("useColorPickerState", () => {
  it("uses raw format when the stored value is a CSS variable reference", () => {
    const { state } = createPickerState("var(--brand-primary)");

    expect(state.activeFormat.value).toBe("raw");
  });

  it("returns to hex format when the stored value is a literal color", () => {
    const { state } = createPickerState("#ff0000");

    expect(state.activeFormat.value).toBe("hex");
  });

  it("emits literal hex from surface apply when stored value is a resolved variable reference", () => {
    const { state, onUpdate } = createPickerState("var(--brand-primary)");

    expect(state.valueMode.value).toBe("reference");

    state.localHue.value = 120;
    state.localSaturation.value = 80;
    state.localValue.value = 70;
    state.applyLiteralFromSurface();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const emitted = onUpdate.mock.calls[0]?.[0] ?? "";
    expect(emitted).not.toBe("var(--brand-primary)");
    expect(colord(emitted).isValid()).toBe(true);
    expect(emitted).toBe(
      toSerializedHex(
        colord({
          h: 120,
          s: 80,
          v: 70,
          a: 1,
        }),
        false,
      ),
    );
    expect(state.valueMode.value).toBe("literal");
  });

  it("detachToLiteral syncs HSV from resolved reference before emit", () => {
    const { state, onUpdate } = createPickerState("var(--brand-primary)");

    state.localHue.value = 120;
    state.localSaturation.value = 80;
    state.localValue.value = 70;

    state.detachToLiteral();
    state.applyLiteralFromSurface();

    expect(onUpdate).toHaveBeenCalledWith("#ff0000");
    expect(state.serializedColorValue.value).toBe("#ff0000");
  });

  it("skips duplicate literal emits when stored value already matches editable color", () => {
    const { state, onUpdate } = createPickerState("#ff0000");

    onUpdate.mockClear();
    state.applyLiteralFromSurface();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not resync HSV when external picker value matches local editable color", () => {
    const { state, modelValueRef } = createPickerState("#ff0000");

    state.localHue.value = 120;
    state.localSaturation.value = 80;
    state.localValue.value = 70;

    const greenHex = state.serializedColorValue.value;
    modelValueRef.value = greenHex;

    expect(state.localHue.value).toBe(120);
    expect(state.localSaturation.value).toBe(80);
    expect(state.localValue.value).toBe(70);
  });

  it("does not emit from surface apply when variable reference is unresolved", () => {
    const variables = createDefaultGlobalStylesConfig().variables;
    const modelValueRef = ref("var(--missing-color)");
    const onUpdate = vi.fn<(value: string) => void>();

    const state = useColorPickerState({
      modelValue: modelValueRef,
      resolvedModelValue: ref(null),
      showAlpha: ref(false),
      variables: computed(() => variables),
      tokenOptions: computed(() => []),
      previewContext: computed(() => ({
        palettes: [],
        semanticColors: {
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
        },
      })),
      onUpdate,
    });

    expect(state.valueMode.value).toBe("reference-unresolved");

    state.localHue.value = 200;
    state.applyLiteralFromSurface();

    expect(onUpdate).not.toHaveBeenCalled();
    expect(state.valueMode.value).toBe("reference-unresolved");
  });
});
