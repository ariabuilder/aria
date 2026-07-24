<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import type { ColorShade, SemanticColors } from "../../../../lib/design/types";
import type { AccessibilityPairCard } from "../composables/useColorSystemViewState";

type SemanticKey = keyof SemanticColors;

interface SemanticTokenModel {
  key: SemanticKey;
  var: string;
}

defineProps<{
  semanticColors: SemanticColors;
  semanticTokens: readonly SemanticTokenModel[];
  semanticScaleStops: ColorShade[];
  accessibilityPairs: AccessibilityPairCard[];
  previewPrimaryBg: string;
  previewPrimaryText: string;
  previewOutlineBorder: string;
  previewOutlineText: string;
  previewLinkColor: string;
  getSemanticShadeHex: (key: SemanticKey, shade: ColorShade) => string;
  getSemanticContrastBadge: (key: SemanticKey) => string;
  getSemanticTokenLabel: (key: SemanticKey) => string;
}>();

const emit = defineEmits<{
  updateSemanticColor: [key: SemanticKey, color: string];
  copy: [hex: string, id: string, announcement: string];
}>();

const { t } = useStudioI18n();

function copySemantic(key: SemanticKey, label: string, hex: string): void {
  emit(
    "copy",
    hex,
    `${key}-base`,
    t("design.colors.copySemanticAnnouncement", { name: label, hex }),
  );
}
</script>

<template>
  <aside class="color-inspector" :aria-label="t('design.colors.inspector')">
    <section class="inspector-section space-y-3">
      <h2 class="inspector-heading">{{ t("design.colors.livePreview") }}</h2>
      <div
        class="flex flex-wrap items-center gap-2"
        :aria-label="t('design.colors.previewComponents')"
      >
        <span
          class="inline-flex h-8 items-center rounded-sm px-3 text-xs font-medium"
          :style="{ backgroundColor: previewPrimaryBg, color: previewPrimaryText }"
        >
          {{ t("design.colors.previewPrimary") }}
        </span>
        <span
          class="inline-flex h-8 items-center rounded-sm border bg-transparent px-3 text-xs font-medium"
          :style="{ borderColor: previewOutlineBorder, color: previewOutlineText }"
        >
          {{ t("design.colors.previewOutline") }}
        </span>
        <span
          class="inline-flex h-8 items-center px-1 text-xs font-medium underline underline-offset-3"
          :style="{ color: previewLinkColor }"
        >
          {{ t("design.colors.previewTextLink") }}
        </span>
      </div>

    </section>

    <section class="inspector-section space-y-3">
      <h2 class="inspector-heading">{{ t("design.colors.semanticColors") }}</h2>
      <div class="space-y-2">
        <div
          v-for="token in semanticTokens"
          :key="token.key"
          class="rounded-sm border border-solid border-border/80 bg-card/25 p-2.5"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <ColorPicker
              :model-value="semanticColors[token.key]"
              show-alpha
              @update:model-value="emit('updateSemanticColor', token.key, $event)"
            >
              <Button
                type="button"
                variant="color-swatch"
                class="size-7 shrink-0 overflow-hidden rounded-sm! border-solid shadow-none"
                :style="{ backgroundColor: semanticColors[token.key] }"
                :aria-label="
                  t('design.colors.pickTokenColor', {
                    name: getSemanticTokenLabel(token.key),
                  })
                "
              />
            </ColorPicker>

            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-xs font-medium text-foreground">
                {{ getSemanticTokenLabel(token.key) }}
              </p>
              <button
                type="button"
                class="block max-w-full truncate font-mono text-2xs uppercase text-muted-foreground hover:text-foreground focus-visible:outline-1 focus-visible:outline-primary"
                :aria-label="
                  t('design.colors.copySemanticAria', {
                    name: getSemanticTokenLabel(token.key),
                    hex: semanticColors[token.key],
                  })
                "
                @click="
                  copySemantic(
                    token.key,
                    getSemanticTokenLabel(token.key),
                    semanticColors[token.key],
                  )
                "
              >
                {{ semanticColors[token.key] }}
              </button>
            </div>

            <span
              class="shrink-0 rounded-sm border border-solid border-border px-1.5 py-0.5 font-mono text-2xs text-foreground"
            >
              {{ getSemanticContrastBadge(token.key) }}
            </span>
          </div>

          <div class="mt-2 flex h-1.5 overflow-hidden rounded-[2px]" aria-hidden="true">
            <span
              v-for="shade in semanticScaleStops"
              :key="shade"
              class="min-w-0 flex-1"
              :style="{ backgroundColor: getSemanticShadeHex(token.key, shade) }"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="inspector-section space-y-3">
      <h2 class="inspector-heading">{{ t("design.colors.contrast") }}</h2>
      <div class="space-y-2">
        <div
          v-for="pair in accessibilityPairs"
          :key="pair.id"
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-sm border border-solid border-border/80 bg-card/25 px-2.5 py-2"
        >
          <div class="min-w-0">
            <p class="m-0 truncate text-2xs font-medium text-foreground">
              {{ pair.label }}
            </p>
            <div class="mt-1 flex -space-x-1" aria-hidden="true">
              <span
                class="size-3.5 rounded-full border border-solid border-background"
                :style="{ backgroundColor: pair.foreground }"
              />
              <span
                class="size-3.5 rounded-full border border-solid border-background"
                :style="{ backgroundColor: pair.background }"
              />
            </div>
          </div>
          <span class="font-mono text-2xs text-muted-foreground">
            {{ pair.ratioLabel }}
          </span>
          <span
            class="min-w-7 rounded-sm border border-solid border-border px-1 py-0.5 text-center font-mono text-2xs text-foreground"
          >
            <span
              :class="[
                pair.evaluation?.aaNormal
                  ? studioIcons.checkLinear
                  : studioIcons.warning,
                'mr-1 inline-block size-3 align-[-2px]',
              ]"
              aria-hidden="true"
            />
            {{ pair.normalLabel }}
          </span>
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.color-inspector {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: color-mix(in srgb, var(--card) 22%, var(--background));
}

.inspector-section {
  border-bottom: 1px dashed var(--border);
  padding: 1rem;
}

.inspector-section:last-child {
  border-bottom: 0;
}

.inspector-heading {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 500;
  color: var(--foreground);
}
</style>
