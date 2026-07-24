<script setup lang="ts">
/**
 * SeoDialog - Edit SEO metadata for a page A focused dialog for
 * managing page SEO settings: - Meta title with character count - Meta.
 */
import { ref, computed, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSeoAnalysis, type SeoData } from "../composables";

// PROPS & EMITS

interface Props {
  open: boolean;
  pageSlug: string;
  pageTitle: string;
  /** Optional: focus a specific field when dialog opens */
  focusField?: keyof SeoData;
}

const props = withDefaults(defineProps<Props>(), {
  focusField: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

// COMPOSABLE (shared state with SeoAnalysisPanel)

const {
  seoData: sharedSeoData,
  isLoading: sharedIsLoading,
  isSaving,
  error,
  save: saveToServer,
  refresh,
} = useSeoAnalysis(computed(() => props.pageSlug));

// LOCAL FORM STATE (for editing without affecting shared state until save)

const showAdvanced = ref(false);

// Form fields - copied from composable on open
const title = ref("");
const description = ref("");
const keywords = ref<string[]>([]);
const keywordInput = ref("");
const ogImage = ref("");
const canonical = ref("");
const noIndex = ref(false);
const noFollow = ref(false);

// COMPUTED (local for live preview as user types)

const titleLength = computed(() => title.value.length);
const titleStatus = computed(() => {
  if (titleLength.value === 0)
    return {
      color: "text-muted-foreground",
      hint: "Recommended: 30-60 characters",
    };
  if (titleLength.value < 30)
    return {
      color: "text-amber-500",
      hint: `${titleLength.value}/60 — Too short`,
    };
  if (titleLength.value > 60)
    return {
      color: "text-red-500",
      hint: `${titleLength.value}/60 — Too long`,
    };
  return {
    color: "text-emerald-500",
    hint: `${titleLength.value}/60 — Perfect!`,
  };
});

const descLength = computed(() => description.value.length);
const descStatus = computed(() => {
  if (descLength.value === 0)
    return {
      color: "text-muted-foreground",
      hint: "Recommended: 120-160 characters",
    };
  if (descLength.value < 120)
    return {
      color: "text-amber-500",
      hint: `${descLength.value}/160 — Too short`,
    };
  if (descLength.value > 160)
    return {
      color: "text-red-500",
      hint: `${descLength.value}/160 — Too long`,
    };
  return {
    color: "text-emerald-500",
    hint: `${descLength.value}/160 — Perfect!`,
  };
});

const seoScore = computed(() => {
  let score = 0;
  if (title.value && titleLength.value >= 30 && titleLength.value <= 60)
    score += 25;
  else if (title.value) score += 15;
  if (description.value && descLength.value >= 120 && descLength.value <= 160)
    score += 25;
  else if (description.value) score += 15;
  if (keywords.value.length >= 3) score += 15;
  else if (keywords.value.length > 0) score += 10;
  if (ogImage.value) score += 20;
  if (canonical.value) score += 15;
  return Math.min(score, 100);
});

function addKeyword() {
  const kw = keywordInput.value.trim().toLowerCase();
  if (kw && !keywords.value.includes(kw)) {
    keywords.value.push(kw);
  }
  keywordInput.value = "";
}

function removeKeyword(index: number) {
  keywords.value.splice(index, 1);
}

function handleKeywordKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addKeyword();
  }
  if (
    e.key === "Backspace" &&
    !keywordInput.value &&
    keywords.value.length > 0
  ) {
    keywords.value.pop();
  }
}

async function handleSave() {
  // Update shared state from local form
  sharedSeoData.value = {
    title: title.value || undefined,
    description: description.value || undefined,
    keywords: keywords.value.length > 0 ? [...keywords.value] : undefined,
    ogImage: ogImage.value || undefined,
    canonical: canonical.value || undefined,
    noIndex: noIndex.value,
    noFollow: noFollow.value,
  };

  // Save using composable (updates shared state and persists)
  const success = await saveToServer();

  if (success) {
    emit("saved");
    emit("update:open", false);
  }
}

/** Copy shared state to local form fields */
function syncFromShared() {
  const seo = sharedSeoData.value;
  title.value = seo.title || "";
  description.value = seo.description || "";
  keywords.value = seo.keywords ? [...seo.keywords] : [];
  ogImage.value = seo.ogImage || "";
  canonical.value = seo.canonical || "";
  noIndex.value = seo.noIndex || false;
  noFollow.value = seo.noFollow || false;
}

function handleOpenChange(value: boolean) {
  emit("update:open", value);
}

function handleCancel() {
  emit("update:open", false);
}

// Initialize form when dialog opens
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      error.value = null;
      showAdvanced.value = false;

      // If shared data already loaded, use it; otherwise wait for load
      if (
        !sharedIsLoading.value &&
        Object.keys(sharedSeoData.value).length > 0
      ) {
        syncFromShared();
      } else {
        // Data not loaded yet, refresh and wait
        await refresh();
        syncFromShared();
      }

      // Focus the requested field if specified
      // Note: actual focus would need nextTick and refs to input elements
    }
  },
  { immediate: true },
);

// Sync when shared data loads (in case refresh happens after watch runs)
watch(sharedIsLoading, (loading) => {
  if (!loading && props.open) {
    syncFromShared();
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="sm:max-w-[540px] p-1.5 gap-0 overflow-hidden bg-background"
    >
      <div class="bg-background rounded-lg">
        <!-- Header -->
        <DialogHeader
          class="px-7 pt-1 pb-2 border-b border-dashed border-border"
        >
          <div class="flex items-center gap-4">
            <div
              class="mt-1 w-8 h-8 rounded-sm bg-primary flex items-center justify-center shrink-0"
            >
              <div
                class="i-hugeicons:search-01 w-5 h-5 text-primary-foreground"
              />
            </div>
            <div>
              <DialogTitle class="font-serif text-lg text-foreground leading-0"
                >SEO Settings</DialogTitle
              >
              <DialogDescription
                class="text-2xs text-muted-foreground leading-0"
              >
                {{ pageTitle }}
              </DialogDescription>
            </div>
            <div class="ml-auto pr-4 flex items-center gap-2">
              <span class="text-sm text-muted-foreground">Score:</span>
              <span
                class="text-sm font-semibold tabular-nums"
                :class="
                  seoScore >= 80
                    ? 'text-emerald-500'
                    : seoScore >= 50
                      ? 'text-amber-500'
                      : 'text-red-500'
                "
              >
                {{ seoScore }}%
              </span>
            </div>
          </div>
        </DialogHeader>

        <!-- Content -->
        <div class="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          <!-- Loading -->
          <div v-if="sharedIsLoading" class="py-8 text-center">
            <div
              class="i-hugeicons:refresh w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2"
            />
            <p class="text-sm text-muted-foreground">Loading SEO data...</p>
          </div>

          <template v-else>
            <!-- Error -->
            <div
              v-if="error"
              class="p-3 rounded-sm bg-destructive/10 border border-destructive/20 text-sm text-destructive"
            >
              {{ error }}
            </div>

            <!-- Meta Title -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label class="font-serif">Meta Title</Label>
                <span :class="['text-2xs', titleStatus.color]">{{
                  titleStatus.hint
                }}</span>
              </div>
              <Input
                v-model="title"
                placeholder="Page title shown in search results"
                maxlength="70"
              />
            </div>

            <!-- Meta Description -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label class="font-serif">Meta Description</Label>
                <span :class="['text-2xs', descStatus.color]">{{
                  descStatus.hint
                }}</span>
              </div>
              <Textarea
                v-model="description"
                placeholder="Describe what this page is about in 1-2 sentences..."
                rows="3"
                maxlength="180"
                class="resize-none"
              />
            </div>

            <!-- Keywords -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label class="font-serif">Keywords</Label>
                <span class="text-2xs text-muted-foreground"
                  >{{ keywords.length }} tags</span
                >
              </div>
              <div
                class="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-sm border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
              >
                <Badge
                  v-for="(kw, i) in keywords"
                  :key="i"
                  variant="secondary"
                  class="text-xs px-2 py-0.5 gap-1"
                >
                  {{ kw }}
                  <button
                    @click="removeKeyword(i)"
                    class="hover:text-destructive"
                  >
                    <div class="i-hugeicons:cancel-circle w-3 h-3" />
                  </button>
                </Badge>
                <input
                  v-model="keywordInput"
                  @keydown="handleKeywordKeydown"
                  @blur="addKeyword"
                  placeholder="Add keyword..."
                  class="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p class="text-2xs text-muted-foreground">
                Press Enter or comma to add. Aim for 3-5 keywords.
              </p>
            </div>

            <!-- OG Image -->
            <div class="space-y-2">
              <Label class="font-serif">Social Image</Label>
              <div class="flex gap-2">
                <Input
                  v-model="ogImage"
                  placeholder="https://... or /uploads/image.jpg"
                  class="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  disabled
                  title="Media picker coming soon"
                >
                  <div class="i-hugeicons:image-add-01 w-4 h-4" />
                </Button>
              </div>
              <p class="text-2xs text-muted-foreground">
                Displayed when shared on social media. Recommended: 1200×630px
              </p>
            </div>

            <!-- Advanced Section -->
            <div class="border-t border-dashed border-border pt-4 -mx-6 px-6">
              <button
                @click="showAdvanced = !showAdvanced"
                class="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span class="flex items-center gap-2">
                  <div class="i-hugeicons:settings-01 w-4 h-4" />
                  Advanced Settings
                </span>
                <div
                  :class="[
                    'w-4 h-4 transition-transform duration-200',
                    showAdvanced ? 'rotate-180' : '',
                  ]"
                  class="i-hugeicons:arrow-down-01"
                />
              </button>

              <div v-if="showAdvanced" class="mt-4 space-y-4">
                <!-- Canonical URL -->
                <div class="space-y-2">
                  <Label class="font-serif text-sm">Canonical URL</Label>
                  <Input
                    v-model="canonical"
                    placeholder="https://yoursite.com/original-page"
                  />
                  <p class="text-2xs text-muted-foreground">
                    Prevents duplicate content issues. Leave blank to use page
                    URL.
                  </p>
                </div>

                <!-- Indexing Options -->
                <div class="space-y-3">
                  <Label class="font-serif text-sm"
                    >Search Engine Indexing</Label
                  >
                  <div class="space-y-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        v-model="noIndex"
                        class="rounded border-border"
                      />
                      <span class="text-sm">No Index</span>
                      <span class="text-2xs text-muted-foreground"
                        >— Hide from search results</span
                      >
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        v-model="noFollow"
                        class="rounded border-border"
                      />
                      <span class="text-sm">No Follow</span>
                      <span class="text-2xs text-muted-foreground"
                        >— Don't follow links on this page</span
                      >
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <DialogFooter
          class="p-6 pt-4 border-t border-dashed border-border bg-muted/30"
        >
          <Button
            variant="outline"
            @click="handleCancel"
            :disabled="isSaving || sharedIsLoading"
          >
            Cancel
          </Button>
          <Button @click="handleSave" :disabled="isSaving || sharedIsLoading">
            <div
              v-if="isSaving"
              class="i-hugeicons:refresh w-4 h-4 animate-spin mr-2"
            />
            {{ isSaving ? "Saving..." : "Save SEO" }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
