<script setup lang="ts">
import { colord } from "colord";
import { computed, ref } from "vue";

import { studioIcons } from "@/lib/icons";
import {
  pickReadableTextColor,
  resolveEffectiveBackgroundColor,
} from "../../../../lib/design/colorContrast";
import { CHECKERBOARD_STYLE } from "./checkerboard";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  previewColor: string;
  storedReference: string | null;
  valueMode: "literal" | "reference" | "reference-unresolved";
  resolvedLabel: string | null;
  showDetach: boolean;
  isEyeDropperSupported: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  eyedropper: [];
  copy: [];
  detach: [];
}>();

const copied = ref(false);
const { t } = useStudioI18n();

const referenceLabel = computed(() => {
  if (!props.storedReference) {
    return null;
  }

  const match = props.storedReference.match(/^var\(--([^)]+)\)$/);
  return match ? `--${match[1]}` : props.storedReference;
});

const readableTextColor = computed(() =>
  pickReadableTextColor(props.previewColor),
);

const usesThemeText = computed(() => readableTextColor.value === null);

const heroTextStyle = computed(() => {
  const base = readableTextColor.value;
  if (!base) {
    return undefined;
  }
  return { color: base };
});

const heroTextMutedStyle = computed(() => {
  const base = readableTextColor.value;
  if (!base) {
    return undefined;
  }
  return { color: colord(base).alpha(0.85).toRgbString() };
});

const heroToolButtonClass = computed(() => {
  const shared =
    "inline-flex !size-5 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50";

  if (usesThemeText.value) {
    return `${shared} text-foreground/80 hover:bg-black/5 hover:text-primary dark:hover:bg-white/10`;
  }

  const isLightText = readableTextColor.value === "#ffffff";
  return [
    shared,
    "opacity-80 hover:opacity-100",
    isLightText ? "hover:bg-white/15" : "hover:bg-black/10",
  ].join(" ");
});

const heroToolButtonStyle = computed(() =>
  usesThemeText.value ? undefined : heroTextMutedStyle.value,
);

const effectiveBackgroundIsLight = computed(() => {
  const effective = resolveEffectiveBackgroundColor(props.previewColor);
  if (!effective) {
    return false;
  }
  return colord(effective).isLight();
});

const unresolvedWarningClass = computed(() =>
  effectiveBackgroundIsLight.value
    ? "text-amber-900"
    : "text-amber-400",
);

async function handleCopy(): Promise<void> {
  emit("copy");
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1500);
}
</script>

<template>
  <div class="relative">
    <div
      class="relative flex min-h-0 w-full items-stretch overflow-hidden"
      :style="{ background: CHECKERBOARD_STYLE }"
    >
      <div
        class="absolute inset-0"
        :style="{ backgroundColor: previewColor }"
      />

      <div
        class="relative z-10 flex w-full items-center justify-between gap-1.5 px-2 py-1"
        :class="usesThemeText ? 'text-foreground' : ''"
        :style="heroTextStyle"
      >
        <div class="flex min-w-0 flex-1 items-center gap-1.5 leading-none">
          <p
            v-if="valueMode === 'reference' || valueMode === 'reference-unresolved'"
            class="m-0 min-w-0 truncate font-mono text-2xs font-semibold leading-none drop-shadow-sm"
          >
            {{ referenceLabel }}
            <span
              v-if="valueMode === 'reference-unresolved'"
              class="ml-1 font-normal"
              :class="usesThemeText ? 'text-amber-600 dark:text-amber-400' : unresolvedWarningClass"
            >
              · {{ t("colorPicker.unresolved") }}
            </span>
            <button
              v-if="showDetach"
              type="button"
              class="ml-1.5 inline font-normal underline-offset-2 hover:underline"
              :class="
                usesThemeText
                  ? 'text-primary-foreground/90'
                  : 'text-inherit opacity-90 hover:opacity-100'
              "
              @click="emit('detach')"
            >
              {{ t("colorPicker.edit") }}
            </button>
          </p>
          <p
            v-else-if="resolvedLabel"
            class="m-0 min-w-0 truncate font-mono text-2xs leading-none drop-shadow-sm"
            :class="usesThemeText ? 'text-foreground/90' : 'text-inherit'"
            :style="usesThemeText ? undefined : heroTextMutedStyle"
          >
            {{ resolvedLabel }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <button
            v-if="isEyeDropperSupported"
            type="button"
            :class="heroToolButtonClass"
            :style="heroToolButtonStyle"
            :title="t('colorPicker.pickFromScreen')"
            :aria-label="t('colorPicker.pickFromScreen')"
            :disabled="disabled"
            @click="emit('eyedropper')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-4 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M4 20l.75-3.5L17 4.25a1.5 1.5 0 0 1 2.12 0l.63.63a1.5 1.5 0 0 1 0 2.12L7.5 19.25 4 20z"
              />
              <path d="M13 6l5 5" />
            </svg>
          </button>
          <button
            type="button"
            :class="heroToolButtonClass"
            :style="heroToolButtonStyle"
            :title="copied ? t('colorPicker.copied') : t('colorPicker.copyColor')"
            :aria-label="copied ? t('colorPicker.copied') : t('colorPicker.copyColor')"
            :disabled="disabled"
            @click="handleCopy"
          >
            <span
              v-if="copied"
              :class="[studioIcons.checkCircleLinear, 'size-4']"
              aria-hidden="true"
            />
            <span
              v-else
              class="size-3"
              aria-hidden="true"
              :class="studioIcons.copy"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
