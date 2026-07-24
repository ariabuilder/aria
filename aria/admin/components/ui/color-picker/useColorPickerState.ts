/**
 * Color picker value modes: - literal: modelValue is a paintable color; HSV edits emit
 * serialized hex. - reference: modelValue is var(--*); surface edits detach and emit literal hex.
 */

import {
  computed,
  ref,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  toValue,
} from "vue";
import { colord, type Colord } from "colord";

import {
  colordToOklchString,
  formatColorInput,
  parseColorInput,
  toSerializedHex,
  type ColorInputFormat,
} from "@/features/Design/lib/colorFormat";
import {
  extractCssVariableReferenceKey,
  normalizeRawColorInput,
  resolveColorPickerPreviewValue,
  type ColorPickerPreviewContext,
} from "@/features/Design/lib/colorPickerValue";
import type { ColorPickerValueMode } from "./types";

export function resolveColorPickerSurfacePreviewValue(
  valueMode: ColorPickerValueMode,
  modelValue: string,
  serializedLiteral: string,
): string | null {
  if (valueMode === "reference-unresolved") {
    return null;
  }

  if (valueMode === "reference") {
    const stored = modelValue.trim();
    return stored.length > 0 ? stored : null;
  }

  const literal = serializedLiteral.trim();
  return literal.length > 0 ? literal : null;
}

export function resolveColorPickerSurfaceCommitValue(
  valueMode: ColorPickerValueMode,
  modelValue: string,
  serializedLiteral: string,
  detachReference: boolean,
): string {
  if (valueMode === "reference" && !detachReference) {
    return modelValue.trim();
  }

  const literal = serializedLiteral.trim();
  return literal.length > 0 ? literal : modelValue.trim();
}
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";

export function isReferenceStoredValue(value: string): boolean {
  return extractCssVariableReferenceKey(value.trim()) !== null;
}

export interface UseColorPickerStateOptions {
  modelValue: Ref<string>;
  resolvedModelValue: Ref<string | null | undefined>;
  showAlpha: Ref<boolean>;
  variables: MaybeRefOrGetter<GlobalStyleVariables>;
  tokenOptions: ComputedRef<readonly { value: string; preview: string }[]>;
  previewContext: ComputedRef<ColorPickerPreviewContext>;
  onUpdate: (value: string) => void;
  onCommit?: (value: string) => void;
}

export function useColorPickerState(options: UseColorPickerStateOptions) {
  const activeFormat = ref<ColorInputFormat>("hex");
  const isDragging = ref(false);
  const lastDirectValue = ref("");
  const forcedLiteral = ref(false);

  const storedVariableReference = computed(() => {
    const trimmed = options.modelValue.value.trim();
    if (!trimmed || !isReferenceStoredValue(trimmed)) {
      return null;
    }
    return trimmed;
  });

  const implicitResolvedModelValue = computed(() => {
    if (options.resolvedModelValue.value != null) {
      return null;
    }

    if (!isReferenceStoredValue(options.modelValue.value)) {
      return null;
    }

    return resolveColorPickerPreviewValue(
      options.modelValue.value,
      toValue(options.variables),
      options.tokenOptions.value,
      options.previewContext.value,
    );
  });

  const pickerColorValue = computed(
    () =>
      options.resolvedModelValue.value?.trim() ||
      implicitResolvedModelValue.value?.trim() ||
      options.modelValue.value.trim(),
  );

  const valueMode = computed<ColorPickerValueMode>(() => {
    if (forcedLiteral.value) {
      return "literal";
    }

    const stored = options.modelValue.value.trim();
    if (!stored) {
      return "literal";
    }

    if (!isReferenceStoredValue(stored)) {
      return "literal";
    }

    const resolved = pickerColorValue.value;
    if (!resolved || resolved === stored) {
      return "reference-unresolved";
    }

    if (!colord(resolved).isValid()) {
      return "reference-unresolved";
    }

    return "reference";
  });

  const canEmitLiteralFromSurface = computed(
    () => valueMode.value === "literal",
  );

  const hasResolvablePreview = computed(() => {
    const resolved = pickerColorValue.value.trim();
    return Boolean(resolved && colord(resolved).isValid());
  });

  const currentColor = computed<Colord | null>(() => {
    if (valueMode.value === "reference-unresolved") {
      return null;
    }

    const parsed = colord(pickerColorValue.value);
    return parsed.isValid() ? parsed : null;
  });

  const oklchString = computed(() =>
    currentColor.value
      ? colordToOklchString(currentColor.value)
      : "oklch(0% 0 0)",
  );

  const initialHsv = (currentColor.value ?? colord("#000000")).toHsv();
  const localHue = ref(initialHsv.h);
  const localSaturation = ref(initialHsv.s);
  const localValue = ref(initialHsv.v);
  const localAlpha = ref(initialHsv.a ?? 1);

  const editableColor = computed(() =>
    colord({
      h: localHue.value,
      s: localSaturation.value,
      v: localValue.value,
      a: options.showAlpha.value ? localAlpha.value : 1,
    }),
  );

  const previewColor = computed(() => {
    if (valueMode.value === "reference-unresolved") {
      return "transparent";
    }
    return editableColor.value.toRgbString();
  });

  const serializedColorValue = computed(() =>
    toSerializedHex(editableColor.value, options.showAlpha.value),
  );

  function syncColorFromColord(color: Colord): void {
    const newHsv = color.toHsv();
    localHue.value = newHsv.h;
    localSaturation.value = newHsv.s;
    localValue.value = newHsv.v;
    if (options.showAlpha.value) {
      localAlpha.value = newHsv.a ?? 1;
    }
  }

  function syncHsvFromPickerValue(): void {
    if (isDragging.value) {
      return;
    }

    if (valueMode.value === "reference-unresolved") {
      return;
    }

    const color = currentColor.value ?? colord("#000000");
    if (editableColor.value.isEqual(color)) {
      return;
    }

    const newHsv = color.toHsv();
    localHue.value = newHsv.h;
    localSaturation.value = newHsv.s;
    localValue.value = newHsv.v;
    localAlpha.value = newHsv.a ?? 1;
  }

  watch(pickerColorValue, syncHsvFromPickerValue, { immediate: true });

  watch(
    () => options.modelValue.value,
    (next) => {
      const trimmed = next.trim();
      if (isReferenceStoredValue(trimmed)) {
        activeFormat.value = "raw";
        forcedLiteral.value = false;
        return;
      }

      lastDirectValue.value = next;
      forcedLiteral.value = false;
      if (activeFormat.value === "raw") {
        activeFormat.value = "hex";
      }
    },
    { immediate: true },
  );

  function detachToLiteral(): void {
    const resolved = pickerColorValue.value.trim();
    if (resolved && colord(resolved).isValid()) {
      syncColorFromColord(colord(resolved));
    } else if (
      lastDirectValue.value &&
      colord(lastDirectValue.value).isValid()
    ) {
      syncColorFromColord(colord(lastDirectValue.value));
    }

    forcedLiteral.value = true;
  }

  function emitLiteralUpdate(): void {
    if (!canEmitLiteralFromSurface.value) {
      return;
    }

    const next = serializedColorValue.value;
    const stored = options.modelValue.value.trim();
    if (
      stored &&
      !isReferenceStoredValue(stored) &&
      colord(stored).isEqual(colord(next))
    ) {
      return;
    }

    options.onUpdate(next);
    lastDirectValue.value = next;
  }

  function emitReferenceUpdate(value: string): void {
    options.onUpdate(value);
  }

  function emitCommit(value?: string): void {
    options.onCommit?.(value ?? options.modelValue.value);
  }

  function applyLiteralFromSurface(): void {
    if (valueMode.value === "reference") {
      forcedLiteral.value = true;
    }
    emitLiteralUpdate();
  }

  function setStoredValue(value: string): void {
    if (isReferenceStoredValue(value)) {
      forcedLiteral.value = false;
      options.onUpdate(value);
      return;
    }

    forcedLiteral.value = true;
    const parsed = colord(value.trim());
    if (parsed.isValid()) {
      syncColorFromColord(parsed);
      const next = toSerializedHex(parsed, options.showAlpha.value);
      options.onUpdate(next);
      lastDirectValue.value = next;
      return;
    }

    options.onUpdate(value);
  }

  function setColor(value: string): void {
    const parsed = colord(value.trim());
    if (!parsed.isValid()) {
      return;
    }

    detachToLiteral();
    syncColorFromColord(parsed);
    emitLiteralUpdate();
  }

  function setDragging(active: boolean): void {
    isDragging.value = active;
  }

  return {
    activeFormat,
    isDragging,
    lastDirectValue,
    storedVariableReference,
    pickerColorValue,
    valueMode,
    canEmitLiteralFromSurface,
    hasResolvablePreview,
    currentColor,
    oklchString,
    localHue,
    localSaturation,
    localValue,
    localAlpha,
    editableColor,
    previewColor,
    serializedColorValue,
    syncColorFromColord,
    detachToLiteral,
    emitLiteralUpdate,
    emitReferenceUpdate,
    emitCommit,
    applyLiteralFromSurface,
    setStoredValue,
    setColor,
    setDragging,
    normalizeRawColorInput,
    formatColorInput,
    parseColorInput: (raw: string, format: ColorInputFormat) =>
      parseColorInput(raw, format, { showAlpha: options.showAlpha.value }),
  };
}
