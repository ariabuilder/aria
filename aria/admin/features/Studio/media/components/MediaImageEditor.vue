<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaAsset } from "../types/media";
import type {
  MediaCropRect,
  MediaFocalPoint,
  MediaTransformVariant,
} from "../../../../../lib/media/transforms/schemas";
import { createFocalAspectRatioCrop } from "../../../../../lib/media/transforms/crop";
import MediaCropCanvas from "./MediaCropCanvas.vue";
import { useMediaTransforms } from "../composables/useMediaTransforms";
import { DeleteConfirmDialog } from "@/features/Studio/core/components";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { MEDIA_TRANSFORM_INPUT_MAX_BYTES } from "../../../../../lib/media/uploadLimits";

type AspectRatio = { width: number; height: number };

const props = defineProps<{
  asset: MediaAsset;
  sourceRevision?: string | number;
}>();
const emit = defineEmits<{
  variantsChange: [variants: readonly MediaTransformVariant[]];
  selectionChange: [
    selection: { variantId: string | null; draftName: string | null },
  ];
  sourceDimensions: [dimensions: { width: number; height: number }];
}>();
const { t } = useStudioI18n();
const {
  state,
  isLoading,
  isSaving,
  load,
  saveProfile,
  saveVariant,
  deleteVariant,
} = useMediaTransforms();

const crop = ref<MediaCropRect>({ x: 0, y: 0, width: 1, height: 1 });
const variantId = ref<string | null>(null);
const variantName = ref(t("media.imageEditor.defaultVariantName"));
const aspectRatio = ref<AspectRatio | null>({ width: 16, height: 9 });
const outputWidth = ref("1600");
const outputHeight = ref("900");
const outputFormat = ref<"auto" | "jpeg" | "png" | "webp" | "avif">("auto");
const outputQuality = ref(100);
const altText = ref("");
const title = ref("");
const caption = ref("");
const credit = ref("");
const copyright = ref("");
const profileFocalPoint = ref<MediaFocalPoint | null>(null);
const variantFocalPoint = ref<MediaFocalPoint | null>(null);
const isFocalMode = ref(false);
const isDeleteCropDialogOpen = ref(false);
const isMetadataOpen = ref(false);
const draftVariantName = ref<string | null>(null);
const sourceDimensions = ref<{ width: number; height: number } | null>(
  props.asset.dimensions ?? null,
);

const sourceVersion = computed(
  () => state.value?.profile?.currentSourceVersion ?? 1,
);
const selectedVariant = computed(() =>
  state.value?.variants.find((item) => item.id === variantId.value),
);
const isSelectedVariantStale = computed(
  () =>
    Boolean(selectedVariant.value) &&
    selectedVariant.value?.sourceVersion !== sourceVersion.value,
);
const sourcePreviewUrl = computed(() => {
  const url = props.asset.deliveryUrl || props.asset.url;
  if (props.sourceRevision == null) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}source=${encodeURIComponent(String(props.sourceRevision))}`;
});
const hasActiveVariant = computed(
  () => Boolean(selectedVariant.value) || Boolean(draftVariantName.value),
);
const isTransformSupported = computed(
  () => props.asset.size <= MEDIA_TRANSFORM_INPUT_MAX_BYTES,
);
const focalPreviewPosition = computed(() => {
  const point = effectiveFocalPoint.value ?? { x: 0.5, y: 0.5 };
  return `${Math.round(point.x * 100)}% ${Math.round(point.y * 100)}%`;
});
const effectiveFocalPoint = computed(
  () => variantFocalPoint.value ?? profileFocalPoint.value,
);

const ratioPresets: Array<{ label: string; ratio: AspectRatio | null }> = [
  { label: t("media.imageEditor.free"), ratio: null },
  { label: "1:1", ratio: { width: 1, height: 1 } },
  { label: "4:5", ratio: { width: 4, height: 5 } },
  { label: "3:2", ratio: { width: 3, height: 2 } },
  { label: "16:9", ratio: { width: 16, height: 9 } },
];

function applyProfile(): void {
  const profile = state.value?.profile;
  altText.value = profile?.altText ?? "";
  title.value = profile?.title ?? "";
  caption.value = profile?.caption ?? "";
  credit.value = profile?.credit ?? "";
  copyright.value = profile?.copyright ?? "";
  profileFocalPoint.value = profile?.focalPoint ?? null;
}

function applyVariant(variant: MediaTransformVariant | null): void {
  variantId.value = variant?.id ?? null;
  variantName.value =
    variant?.name ?? t("media.imageEditor.defaultVariantName");
  crop.value = variant?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  aspectRatio.value = variant?.aspectRatio ?? { width: 16, height: 9 };
  outputWidth.value = String(variant?.output.width ?? 1600);
  outputHeight.value = String(variant?.output.height ?? 900);
  outputFormat.value = variant?.output.format ?? "auto";
  outputQuality.value = variant?.output.quality ?? 100;
  variantFocalPoint.value = variant?.focalPoint ?? null;
}

function selectOriginal(): void {
  draftVariantName.value = null;
  applyVariant(null);
  aspectRatio.value = null;
  isFocalMode.value = false;
  emitSelection();
}

function selectVariant(variant: MediaTransformVariant): void {
  draftVariantName.value = null;
  applyVariant(variant);
  isFocalMode.value = false;
  emitSelection();
}

function selectVariantById(id: string): void {
  const variant = state.value?.variants.find((item) => item.id === id);
  if (variant) selectVariant(variant);
}

function createNewVariant(name: string): void {
  if (!isTransformSupported.value) return;
  const trimmedName = name.trim();
  if (!trimmedName) return;

  applyVariant(null);
  draftVariantName.value = trimmedName;
  variantName.value = trimmedName;
  setRatio({ width: 16, height: 9 });
  isFocalMode.value = false;
  emitSelection();
}

function emitSelection(): void {
  emit("selectionChange", {
    variantId: variantId.value,
    draftName: draftVariantName.value,
  });
}

function emitVariants(): void {
  emit("variantsChange", state.value?.variants ?? []);
}

function handleQualityUpdate(value: number[] | undefined): void {
  const nextQuality = value?.[0];
  if (typeof nextQuality !== "number") return;
  outputQuality.value = Math.min(100, Math.max(1, Math.round(nextQuality)));
}

function setRatio(next: AspectRatio | null): void {
  aspectRatio.value = next;
  if (next && Number(outputWidth.value) > 0) {
    outputHeight.value = String(
      Math.round((Number(outputWidth.value) * next.height) / next.width),
    );
  }
  if (!next || !sourceDimensions.value) return;
  crop.value = createFocalAspectRatioCrop({
    source: sourceDimensions.value,
    aspectRatio: next,
    focalPoint: effectiveFocalPoint.value,
  });
}

function handleSourceDimensions(value: {
  width: number;
  height: number;
}): void {
  emit("sourceDimensions", value);
  const wasUnknown = sourceDimensions.value === null;
  sourceDimensions.value = value;
  if (wasUnknown && !selectedVariant.value && aspectRatio.value) {
    setRatio(aspectRatio.value);
  }
}

function handleFocalPointUpdate(value: MediaFocalPoint): void {
  if (hasActiveVariant.value) {
    variantFocalPoint.value = value;
  } else {
    profileFocalPoint.value = value;
  }
}

async function persistVariantWithOptions(
  options: { allowRebase?: boolean } = {},
): Promise<void> {
  if (isSelectedVariantStale.value && !options.allowRebase) {
    toast.error(t("media.imageEditor.rebaseRequired"));
    return;
  }
  try {
    const existing = selectedVariant.value;
    const saved = await saveVariant(
      {
        id: existing?.id ?? crypto.randomUUID(),
        assetPath: props.asset.url,
        name: variantName.value.trim() || t("media.imageEditor.customVariant"),
        sourceVersion: sourceVersion.value,
        crop: crop.value,
        focalPoint: variantFocalPoint.value,
        aspectRatio: aspectRatio.value,
        output: {
          width: Number(outputWidth.value) || null,
          height: Number(outputHeight.value) || null,
          format: outputFormat.value,
          quality: outputQuality.value,
        },
        expectedUpdatedAt: existing?.updatedAt ?? null,
      },
      { silent: true },
    );
    if (saved) {
      emitVariants();
      selectVariant(saved);
      const didSaveProfile = await persistProfile({ silent: true });
      if (!didSaveProfile) return;
      toast.success(t("media.imageEditor.variantSaved"));
    }
  } catch {
    // The composable owns user-facing error reporting.
  }
}

async function persistVariant(): Promise<void> {
  await persistVariantWithOptions();
}

async function rebaseSelectedVariant(): Promise<void> {
  if (!selectedVariant.value) return;
  if (aspectRatio.value && sourceDimensions.value) {
    setRatio(aspectRatio.value);
  }
  await persistVariantWithOptions({ allowRebase: true });
}

async function persistProfile(options?: {
  silent?: boolean;
}): Promise<boolean> {
  try {
    await saveProfile(
      {
        assetPath: props.asset.url,
        currentSourceVersion: sourceVersion.value,
        altText: altText.value.trim() || null,
        title: title.value.trim() || null,
        caption: caption.value.trim() || null,
        credit: credit.value.trim() || null,
        copyright: copyright.value.trim() || null,
        focalPoint: profileFocalPoint.value,
        expectedUpdatedAt: state.value?.profile?.updatedAt ?? null,
      },
      options,
    );
    return true;
  } catch {
    // The composable owns user-facing error reporting.
    return false;
  }
}

async function persistOriginal(): Promise<void> {
  const didSave = await persistProfile({ silent: true });
  if (didSave) toast.success(t("media.imageEditor.originalSaved"));
}

async function removeSelectedVariant(): Promise<void> {
  if (!selectedVariant.value) return;
  try {
    await deleteVariant(props.asset.url, selectedVariant.value.id);
    isDeleteCropDialogOpen.value = false;
    emitVariants();
    selectOriginal();
  } catch {
    // The composable owns user-facing error reporting.
  }
}

async function initialize(): Promise<void> {
  sourceDimensions.value = props.asset.dimensions ?? null;
  await load(props.asset.url);
  applyProfile();
  selectOriginal();
  emitVariants();
}

onMounted(initialize);
watch(() => props.asset.id, initialize);

defineExpose({
  selectOriginal,
  selectVariantById,
  createNewVariant,
  reload: initialize,
  getProfileUpdatedAt: () => state.value?.profile?.updatedAt ?? null,
});
</script>

<template>
  <div
    v-if="isLoading"
    class="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-border bg-background lg:col-span-2"
  >
    <span
      class="i-hugeicons:refresh size-5 animate-spin text-muted-foreground"
    />
  </div>

  <div v-else class="contents">
    <div
      v-if="!isTransformSupported"
      class="flex items-start gap-2.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-muted-foreground lg:col-span-2"
      role="status"
    >
      <span
        class="i-hugeicons:alert-02 mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <span>{{ t("media.transformTooLarge") }}</span>
    </div>

    <div class="grid overflow-hidden lg:contents">
      <div class="lg:col-start-1">
        <MediaCropCanvas
          v-model="crop"
          :src="sourcePreviewUrl"
          :alt="asset.name"
          :aspect-ratio="aspectRatio"
          :focal-point="effectiveFocalPoint"
          :focal-mode="isFocalMode"
          @source-dimensions="handleSourceDimensions"
          @update:focal-point="handleFocalPointUpdate"
        />
      </div>

      <aside class="space-y-5 p-5 lg:absolute lg:top-0 lg:right-0 lg:w-76">
        <div v-if="hasActiveVariant" class="space-y-5">
          <div
            v-if="isSelectedVariantStale"
            class="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-3"
          >
            <p class="text-xs leading-5 text-muted-foreground">
              {{ t("media.imageEditor.staleVariant") }}
            </p>
            <Button
              class="mt-3 w-full"
              size="sm"
              variant="outline"
              @click="rebaseSelectedVariant"
            >
              {{ t("media.imageEditor.rebaseVariant") }}
            </Button>
          </div>
          <div class="space-y-3">
            <Label for="media-variant-name">{{ t("media.variantName") }}</Label>
            <Input
              id="media-variant-name"
              v-model="variantName"
              maxlength="100"
            />
          </div>

          <div class="space-y-3">
            <Label>{{ t("media.imageEditor.aspectRatio") }}</Label>
            <div class="grid grid-cols-3 gap-2">
              <Button
                v-for="preset in ratioPresets"
                :key="preset.label"
                type="button"
                size="sm"
                :variant="
                  JSON.stringify(aspectRatio) === JSON.stringify(preset.ratio)
                    ? 'secondary'
                    : 'outline'
                "
                @click="setRatio(preset.ratio)"
                >{{ preset.label }}</Button
              >
            </div>
          </div>

          <div class="space-y-3">
            <Label>{{ t("media.imageEditor.focalPoint") }}</Label>
            <div
              class="overflow-hidden rounded-md border border-solid border-border/50 bg-card/40"
            >
              <div class="aspect-video overflow-hidden bg-muted/20">
                <img
                  :src="sourcePreviewUrl"
                  :alt="altText || asset.name"
                  class="h-full w-full object-cover"
                  :style="{ objectPosition: focalPreviewPosition }"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <Button
                type="button"
                size="sm"
                class="flex-1"
                :variant="isFocalMode ? 'secondary' : 'outline'"
                @click="isFocalMode = !isFocalMode"
              >
                {{
                  isFocalMode
                    ? t("media.imageEditor.clickImage")
                    : variantFocalPoint
                      ? t("media.imageEditor.adjustFocalPoint")
                      : t("media.imageEditor.setFocalPoint")
                }}
              </Button>
              <Button
                v-if="variantFocalPoint"
                type="button"
                size="sm"
                variant="outline"
                :aria-label="t('media.imageEditor.useOriginalFocalPoint')"
                @click="variantFocalPoint = null"
              >
                {{ t("media.imageEditor.useOriginal") }}
              </Button>
            </div>
            <p v-if="!variantFocalPoint" class="text-2xs text-muted-foreground">
              {{ t("media.imageEditor.usingOriginalFocalPoint") }}
            </p>
          </div>

          <div class="space-y-5">
            <div class="flex items-center gap-3">
              <Label for="media-output-width" class="w-16 shrink-0">{{
                t("media.imageEditor.width")
              }}</Label>
              <Input
                id="media-output-width"
                v-model="outputWidth"
                inputmode="numeric"
                class="flex-1"
              />
            </div>
            <div class="flex items-center gap-3">
              <Label for="media-output-height" class="w-16 shrink-0">{{
                t("media.imageEditor.height")
              }}</Label>
              <Input
                id="media-output-height"
                v-model="outputHeight"
                inputmode="numeric"
                class="flex-1"
              />
            </div>
            <div class="flex items-center gap-3">
              <Label for="media-output-format" class="w-16 shrink-0">{{
                t("media.imageEditor.format")
              }}</Label>
              <Select v-model="outputFormat" class="flex-1">
                <SelectTrigger id="media-output-format" class="flex-1"
                  ><SelectValue
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{{
                    t("media.imageEditor.auto")
                  }}</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="avif">AVIF</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex items-center gap-3">
              <Label for="media-output-quality" class="w-16 shrink-0">{{
                t("media.imageEditor.quality")
              }}</Label>
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <Slider
                  id="media-output-quality"
                  class="flex-1 py-2"
                  :model-value="[outputQuality]"
                  :min="1"
                  :max="100"
                  :step="1"
                  :aria-label="t('media.imageEditor.outputQuality')"
                  @update:model-value="handleQualityUpdate"
                />
                <output
                  for="media-output-quality"
                  class="w-9 shrink-0 text-right text-2xs tabular-nums text-muted-foreground"
                >
                  {{ outputQuality }}%
                </output>
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-1">
            <Button
              class="flex-1"
              :disabled="isSaving || !isTransformSupported"
              @click="persistVariant"
              ><span
                v-if="isSaving"
                class="i-hugeicons:refresh mr-1.5 size-3.5 animate-spin"
              />{{ t("media.saveVariant") }}</Button
            >
            <Button
              v-if="selectedVariant"
              variant="outline"
              :disabled="isSaving"
              :aria-label="t('media.deleteVariant')"
              @click="isDeleteCropDialogOpen = true"
              ><span class="i-hugeicons:delete-02 size-4"
            /></Button>
          </div>
        </div>

        <div v-else class="space-y-5">
          <div class="space-y-3">
            <Label>{{ t("media.imageEditor.defaultFocalPoint") }}</Label>
            <div
              class="overflow-hidden rounded-md border border-solid border-border/50 bg-card/40"
            >
              <div class="aspect-video overflow-hidden bg-muted/20">
                <img
                  :src="sourcePreviewUrl"
                  :alt="altText || asset.name"
                  class="h-full w-full object-cover"
                  :style="{ objectPosition: focalPreviewPosition }"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <Button
                type="button"
                size="sm"
                class="flex-1"
                :variant="isFocalMode ? 'secondary' : 'outline'"
                @click="isFocalMode = !isFocalMode"
              >
                {{
                  isFocalMode
                    ? t("media.imageEditor.clickImage")
                    : t("media.imageEditor.setDefaultFocalPoint")
                }}
              </Button>
              <Button
                v-if="profileFocalPoint"
                type="button"
                size="sm"
                variant="outline"
                :aria-label="t('media.imageEditor.clearDefaultFocalPoint')"
                @click="profileFocalPoint = null"
              >
                {{ t("media.imageEditor.clear") }}
              </Button>
            </div>
          </div>

          <Button class="w-full" :disabled="isSaving" @click="persistOriginal">
            <span
              v-if="isSaving"
              class="i-hugeicons:refresh mr-1.5 size-3.5 animate-spin"
            />
            {{ t("media.imageEditor.saveOriginal") }}
          </Button>
        </div>
      </aside>
    </div>

    <Collapsible
      v-model:open="isMetadataOpen"
      class="rounded-lg border border-dashed border-border bg-card/50 p-5 lg:col-start-1"
    >
      <CollapsibleTrigger as-child>
        <button
          type="button"
          class="flex w-full items-start justify-between gap-4 text-left"
        >
          <span>
            <span class="m-0 block text-sm font-semibold">{{
              t("media.imageEditor.imageMetadata")
            }}</span>
            <span class="mt-1 block text-xs text-muted-foreground text-balance">
              {{ t("media.imageEditor.imageMetadataDescription") }}
            </span>
          </span>
          <span
            :class="[
              studioIcons.chevronDown,
              'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
              isMetadataOpen ? 'rotate-180' : '',
            ]"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent class="pt-7">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2 md:col-span-2">
            <Label for="media-alt-text">{{
              t("media.imageEditor.alternativeText")
            }}</Label
            ><Textarea
              id="media-alt-text"
              v-model="altText"
              rows="2"
              :placeholder="t('media.imageEditor.alternativeTextPlaceholder')"
            />
          </div>
          <div class="space-y-2">
            <Label for="media-title">{{ t("media.imageEditor.title") }}</Label
            ><Input id="media-title" v-model="title" />
          </div>
          <div class="space-y-2">
            <Label for="media-credit">{{ t("media.imageEditor.credit") }}</Label
            ><Input id="media-credit" v-model="credit" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="media-caption">{{
              t("media.imageEditor.caption")
            }}</Label
            ><Textarea id="media-caption" v-model="caption" rows="2" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="media-copyright">{{
              t("media.imageEditor.copyright")
            }}</Label
            ><Input id="media-copyright" v-model="copyright" />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <DeleteConfirmDialog
      :open="isDeleteCropDialogOpen"
      :title="t('media.crop.deleteTitle')"
      :description="t('media.crop.deleteDescription')"
      :item-name="selectedVariant?.name"
      :is-loading="isSaving"
      :confirm-label="t('media.crop.deleteConfirm')"
      @update:open="isDeleteCropDialogOpen = $event"
      @confirm="removeSelectedVariant"
    />
  </div>
</template>
