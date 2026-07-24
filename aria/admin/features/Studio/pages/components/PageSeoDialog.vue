<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";

interface Props {
  open: boolean;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:metaTitle": [value: string];
  "update:metaDescription": [value: string];
  "update:keywords": [value: string[]];
  "update:ogImage": [value: string];
  "update:ogTitle": [value: string];
  "update:ogDescription": [value: string];
  "update:canonical": [value: string];
  "update:noindex": [value: boolean];
  "update:nofollow": [value: boolean];
  save: [];
}>();

const metaTitle = ref(props.metaTitle ?? "");
const metaDescription = ref(props.metaDescription ?? "");
const keywords = ref<string[]>(props.keywords ?? []);
const keywordInput = ref("");
const ogImage = ref(props.ogImage ?? "");
const ogTitle = ref(props.ogTitle ?? "");
const ogDescription = ref(props.ogDescription ?? "");
const canonical = ref(props.canonical ?? "");
const noindex = ref(props.noindex ?? false);
const nofollow = ref(props.nofollow ?? false);
const showAdvanced = ref(false);
const isMediaPickerOpen = ref(false);

watch(
  () => props.open,
  () => {
    if (props.open) {
      metaTitle.value = props.metaTitle ?? "";
      metaDescription.value = props.metaDescription ?? "";
      keywords.value = props.keywords ? [...props.keywords] : [];
      ogImage.value = props.ogImage ?? "";
      ogTitle.value = props.ogTitle ?? "";
      ogDescription.value = props.ogDescription ?? "";
      canonical.value = props.canonical ?? "";
      noindex.value = props.noindex ?? false;
      nofollow.value = props.nofollow ?? false;
      showAdvanced.value = false;
    }
  },
);

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

const titleStatus = computed(() => {
  const len = metaTitle.value.length;
  if (len === 0) return { hint: "", color: "text-muted-foreground" };
  if (len <= 60) return { hint: `${len}/70 · Good`, color: "text-emerald-500" };
  if (len <= 70) return { hint: `${len}/70 · OK`, color: "text-amber-500" };
  return { hint: `${len}/70 · Too long`, color: "text-destructive" };
});

const descStatus = computed(() => {
  const len = metaDescription.value.length;
  if (len === 0) return { hint: "", color: "text-muted-foreground" };
  if (len <= 160)
    return { hint: `${len}/180 · Good`, color: "text-emerald-500" };
  if (len <= 180) return { hint: `${len}/180 · OK`, color: "text-amber-500" };
  return { hint: `${len}/180 · Too long`, color: "text-destructive" };
});

function handleMediaSelect(asset: MediaAsset) {
  ogImage.value = asset.url;
  isMediaPickerOpen.value = false;
}

function handleSave() {
  emit("update:metaTitle", metaTitle.value);
  emit("update:metaDescription", metaDescription.value);
  emit("update:keywords", keywords.value);
  emit("update:ogImage", ogImage.value);
  emit("update:ogTitle", ogTitle.value);
  emit("update:ogDescription", ogDescription.value);
  emit("update:canonical", canonical.value);
  emit("update:noindex", noindex.value);
  emit("update:nofollow", nofollow.value);
  emit("save");
}
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>SEO Settings</DialogTitle>
        <DialogDescription>
          Configure search engine optimization for this page.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- Meta Title -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label for="seo-meta-title">Meta Title</Label>
            <span :class="['text-2xs', titleStatus.color]">{{
              titleStatus.hint
            }}</span>
          </div>
          <Input
            id="seo-meta-title"
            v-model="metaTitle"
            placeholder="Page title shown in search results"
            maxlength="70"
          />
        </div>

        <Separator />

        <!-- Meta Description -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label for="seo-meta-description">Meta Description</Label>
            <span :class="['text-2xs', descStatus.color]">{{
              descStatus.hint
            }}</span>
          </div>
          <Textarea
            id="seo-meta-description"
            v-model="metaDescription"
            placeholder="Describe what this page is about in 1-2 sentences..."
            rows="3"
            maxlength="180"
            class="resize-none"
          />
        </div>

        <Separator />

        <!-- Keywords -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>Keywords</Label>
            <span class="text-2xs text-muted-foreground"
              >{{ keywords.length }} tags</span
            >
          </div>
          <div
            class="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
          >
            <Badge
              v-for="(kw, i) in keywords"
              :key="i"
              variant="secondary"
              class="text-xs px-2 py-0.5 gap-1"
            >
              {{ kw }}
              <button
                type="button"
                class="hover:text-destructive"
                @click="removeKeyword(i)"
              >
                <span class="i-hugeicons:cancel-01 size-3" />
              </button>
            </Badge>
            <input
              v-model="keywordInput"
              placeholder="Add keyword..."
              class="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              @keydown="handleKeywordKeydown"
              @blur="addKeyword"
            />
          </div>
          <p class="text-2xs text-muted-foreground">
            Press Enter or comma to add. Aim for 3-5 keywords.
          </p>
        </div>

        <Separator />

        <!-- OG -->
        <div class="space-y-3">
          <h4
            class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Social sharing
          </h4>
          <div class="space-y-2">
            <Label for="seo-og-image">Image URL</Label>
            <div class="flex gap-2">
              <Input
                id="seo-og-image"
                v-model="ogImage"
                placeholder="https://... or /uploads/image.jpg"
                class="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                class="size-9 shrink-0"
                title="Pick from media library"
                @click="isMediaPickerOpen = true"
              >
                <span class="i-hugeicons:image-01 size-4" />
              </Button>
            </div>
            <p class="text-2xs text-muted-foreground">1200×630px recommended</p>
          </div>
          <div class="space-y-2">
            <Label for="seo-og-title">Title</Label>
            <Input
              id="seo-og-title"
              v-model="ogTitle"
              placeholder="Title for social sharing"
            />
          </div>
          <div class="space-y-2">
            <Label for="seo-og-description">Description</Label>
            <Textarea
              id="seo-og-description"
              v-model="ogDescription"
              placeholder="Description for social sharing"
              rows="2"
              class="resize-none"
            />
          </div>
        </div>

        <Separator />

        <!-- Advanced -->
        <div class="border-t border-dashed border-border pt-4 -mx-6 px-6">
          <button
            type="button"
            class="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
            @click="showAdvanced = !showAdvanced"
          >
            <span class="flex items-center gap-2">
              <span class="i-hugeicons:settings-01 size-4" />
              Advanced Settings
            </span>
            <span
              class="i-hugeicons:chevronDown size-4 transition-transform duration-200"
              :class="showAdvanced ? 'rotate-180' : ''"
            />
          </button>

          <div v-if="showAdvanced" class="mt-4 space-y-4">
            <!-- Canonical URL -->
            <div class="space-y-2">
              <Label for="seo-canonical">Canonical URL</Label>
              <Input
                id="seo-canonical"
                v-model="canonical"
                placeholder="https://yoursite.com/original-page"
              />
              <p class="text-2xs text-muted-foreground">
                Prevents duplicate content issues. Leave blank for auto.
              </p>
            </div>

            <!-- Indexing -->
            <div class="space-y-3">
              <Label class="text-sm">Search Engine Indexing</Label>
              <div class="space-y-3">
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="noindex"
                    class="size-4 rounded border-border accent-primary"
                  />
                  <div>
                    <span class="text-sm font-medium">No Index</span>
                    <p class="text-2xs text-muted-foreground">
                      Hide from search results
                    </p>
                  </div>
                </label>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="nofollow"
                    class="size-4 rounded border-border accent-primary"
                  />
                  <div>
                    <span class="text-sm font-medium">No Follow</span>
                    <p class="text-2xs text-muted-foreground">
                      Don't follow links on this page
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MediaPickerDialog
        v-model:open="isMediaPickerOpen"
        @select="handleMediaSelect"
      />

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)"
          >Cancel</Button
        >
        <Button @click="handleSave">Save SEO Settings</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
