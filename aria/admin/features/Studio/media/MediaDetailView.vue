<script setup lang="ts">
/**
 * MediaDetailView — Studio Media Detail Page Full detail page for
 * a single media asset. Shows preview, metadata, usage tracking.
 */

import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs, ErrorBoundary } from "@/features/Studio/core/components";
import StudioPanelShell from "@/features/Studio/core/components/StudioPanelShell.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import {
  formatFileSize,
  getAssetIcon,
  isFontAsset,
  getThumbnailUrl,
  handleThumbnailError,
} from "./utils";
import { useMediaAssets } from "./composables/useMediaAssets";
import { useMediaUsage } from "./composables/useMediaUsage";
import FontAssetPreview from "./components/FontAssetPreview.vue";
import MediaImageEditor from "./components/MediaImageEditor.vue";
import MediaVariantRail from "./components/MediaVariantRail.vue";
import DeleteMediaDialog from "./dialogs/DeleteMediaDialog.vue";
import RenameMediaDialog from "./dialogs/RenameMediaDialog.vue";
import ReplaceMediaSourceDialog from "./dialogs/ReplaceMediaSourceDialog.vue";
import { replaceMediaSourceFile } from "./composables/useMediaClient";
import type { MediaAsset } from "./types/media";
import type { MediaTransformVariant } from "../../../../lib/media/transforms/schemas";
import { useStudioI18n } from "@/i18n";
import { MEDIA_TRANSFORM_INPUT_MAX_BYTES } from "../../../../lib/media/uploadLimits";

interface MediaImageEditorPublic {
  selectOriginal: () => void;
  selectVariantById: (id: string) => void;
  createNewVariant: (name: string) => void;
  reload: () => Promise<void>;
  getProfileUpdatedAt: () => string | null;
}

interface MediaVariantRailPublic {
  startCreate: () => void;
}

const route = useRoute();
const router = useStudioRouter();
const { t } = useStudioI18n();

function assetTypeLabel(asset: MediaAsset): string {
  if (isFontAsset(asset)) return t("media.assetType.font");
  if (asset.type === "image") return t("media.assetType.image");
  if (asset.type === "video") return t("media.assetType.video");
  if (asset.type === "icon") return t("media.assetType.icon");
  return t("media.assetType.file");
}

const assetId = computed(() => route.params.id as string);
const mediaImageEditorRef = ref<MediaImageEditorPublic | null>(null);
const mediaVariantRailRef = ref<MediaVariantRailPublic | null>(null);
const variants = ref<readonly MediaTransformVariant[]>([]);
const selectedVariantId = ref<string | null>(null);
const draftVariantName = ref<string | null>(null);
const originalDimensions = ref<{ width: number; height: number } | null>(null);
const isDetailsOpen = ref(false);
const isUsageOpen = ref(false);
const isReplaceDialogOpen = ref(false);
const replacementFile = ref<File | null>(null);
const isReplacing = ref(false);
const sourceRevision = ref<string | number>(0);

watch(assetId, () => {
  variants.value = [];
  selectedVariantId.value = null;
  draftVariantName.value = null;
});

const {
  assets,
  isLoading,
  loadAssets,
  handleCopyUrl,
  handleDelete,
  closeDeleteDialog,
  confirmDelete,
  handleRename,
  closeRenameDialog,
  confirmRename,
  handleDuplicate,
  isRenameDialogOpen,
  assetToRename,
  renameInput,
  renameExtension,
  renameReferenceCount,
  isRenaming,
  isDeleteDialogOpen,
  assetToDelete,
  isDeleting,
} = useMediaAssets();

const asset = computed<MediaAsset | null>(() => {
  return assets.value.find((a: MediaAsset) => a.id === assetId.value) ?? null;
});

watch(
  () => asset.value?.id,
  () => {
    originalDimensions.value = asset.value?.dimensions ?? null;
  },
  { immediate: true },
);

const mediaBreadcrumbs = computed(() => [
  { label: t("media.sidebar.title"), href: "/media" },
  { label: asset.value?.name ?? t("media.detail.title") },
]);

const { selectedAssetUsages, isUsageLoading, ensureUsageComputed } =
  useMediaUsage(asset);

const previewUrl = computed(() => {
  if (!asset.value) return "";
  return asset.value.deliveryUrl || asset.value.url;
});

const isImageOrIcon = computed(() => {
  if (!asset.value) return false;
  return asset.value.type === "image" || asset.value.type === "icon";
});

const isEditableImage = computed(() => asset.value?.type === "image");
const isTransformSupported = computed(
  () => !asset.value || asset.value.size <= MEDIA_TRANSFORM_INPUT_MAX_BYTES,
);

const uploadedAtLabel = computed(() => {
  if (!asset.value?.uploadedAt) return t("media.unknown");
  try {
    return new Date(asset.value.uploadedAt).toLocaleString();
  } catch {
    return t("media.unknown");
  }
});

function handlePreviewError(event: Event): void {
  const img = event.target as HTMLImageElement | null;
  if (!img || !asset.value) return;

  if (img.dataset.previewFallbackAttempted === "true") return;

  const normalize = (value: string) => {
    try {
      return new URL(value, window.location.origin).href;
    } catch {
      return value;
    }
  };

  if (normalize(img.src) === normalize(asset.value.url)) return;

  img.dataset.previewFallbackAttempted = "true";
  img.src = asset.value.url;
}

function handleBack() {
  router.navigateTo("/media");
}

function onCopyUrl(a: MediaAsset): void {
  handleCopyUrl(a);
  toast.success(t("media.urlCopied"));
}

function onRename(a: MediaAsset) {
  handleRename(a);
}

function onDuplicate(a: MediaAsset) {
  handleDuplicate(a);
}

function onDelete(a: MediaAsset) {
  handleDelete(a);
}

function chooseReplacement(): void {
  if (!asset.value) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = asset.value.mimeType || "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    replacementFile.value = file;
    isReplaceDialogOpen.value = true;
  };
  input.click();
}

function closeReplaceDialog(): void {
  if (isReplacing.value) return;
  isReplaceDialogOpen.value = false;
  replacementFile.value = null;
}

async function confirmReplacement(): Promise<void> {
  if (!asset.value || !replacementFile.value || isReplacing.value) return;
  isReplacing.value = true;
  try {
    const result = await replaceMediaSourceFile({
      assetPath: asset.value.url,
      file: replacementFile.value,
      expectedUpdatedAt: mediaImageEditorRef.value?.getProfileUpdatedAt(),
    });
    sourceRevision.value = result.currentSourceVersion;
    await loadAssets({ force: true, silent: true });
    await mediaImageEditorRef.value?.reload();
    isReplaceDialogOpen.value = false;
    replacementFile.value = null;
    toast[result.status === "completed" ? "success" : "warning"](
      t(
        result.status === "completed"
          ? "media.replace.completed"
          : "media.replace.incomplete",
      ),
    );
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("media.uploadFailed"),
    );
  } finally {
    isReplacing.value = false;
  }
}

function openPreview(): void {
  if (!previewUrl.value) return;
  window.open(previewUrl.value, "_blank", "noopener,noreferrer");
}

function startNewVariant(): void {
  mediaVariantRailRef.value?.startCreate();
}

function selectOriginal(): void {
  mediaImageEditorRef.value?.selectOriginal();
}

function selectVariant(id: string): void {
  mediaImageEditorRef.value?.selectVariantById(id);
}

function createVariant(name: string): void {
  mediaImageEditorRef.value?.createNewVariant(name);
}

function handleVariantsChange(
  nextVariants: readonly MediaTransformVariant[],
): void {
  variants.value = nextVariants;
}

function handleSelectionChange(selection: {
  variantId: string | null;
  draftName: string | null;
}): void {
  selectedVariantId.value = selection.variantId;
  draftVariantName.value = selection.draftName;
}

function handleSourceDimensions(dimensions: {
  width: number;
  height: number;
}): void {
  originalDimensions.value = dimensions;
}

onMounted(async () => {
  await loadAssets();
  if (asset.value) {
    void ensureUsageComputed(asset.value);
  }
});
</script>

<template>
  <ErrorBoundary>
    <StudioPanelShell :variant="isEditableImage ? 'rail' : 'default'">
      <template #rail>
        <MediaVariantRail
          v-if="isEditableImage"
          ref="mediaVariantRailRef"
          :variants="variants"
          :selected-variant-id="selectedVariantId"
          :draft-variant-name="draftVariantName"
          :source-dimensions="originalDimensions"
          :can-create="isTransformSupported"
          @select-original="selectOriginal"
          @select-variant="selectVariant"
          @create-variant="createVariant"
        />
      </template>

      <div class="flex h-full min-h-0 flex-col bg-background">
        <!-- Header -->
        <header
          class="flex min-w-0 shrink-0 items-center justify-between bg-background px-3 pt-3"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <Button variant="bread" size="icon" @click="handleBack">
              <span :class="[studioIcons.chevronLeft, 'size-4']" />
            </Button>
            <Breadcrumbs :items="mediaBreadcrumbs" />
          </div>

          <div
            class="flex shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
          >
            <HeaderActionTooltip :label="t('media.previewAction')">
              <Button
                variant="headerAction"
                size="icon-header"
                :disabled="!asset"
                :aria-label="t('media.previewAction')"
                @click="openPreview"
              >
                <span :class="[studioIcons.eye, 'size-3.5 shrink-0']" />
              </Button>
            </HeaderActionTooltip>
            <HeaderActionTooltip :label="t('media.copyUrl')">
              <Button
                variant="headerAction"
                size="icon-header"
                :disabled="!asset"
                :aria-label="t('media.copyUrl')"
                @click="asset && onCopyUrl(asset)"
              >
                <span :class="[studioIcons.copy, 'size-3.5 shrink-0']" />
              </Button>
            </HeaderActionTooltip>
            <HeaderActionDropdownTooltip :label="t('media.moreActions')">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="headerAction"
                    size="icon-header"
                    :disabled="!asset"
                    :aria-label="t('media.moreActions')"
                  >
                    <span
                      :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-44">
                  <DropdownMenuItem
                    v-if="isEditableImage"
                    :disabled="!asset || isReplacing"
                    @select="chooseReplacement"
                  >
                    <span :class="[studioIcons.imageUpload, 'mr-2 size-3.5']" />
                    {{ t("media.replaceSource") }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="!asset"
                    @select="asset && onDuplicate(asset)"
                  >
                    <span :class="[studioIcons.duplicate, 'mr-2 size-3.5']" />
                    {{ t("media.duplicate") }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="!asset"
                    @select="asset && onRename(asset)"
                  >
                    <span :class="[studioIcons.edit, 'mr-2 size-3.5']" />
                    {{ t("media.rename") }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    :disabled="!asset"
                    @select="asset && onDelete(asset)"
                  >
                    <span :class="[studioIcons.trash, 'mr-2 size-3.5']" />
                    {{ t("common.delete") }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </HeaderActionDropdownTooltip>
            <Button
              v-if="isEditableImage"
              class="ml-2"
              variant="default"
              size="sm"
              :disabled="!asset || !isTransformSupported"
              :title="
                isTransformSupported ? undefined : t('media.transformTooLarge')
              "
              @click="startNewVariant"
            >
              <span :class="[studioIcons.add, 'mr-1.5 size-3.5']" />
              {{ t("media.newCrop") }}
            </Button>
          </div>
        </header>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto">
          <!-- Loading -->
          <div v-if="isLoading" class="flex items-center justify-center py-24">
            <div
              class="i-hugeicons:refresh size-6 text-muted-foreground animate-spin"
            />
          </div>

          <!-- Not Found -->
          <div
            v-else-if="!asset"
            class="flex flex-col items-center justify-center py-24 gap-3"
          >
            <div
              :class="[studioIcons.warning, 'size-8 text-muted-foreground']"
            />
            <p class="text-sm text-muted-foreground">
              {{ t("media.notFound") }}
            </p>
            <Button variant="outline" size="sm" @click="handleBack">
              {{ t("media.back") }}
            </Button>
          </div>

          <!-- Detail -->
          <div
            v-else
            class="relative mx-auto w-full px-7 py-6"
            :class="
              isEditableImage
                ? 'grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]'
                : 'max-w-4xl space-y-6'
            "
          >
            <!-- Preview -->
            <section v-if="!isEditableImage">
              <span
                class="mb-3 inline-block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {{ t("media.preview") }}
              </span>
              <div
                class="overflow-hidden rounded-lg border border-dashed border-border bg-card"
              >
                <div
                  class="flex aspect-video items-center justify-center bg-muted/30"
                >
                  <img
                    v-if="isImageOrIcon"
                    :key="previewUrl"
                    :src="previewUrl"
                    :alt="asset.name"
                    class="h-full w-full object-contain"
                    @error="handlePreviewError"
                  />
                  <FontAssetPreview
                    v-else-if="isFontAsset(asset)"
                    :asset="asset"
                    size="grid"
                  />
                  <div
                    v-else
                    class="flex flex-col items-center gap-2 text-muted-foreground"
                  >
                    <div :class="[getAssetIcon(asset.type), 'size-12']" />
                    <p class="text-sm">{{ t("media.previewUnavailable") }}</p>
                  </div>
                </div>
              </div>
            </section>

            <section v-else class="contents">
              <MediaImageEditor
                :key="`${asset.id}:${sourceRevision}`"
                ref="mediaImageEditorRef"
                :asset="asset"
                :source-revision="sourceRevision"
                @variants-change="handleVariantsChange"
                @selection-change="handleSelectionChange"
                @source-dimensions="handleSourceDimensions"
              />
            </section>

            <!-- Details -->
            <section class="lg:col-start-1">
              <Collapsible
                v-model:open="isDetailsOpen"
                class="rounded-lg border border-dashed border-border bg-card/50 p-5"
              >
                <CollapsibleTrigger as-child>
                  <button
                    type="button"
                    class="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold">
                        {{ t("media.details") }}
                      </span>
                      <span
                        class="mt-1 block truncate text-xs text-muted-foreground"
                      >
                        {{ asset.name }}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        size="sm"
                        class="bg-background/60 font-mono text-muted-foreground"
                      >
                        {{ asset.endpointId ?? "local-fs" }}
                      </Badge>
                      <span
                        :class="[
                          studioIcons.chevronDown,
                          'size-4 text-muted-foreground transition-transform',
                          isDetailsOpen ? 'rotate-180' : '',
                        ]"
                      />
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent class="pt-7">
                  <dl class="space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <dt
                        class="text-2xs uppercase tracking-wide text-muted-foreground"
                      >
                        {{ t("media.type") }}
                      </dt>
                      <dd class="text-sm font-medium text-foreground">
                        {{ assetTypeLabel(asset) }}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <dt
                        class="text-2xs uppercase tracking-wide text-muted-foreground"
                      >
                        {{ t("media.size") }}
                      </dt>
                      <dd class="text-sm font-medium text-foreground">
                        {{ formatFileSize(asset.size) }}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <dt
                        class="text-2xs uppercase tracking-wide text-muted-foreground"
                      >
                        {{ t("media.dimensions") }}
                      </dt>
                      <dd class="text-sm font-medium text-foreground">
                        {{
                          originalDimensions
                            ? `${originalDimensions.width} × ${originalDimensions.height}`
                            : "—"
                        }}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                      <dt
                        class="text-2xs uppercase tracking-wide text-muted-foreground"
                      >
                        {{ t("media.uploaded") }}
                      </dt>
                      <dd
                        class="truncate text-right text-sm font-medium text-foreground"
                      >
                        {{ uploadedAtLabel }}
                      </dd>
                    </div>
                  </dl>

                  <div class="mt-5 flex min-w-0 items-center gap-3">
                    <code
                      class="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground"
                      :title="asset.url"
                    >
                      {{ asset.url }}
                    </code>
                    <Button
                      variant="ghost-outline"
                      size="icon-sm"
                      class="shrink-0"
                      :aria-label="t('media.copyUrl')"
                      :title="t('media.copyUrl')"
                      @click="onCopyUrl(asset)"
                    >
                      <span :class="[studioIcons.copy, 'size-3.5']" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            <!-- Usage -->
            <section class="lg:col-start-1">
              <Collapsible
                v-model:open="isUsageOpen"
                class="rounded-lg border border-dashed border-border bg-card/50 p-5"
              >
                <CollapsibleTrigger as-child>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <span class="text-sm font-semibold">{{
                      t("media.usedIn")
                    }}</span>
                    <span
                      :class="[
                        studioIcons.chevronDown,
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        isUsageOpen ? 'rotate-180' : '',
                      ]"
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent class="pt-7">
                  <div
                    v-if="isUsageLoading"
                    class="flex items-center gap-2 py-2"
                  >
                    <Skeleton class="h-4 w-32 rounded bg-foreground/8" />
                  </div>
                  <div
                    v-else-if="selectedAssetUsages.length === 0"
                    class="py-2 text-sm text-muted-foreground"
                  >
                    {{ t("media.unused") }}
                  </div>
                  <ul v-else class="space-y-2">
                    <li
                      v-for="usage in selectedAssetUsages"
                      :key="`${usage.kind}-${usage.id}`"
                      class="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2"
                    >
                      <Badge
                        variant="secondary"
                        class="text-2xs shrink-0 capitalize"
                      >
                        {{ usage.kind }}
                      </Badge>
                      <span
                        class="min-w-0 flex-1 truncate text-sm text-foreground"
                      >
                        {{ usage.title }}
                      </span>
                      <span class="shrink-0 text-2xs text-muted-foreground">
                        {{ usage.path }}
                      </span>
                    </li>
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </section>
          </div>
        </div>
      </div>
    </StudioPanelShell>

    <!-- Dialogs -->
    <DeleteMediaDialog
      :open="isDeleteDialogOpen"
      :asset-name="assetToDelete?.name"
      :is-deleting="isDeleting"
      @update:open="(open: boolean) => !open && closeDeleteDialog()"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />

    <RenameMediaDialog
      :open="isRenameDialogOpen"
      :asset-name="assetToRename?.name"
      :extension="renameExtension"
      :reference-count="renameReferenceCount"
      :is-renaming="isRenaming"
      :model-value="renameInput"
      @update:open="(open: boolean) => !open && closeRenameDialog()"
      @update:model-value="(val: string) => (renameInput = val)"
      @cancel="closeRenameDialog"
      @confirm="confirmRename"
    />

    <ReplaceMediaSourceDialog
      :open="isReplaceDialogOpen"
      :asset-name="asset?.name"
      :file-name="replacementFile?.name"
      :variant-count="variants.length"
      :is-replacing="isReplacing"
      @update:open="(open: boolean) => !open && closeReplaceDialog()"
      @cancel="closeReplaceDialog"
      @confirm="confirmReplacement"
    />
  </ErrorBoundary>
</template>
