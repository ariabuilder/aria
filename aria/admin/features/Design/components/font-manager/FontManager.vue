<script setup lang="ts">
/**
 * FontManager - Font Management Interface a tabbed interface for managing
 * all font sources: - System fonts (built-in) - Google Fonts.
 */
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { toast } from "vue-sonner";
import { log } from "@/lib/utils/logger";
import { actions } from "astro:actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TYPOGRAPHY_FONTS_UPDATED_EVENT } from "../../composables/useTypography";
import {
  CustomFontActionSuccessSchema,
  EnabledGoogleFontActionSuccessSchema,
  FontConfigActionSuccessSchema,
  FontMutationActionSuccessSchema,
  GoogleFontListActionSuccessSchema,
  type CustomFontRecord,
  type EnabledGoogleFontRecord,
  type GoogleFontRecord,
  unwrapFontActionResult,
} from "../../composables/typographyActionResults";

type CustomFont = CustomFontRecord;
type GoogleFont = GoogleFontRecord;
type EnabledGoogleFont = EnabledGoogleFontRecord;

type RenameCustomFontAction = (input: {
  fontId: string;
  name: string;
}) => Promise<{
  data?: unknown;
  error?: {
    message?: string;
  } | null;
}>;

type FontTab = "system" | "google" | "custom";

const activeTab = ref<FontTab>("system");
const isLoading = ref(false);
const isSaving = ref(false);

const customFonts = ref<CustomFont[]>([]);
const isUploading = ref(false);
const dragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const editingFontId = ref<string | null>(null);
const editingFontName = ref("");
const isRenaming = ref<string | null>(null);
const renameCustomFontAction = (
  actions.fonts as typeof actions.fonts & {
    renameCustom: RenameCustomFontAction;
  }
).renameCustom;

const googleFonts = ref<GoogleFont[]>([]);
const enabledGoogleFonts = ref<EnabledGoogleFont[]>([]);
const googleFontSearch = ref("");
const googleFontCategory = ref<
  "all" | "sans-serif" | "serif" | "display" | "monospace"
>("all");
const isEnabling = ref<string | null>(null);

const enabledFontIds = computed(() => {
  return new Set(enabledGoogleFonts.value.map((f) => f.id));
});

const filteredGoogleFonts = computed(() => {
  let filtered = googleFonts.value;

  if (googleFontSearch.value) {
    const search = googleFontSearch.value.toLowerCase();
    filtered = filtered.filter((font) =>
      font.family.toLowerCase().includes(search),
    );
  }

  if (googleFontCategory.value !== "all") {
    filtered = filtered.filter(
      (font) => font.category === googleFontCategory.value,
    );
  }

  // Sort enabled fonts to top
  filtered.sort((a, b) => {
    const aEnabled = isGoogleFontEnabled(a) ? 0 : 1;
    const bEnabled = isGoogleFontEnabled(b) ? 0 : 1;
    return aEnabled - bEnabled;
  });

  return filtered.slice(0, 50);
});

onMounted(async () => {
  isLoading.value = true;
  try {
    await Promise.all([loadCustomFonts(), loadGoogleFonts()]);
  } finally {
    isLoading.value = false;
  }

  window.addEventListener(TYPOGRAPHY_FONTS_UPDATED_EVENT, handleFontsUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener(
    TYPOGRAPHY_FONTS_UPDATED_EVENT,
    handleFontsUpdated,
  );
});

async function loadCustomFonts() {
  const result = unwrapFontActionResult(
    await actions.fonts.getConfig({}),
    FontConfigActionSuccessSchema,
    "Failed to load custom fonts",
    {
      source: "FontManager.loadCustomFonts",
    },
  );

  if (!result.success) {
    return;
  }

  customFonts.value = result.data.data.customFonts;
  enabledGoogleFonts.value = result.data.data.enabledGoogleFonts;
}

async function handleFontsUpdated() {
  await loadCustomFonts();
}

async function loadGoogleFonts() {
  const result = unwrapFontActionResult(
    await actions.fonts.listGoogle({}),
    GoogleFontListActionSuccessSchema,
    "Failed to load Google Fonts",
    {
      source: "FontManager.loadGoogleFonts",
    },
  );

  if (!result.success) {
    return;
  }

  googleFonts.value = result.data.fonts;
}

function notifyFontLibraryUpdated() {
  window.dispatchEvent(new Event(TYPOGRAPHY_FONTS_UPDATED_EVENT));
}

function getCustomFontFormatLabel(font: CustomFont): string {
  const rawFormat = font.format || font.formats?.[0]?.format || "unknown";

  switch (rawFormat.toLowerCase()) {
    case "truetype":
      return "TTF";
    case "opentype":
      return "OTF";
    case "embedded-opentype":
      return "EOT";
    default:
      return rawFormat.toUpperCase();
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) {
    uploadFont(input.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  dragOver.value = false;

  if (event.dataTransfer?.files?.length) {
    uploadFont(event.dataTransfer.files[0]);
  }
}

async function uploadFont(file: File) {
  const validExtensions = ["woff2", "woff", "ttf", "otf", "eot"];
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!validExtensions.includes(extension || "")) {
    toast.error(`Invalid file type. Use: ${validExtensions.join(", ")}`);
    return;
  }

  isUploading.value = true;

  try {
    const formData = new FormData();
    formData.append("file", file);

    const result = unwrapFontActionResult(
      await actions.fonts.uploadCustom(formData),
      CustomFontActionSuccessSchema,
      "Failed to upload font",
      {
        source: "FontManager.uploadFont",
        fileName: file.name,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    customFonts.value.push(result.data.font);
    notifyFontLibraryUpdated();
    toast.success(`Uploaded ${file.name}`);
  } catch (error) {
    log("error", "[FontManager] Upload failed", { error });
    toast.error("Failed to upload font");
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
  }
}

async function deleteCustomFont(fontId: string) {
  try {
    const result = unwrapFontActionResult(
      await actions.fonts.deleteCustom({ fontId }),
      FontMutationActionSuccessSchema,
      "Failed to delete font",
      {
        source: "FontManager.deleteCustomFont",
        fontId,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    customFonts.value = customFonts.value.filter((f) => f.id !== fontId);
    if (editingFontId.value === fontId) {
      cancelRenaming();
    }
    notifyFontLibraryUpdated();
    toast.success("Font deleted");
  } catch (error) {
    log("error", "[FontManager] Delete failed", { error });
    toast.error("Failed to delete font");
  }
}

function startRenaming(font: CustomFont) {
  editingFontId.value = font.id;
  editingFontName.value = font.name;
}

function cancelRenaming() {
  editingFontId.value = null;
  editingFontName.value = "";
  isRenaming.value = null;
}

async function renameCustomFont(font: CustomFont) {
  const nextName = editingFontName.value.trim();

  if (!nextName) {
    toast.error("Font name is required");
    return;
  }

  if (nextName === font.name) {
    cancelRenaming();
    return;
  }

  isRenaming.value = font.id;

  try {
    const result = await renameCustomFontAction({
      fontId: font.id,
      name: nextName,
    });

    const parsedResult = unwrapFontActionResult(
      result,
      CustomFontActionSuccessSchema,
      "Failed to rename font",
      {
        source: "FontManager.renameCustomFont",
        fontId: font.id,
      },
    );

    if (!parsedResult.success) {
      toast.error(parsedResult.error);
      isRenaming.value = null;
      return;
    }

    customFonts.value = customFonts.value.map((item) =>
      item.id === font.id ? parsedResult.data.font : item,
    );
    cancelRenaming();
    notifyFontLibraryUpdated();
    toast.success("Font renamed");
  } catch (error) {
    log("error", "[FontManager] Rename failed", { error });
    toast.error("Failed to rename font");
    isRenaming.value = null;
  }
}

function getGoogleFontId(font: GoogleFont): string {
  return `google-${font.family.toLowerCase().replace(/\s+/g, "-")}`;
}

function isGoogleFontEnabled(font: GoogleFont): boolean {
  return enabledFontIds.value.has(getGoogleFontId(font));
}

async function enableGoogleFont(font: GoogleFont) {
  const fontId = getGoogleFontId(font);
  isEnabling.value = fontId;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.enableGoogle({
        family: font.family,
        variants: font.variants.slice(0, 4),
      }),
      EnabledGoogleFontActionSuccessSchema,
      "Failed to enable font",
      {
        source: "FontManager.enableGoogleFont",
        family: font.family,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    enabledGoogleFonts.value.push(result.data.font);
    notifyFontLibraryUpdated();
    toast.success(`${font.family} enabled`);
  } catch (error) {
    log("error", "[FontManager] Enable failed", { error });
    toast.error("Failed to enable font");
  } finally {
    isEnabling.value = null;
  }
}

async function disableGoogleFont(fontId: string) {
  isEnabling.value = fontId;

  try {
    const result = unwrapFontActionResult(
      await actions.fonts.disableGoogle({ fontId }),
      FontMutationActionSuccessSchema,
      "Failed to disable font",
      {
        source: "FontManager.disableGoogleFont",
        fontId,
      },
    );

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    enabledGoogleFonts.value = enabledGoogleFonts.value.filter(
      (f) => f.id !== fontId,
    );
    notifyFontLibraryUpdated();
    toast.success("Font disabled");
  } catch (error) {
    log("error", "[FontManager] Disable failed", { error });
    toast.error("Failed to disable font");
  } finally {
    isEnabling.value = null;
  }
}
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button variant="outline" size="sm">
        <div class="i-hugeicons:library mr-1.5 h-4 w-4" />
        Manage Fonts
      </Button>
    </DialogTrigger>

    <DialogContent
      class="max-w-3xl h-[72vh] overflow-hidden flex flex-col p-0 bg-sidebar"
    >
      <div class="p-4 bg-background border-b border-border shrink-0">
        <DialogHeader>
          <DialogTitle>Font Library</DialogTitle>
        </DialogHeader>

        <!-- Tabs -->
        <div class="flex gap-1 border-b border-border pb-0 mt-4">
          <button
            v-for="tab in [
              { id: 'system', label: 'System', icon: 'i-hugeicons:computer' },
              {
                id: 'google',
                label: 'Google Fonts',
                icon: 'i-hugeicons:cloud',
              },
              {
                id: 'custom',
                label: 'Custom Uploads',
                icon: 'i-hugeicons:upload-01',
              },
            ] as const"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]"
          >
            <div :class="[tab.icon, 'h-4 w-4']" />
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden min-h-0 flex flex-col">
        <div class="p-4 flex-1 overflow-hidden min-h-0">
          <!-- System Fonts Tab -->
          <div
            v-if="activeTab === 'system'"
            class="h-full overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
          >
            <p class="text-sm text-muted-foreground">
              System fonts are always available and don't require loading
              external resources.
            </p>

            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="font in [
                  {
                    name: 'Outfit',
                    family:
                      'Outfit, -apple-system, BlinkMacSystemFont, sans-serif',
                    category: 'sans-serif',
                  },
                  { name: 'Inter', family: 'Inter', category: 'sans-serif' },
                  {
                    name: 'System Sans',
                    family: '-apple-system, BlinkMacSystemFont, sans-serif',
                    category: 'sans-serif',
                  },
                  {
                    name: 'Georgia',
                    family: 'Georgia, serif',
                    category: 'serif',
                  },
                  {
                    name: 'Monospace',
                    family: 'ui-monospace, monospace',
                    category: 'monospace',
                  },
                ]"
                :key="font.name"
                class="rounded-lg border border-border bg-card p-3"
              >
                <p
                  class="font-medium text-foreground"
                  :style="{ fontFamily: font.family }"
                >
                  {{ font.name }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ font.category }}
                </p>
              </div>
            </div>
          </div>

          <!-- Google Fonts Tab -->
          <div
            v-if="activeTab === 'google'"
            class="h-full flex flex-col min-h-0"
          >
            <!-- Search & Filter -->
            <div class="flex gap-2 mb-4 shrink-0">
              <div class="relative flex-1">
                <div
                  class="i-hugeicons:search-01 absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  v-model="googleFontSearch"
                  placeholder="Search Google Fonts..."
                  class="pl-9"
                />
              </div>
              <select
                v-model="googleFontCategory"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm shrink-0"
              >
                <option value="all">All</option>
                <option value="sans-serif">Sans</option>
                <option value="serif">Serif</option>
                <option value="display">Display</option>
                <option value="monospace">Mono</option>
              </select>
            </div>

            <!-- Font List -->
            <ScrollArea class="flex-1 min-h-0">
              <div class="pr-4">
                <transition-group name="font-list" tag="div" class="space-y-2">
                  <div
                    v-for="font in filteredGoogleFonts"
                    :key="font.family"
                    :class="[
                      'flex items-center justify-between rounded-lg border p-3 transition-all duration-200',
                      isGoogleFontEnabled(font)
                        ? 'border-primary/30 bg-primary/5 order-first'
                        : 'border-border bg-card hover:border-foreground/20',
                    ]"
                  >
                    <div>
                      <p
                        class="font-medium text-foreground"
                        :style="{ fontFamily: font.family }"
                      >
                        {{ font.family }}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {{ font.category }}
                      </p>
                    </div>

                    <Button
                      v-if="isGoogleFontEnabled(font)"
                      variant="outline"
                      size="sm"
                      :disabled="isEnabling === getGoogleFontId(font)"
                      @click="disableGoogleFont(getGoogleFontId(font))"
                    >
                      <div
                        v-if="isEnabling === getGoogleFontId(font)"
                        class="i-hugeicons:loading-01 mr-1.5 h-4 w-4 animate-spin"
                      />
                      <div
                        v-else
                        class="i-hugeicons:checkmark-circle-02 mr-1.5 h-4 w-4"
                      />
                      Enabled
                    </Button>

                    <Button
                      v-else
                      variant="outline"
                      size="sm"
                      :disabled="isEnabling === getGoogleFontId(font)"
                      @click="enableGoogleFont(font)"
                    >
                      <div
                        v-if="isEnabling === getGoogleFontId(font)"
                        class="i-hugeicons:loading-01 mr-1.5 h-4 w-4 animate-spin"
                      />
                      Enable
                    </Button>
                  </div>
                </transition-group>

                <div
                  v-if="filteredGoogleFonts.length === 0"
                  class="text-center py-8 text-muted-foreground"
                >
                  No fonts match your search
                </div>
              </div>
            </ScrollArea>
          </div>

          <!-- Custom Uploads Tab -->
          <div v-if="activeTab === 'custom'" class="h-full flex flex-col">
            <!-- Upload Zone -->
            <div
              :class="[
                'rounded-xl border-2 border-dashed p-6 text-center transition-colors mb-4',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-foreground/20',
              ]"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop="handleDrop"
              @click="fileInputRef?.click()"
            >
              <input
                ref="fileInputRef"
                type="file"
                accept=".woff2,.woff,.ttf,.otf,.eot"
                class="hidden"
                @change="handleFileSelect"
              />

              <div v-if="isUploading" class="space-y-2">
                <div
                  class="i-hugeicons:loading-01 mx-auto h-8 w-8 animate-spin text-muted-foreground"
                />
                <p class="text-sm text-muted-foreground">Uploading font...</p>
              </div>

              <div v-else class="space-y-2">
                <div
                  class="i-hugeicons:upload-01 mx-auto h-8 w-8 text-muted-foreground"
                />
                <p class="text-sm font-medium">
                  Drop a font file or click to browse
                </p>
                <p class="text-xs text-muted-foreground">
                  Supports WOFF2, WOFF, TTF, OTF, EOT
                </p>
              </div>
            </div>

            <!-- Uploaded Fonts List -->
            <ScrollArea class="flex-1 min-h-0">
              <div class="pr-4">
                <h4 class="text-sm font-medium mb-3">Your Fonts</h4>

                <div
                  v-if="customFonts.length === 0"
                  class="text-center py-8 text-muted-foreground"
                >
                  No custom fonts uploaded yet
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="font in customFonts"
                    :key="font.id"
                    class="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div class="min-w-0 flex-1 space-y-2">
                      <div v-if="editingFontId === font.id" class="space-y-2">
                        <Input
                          v-model="editingFontName"
                          class="h-9"
                          maxlength="120"
                          @keydown.enter.prevent="renameCustomFont(font)"
                          @keydown.esc.prevent="cancelRenaming"
                        />
                        <p class="text-xs text-muted-foreground">
                          Renaming changes the label shown in the font library.
                        </p>
                      </div>

                      <div v-else>
                        <p class="truncate font-medium text-foreground">
                          {{ font.name }}
                        </p>
                        <p class="truncate text-xs text-muted-foreground">
                          {{ font.family }}
                        </p>
                      </div>

                      <div
                        class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span
                          class="rounded-full border border-border bg-background px-2 py-0.5 font-medium text-foreground/80"
                        >
                          {{ getCustomFontFormatLabel(font) }}
                        </span>
                        <span>
                          {{
                            font.uploadedAt
                              ? new Date(font.uploadedAt).toLocaleDateString()
                              : "Recently uploaded"
                          }}
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <template v-if="editingFontId === font.id">
                        <Button
                          variant="outline"
                          size="sm"
                          :disabled="isRenaming === font.id"
                          @click="renameCustomFont(font)"
                        >
                          <div
                            v-if="isRenaming === font.id"
                            class="i-hugeicons:loading-01 mr-1.5 h-4 w-4 animate-spin"
                          />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          :disabled="isRenaming === font.id"
                          @click="cancelRenaming"
                        >
                          Cancel
                        </Button>
                      </template>

                      <template v-else>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="text-muted-foreground hover:text-foreground"
                          @click="startRenaming(font)"
                        >
                          <div class="i-hugeicons:pen-01 h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="text-destructive hover:text-destructive hover:bg-destructive/10"
                          @click="deleteCustomFont(font.id)"
                        >
                          <div
                            class="i-hugeicons:delete-02 h-4 w-4"
                          />
                        </Button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* Font list animation when enabled fonts move to top */
.font-list-enter-active,
.font-list-leave-active,
.font-list-move {
  transition: all 300ms ease;
}

.font-list-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.font-list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* Scrollbar styling */
:deep(.scrollbar-thin) {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

:deep(.scrollbar-thin::-webkit-scrollbar) {
  width: 6px;
}

:deep(.scrollbar-thin::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.scrollbar-thin::-webkit-scrollbar-thumb) {
  background-color: hsl(var(--border));
  border-radius: 3px;
}

:deep(.scrollbar-thin::-webkit-scrollbar-thumb:hover) {
  background-color: hsl(var(--muted-foreground));
}
</style>
