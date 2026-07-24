<script setup lang="ts">
import { ref } from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDesignSystem } from "../composables/useDesignSystem";
import { importFromJSON } from "@/lib/design/export";
import { parseVariableImportJson } from "../lib/variableManagerImport";

/**
 * Import Config Dialog
 *
 * Modal dialog for importing a design system configuration.
 * Supports pasting JSON or uploading a .json / .aria-design.json file.
 *
 * @emits update:open
 */
interface Props {
  open: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
  context?: "design-system" | "variables" | "classes";
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  import: [data: Record<string, unknown>];
}>();

const designSystem = useDesignSystem();

const activeTab = ref<"paste" | "upload">("paste");
const jsonInput = ref("");
const importError = ref<string | null>(null);
const isImporting = ref(false);

interface ParsedPreview {
  name: string;
  paletteCount: number;
  exportedAt: string | null;
}

const parsedPreview = ref<ParsedPreview | null>(null);

const JsonInputSchema = z.string().min(1, "Paste your design system JSON");

let validateTimeout: ReturnType<typeof setTimeout> | null = null;

function validateVariablesJson(value: string): void {
  const result = parseVariableImportJson(value);
  if (!result.success) {
    importError.value = result.error;
    parsedPreview.value = null;
    return;
  }

  importError.value = null;
  parsedPreview.value = {
    name: "Variables Import",
    paletteCount: result.summary.totalCount,
    exportedAt: null,
  };
}

function validateJson(value: string): void {
  if (validateTimeout) clearTimeout(validateTimeout);

  validateTimeout = setTimeout(() => {
    if (!value.trim()) {
      importError.value = null;
      parsedPreview.value = null;
      return;
    }

    if (props.context === "variables") {
      validateVariablesJson(value);
      return;
    }

    if (props.context === "classes") {
      try {
        const parsed = JSON.parse(value);
        const classes = parsed && typeof parsed === "object" ? parsed : {};
        const count = Object.keys(classes).length;
        if (count === 0) {
          importError.value = "JSON must contain at least one class definition";
          parsedPreview.value = null;
          return;
        }
        importError.value = null;
        parsedPreview.value = {
          name: "Classes Import",
          paletteCount: count,
          exportedAt: null,
        };
      } catch {
        importError.value = "Invalid JSON syntax";
        parsedPreview.value = null;
      }
      return;
    }

    const result = importFromJSON(value);
    if (result.success) {
      importError.value = null;
      parsedPreview.value = {
        name: result.data.name || "Unnamed",
        paletteCount: result.data.colors.palettes
          ? Object.keys(result.data.colors.palettes).length
          : 0,
        exportedAt: result.data.exportedAt || null,
      };
    } else {
      importError.value = result.error;
      parsedPreview.value = null;
    }
  }, 400);
}

function onJsonInput(value: string): void {
  jsonInput.value = value;
  validateJson(value);
}

function handleDownloadTemplate(): void {
  const now = new Date().toISOString();

  let sample: Record<string, unknown>;
  let filename: string;

  if (props.context === "design-system" || !props.context) {
    const blob = new Blob(
      [designSystem.exportJSON("Aria Design System Template")],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aria-design-system-template.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  if (props.context === "classes") {
    sample = {
      "btn-primary": {
        id: "btn-primary",
        name: "btn-primary",
        description: "Primary button style",
        variants: [
          {
            breakpoint: "base",
            rules: [
              {
                property: "background-color",
                value: "#3b82f6",
                important: false,
              },
              {
                property: "color",
                value: "#ffffff",
                important: false,
              },
              {
                property: "border-radius",
                value: "8px",
                important: false,
              },
            ],
          },
        ],
        pseudoVariants: [
          {
            state: "hover",
            breakpoint: "base",
            rules: [
              {
                property: "background-color",
                value: "#2563eb",
                important: false,
              },
            ],
          },
        ],
      },
      "card-default": {
        id: "card-default",
        name: "card-default",
        description: "Standard card container",
        variants: [
          {
            breakpoint: "base",
            rules: [
              {
                property: "border",
                value: "1px solid #e2e8f0",
                important: false,
              },
              {
                property: "border-radius",
                value: "12px",
                important: false,
              },
              {
                property: "padding",
                value: "24px",
                important: false,
              },
            ],
          },
        ],
        pseudoVariants: [],
      },
      "hide-mobile": {
        id: "hide-mobile",
        name: "hide-mobile",
        description: "Hide element on mobile screens",
        variants: [
          {
            breakpoint: "mobile",
            rules: [{ property: "display", value: "none", important: false }],
          },
          {
            breakpoint: "tablet",
            rules: [{ property: "display", value: "block", important: false }],
          },
        ],
        pseudoVariants: [],
      },
      "section-padding": {
        id: "section-padding",
        name: "section-padding",
        description: "Responsive section padding at each breakpoint",
        variants: [
          {
            breakpoint: "base",
            rules: [
              { property: "padding", value: "80px 24px", important: false },
            ],
          },
          {
            breakpoint: "tablet",
            rules: [
              { property: "padding", value: "60px 32px", important: false },
            ],
          },
          {
            breakpoint: "mobile",
            rules: [
              { property: "padding", value: "40px 16px", important: false },
            ],
          },
        ],
        pseudoVariants: [],
      },
    };
    filename = "aria-classes-template.json";
  } else {
    sample = {
      custom: {
        "--color-brand": {
          label: "Brand Color",
          value: "#3b82f6",
          category: "color",
        },
        "--spacing-lg": {
          label: "Large Spacing",
          value: "24px",
          category: "spacing",
        },
        "--font-heading": {
          label: "Heading Font",
          value: "Inter",
          category: "typography",
        },
      },
      aliases: {
        "--btn-bg": {
          label: "Button Background",
          sourceType: "token",
          sourceKey: "--color-brand",
        },
        "--card-padding": {
          label: "Card Padding",
          sourceType: "token",
          sourceKey: "--spacing-lg",
        },
      },
    };
    filename = "aria-variables-template.json";
  }

  const blob = new Blob([JSON.stringify(sample, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const fileError = ref<string | null>(null);

function triggerFilePicker(): void {
  fileInputRef.value?.click();
}

function validateUploadedFileText(text: string): void {
  if (props.context === "variables") {
    const result = parseVariableImportJson(text);
    if (!result.success) {
      fileError.value = result.error;
      parsedPreview.value = null;
      return;
    }

    fileError.value = null;
    parsedPreview.value = {
      name: "Variables Import",
      paletteCount: result.summary.totalCount,
      exportedAt: null,
    };
    return;
  }

  if (props.context === "classes") {
    try {
      const parsed = JSON.parse(text);
      const classes = parsed && typeof parsed === "object" ? parsed : {};
      const count = Object.keys(classes).length;
      if (count === 0) {
        fileError.value = "JSON must contain at least one class definition";
        parsedPreview.value = null;
        return;
      }
      fileError.value = null;
      parsedPreview.value = {
        name: "Classes Import",
        paletteCount: count,
        exportedAt: null,
      };
    } catch {
      fileError.value = "Invalid JSON syntax";
      parsedPreview.value = null;
    }
    return;
  }

  const result = importFromJSON(text);
  if (result.success) {
    fileError.value = null;
    parsedPreview.value = {
      name: result.data.name || "Unnamed",
      paletteCount: result.data.colors.palettes
        ? Object.keys(result.data.colors.palettes).length
        : 0,
      exportedAt: result.data.exportedAt || null,
    };
  } else {
    fileError.value = result.error;
  }
}

function readUploadedFile(file: File): void {
  selectedFile.value = file;
  fileError.value = null;
  parsedPreview.value = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    validateUploadedFileText(text);
  };
  reader.readAsText(file);
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;

  readUploadedFile(files[0]);
}

function handleFileDrop(event: DragEvent): void {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  readUploadedFile(file);
}

async function handleImport(): Promise<void> {
  isImporting.value = true;
  importError.value = null;

  try {
    let jsonString = "";

    if (activeTab.value === "paste") {
      jsonString = jsonInput.value;
    } else if (selectedFile.value) {
      jsonString = await selectedFile.value.text();
    }

    if (!jsonString.trim()) {
      toast.error("No configuration to import");
      return;
    }

    if (props.context === "variables") {
      const result = parseVariableImportJson(jsonString);
      if (!result.success) {
        importError.value = result.error;
        toast.error(result.error);
        return;
      }

      emit("import", result.data as unknown as Record<string, unknown>);
      emit("update:open", false);
      jsonInput.value = "";
      selectedFile.value = null;
      parsedPreview.value = null;
      importError.value = null;
      fileError.value = null;
      return;
    }

    if (props.context === "classes") {
      const parsed = JSON.parse(jsonString);
      emit("import", parsed);
      emit("update:open", false);
      jsonInput.value = "";
      selectedFile.value = null;
      parsedPreview.value = null;
      importError.value = null;
      fileError.value = null;
      return;
    }

    const result = designSystem.importJSON(jsonString);

    if (result.success) {
      const name = result.data.name || "Design system";
      toast.success(`Imported "${name}" successfully`);
      emit("update:open", false);
      jsonInput.value = "";
      selectedFile.value = null;
      parsedPreview.value = null;
      importError.value = null;
      fileError.value = null;
    } else {
      const msg = result.error || "Failed to import configuration";
      importError.value = msg;
      toast.error(msg);
    }
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to import configuration";
    importError.value = msg;
    toast.error(msg);
  } finally {
    isImporting.value = false;
  }
}

function handleClose(): void {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="w-[90vw]! max-w-2xl! p-0 gap-0 overflow-hidden [&>button]:top-5 [&>button]:right-5"
    >
      <div class="w-full h-full flex flex-col">
        <!-- Header -->
        <div class="shrink-0">
          <DialogHeader class="space-y-0 mb-6">
            <DialogTitle class="leading-0 text-3xl font-serif font-regular m-0">
              {{ title || "Import Configuration" }}
            </DialogTitle>
            <DialogDescription
              class="text-sm text-muted-foreground/80 leading-0 m-0"
            >
              {{
                description || "Import a design system configuration from JSON"
              }}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            v-model="activeTab"
            class="w-full"
            @update:model-value="
              () => {
                importError = null;
                parsedPreview = null;
                fileError = null;
              }
            "
          >
            <TabsList class="h-9">
              <TabsTrigger value="paste" class="text-xs">
                Paste JSON
              </TabsTrigger>
              <TabsTrigger value="upload" class="text-xs">
                Upload File
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <!-- Body -->
        <div class="flex-1 min-h-0 overflow-auto py-5 space-y-4">
          <!-- Paste JSON tab -->
          <div v-if="activeTab === 'paste'" class="space-y-3">
            <textarea
              :value="jsonInput"
              :placeholder="
                placeholder || 'Paste your design system JSON here...'
              "
              class="w-full h-48 min-h-[12rem] overflow-hidden rounded-md border border-solid border-border bg-muted/10 px-4 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:ring-[1px] focus:ring-border/50 focus:ring-offset-0"
              @input="onJsonInput(($event.target as HTMLTextAreaElement).value)"
            />
            <div class="flex items-center justify-between">
              <button
                class="text-xs text-primary/70 hover:text-primary underline-offset-2 hover:underline transition-colors"
                @click="handleDownloadTemplate"
              >
                Download sample template →
              </button>
            </div>
          </div>

          <!-- Upload File tab -->
          <div v-if="activeTab === 'upload'" class="space-y-3">
            <input
              ref="fileInputRef"
              type="file"
              accept=".json,.aria-design.json"
              class="hidden"
              @change="handleFileSelect"
            />
            <button
              class="w-full rounded-md border-2 border-dashed border-border/50 bg-muted/5 px-6 py-10 transition-colors hover:bg-muted/10 hover:border-border/50 text-center cursor-pointer"
              @click="triggerFilePicker"
              @dragover.prevent
              @drop="handleFileDrop"
            >
              <span
                class="i-hugeicons:upload-01 mx-auto mb-3 h-7 w-7 text-muted-foreground/50 block"
              />
              <p class="text-sm font-medium text-foreground">
                {{
                  selectedFile
                    ? selectedFile.name
                    : "Click to browse or drop a file"
                }}
              </p>
              <p
                v-if="!selectedFile"
                class="mt-1 text-xs text-muted-foreground/60"
              >
                Accepts .json and .aria-design.json files
              </p>
            </button>
          </div>

          <!-- Preview card (when JSON is valid) -->
          <div
            v-if="parsedPreview"
            class="rounded-md border border-border/50 bg-muted/15 px-4 py-3 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-foreground">
                {{ parsedPreview.name }}
              </span>
              <span
                class="text-2xs font-mono text-emerald-600 dark:text-emerald-400"
              >
                Valid
              </span>
            </div>
            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <template v-if="context === 'variables'">
                <span
                  >{{ parsedPreview.paletteCount }} variable(s) and
                  alias(es)</span
                >
              </template>
              <template v-else-if="context === 'classes'">
                <span>{{ parsedPreview.paletteCount }} class(es)</span>
              </template>
              <template v-else>
                <span>{{ parsedPreview.paletteCount }} palette(s)</span>
                <span v-if="parsedPreview.exportedAt">
                  {{ new Date(parsedPreview.exportedAt).toLocaleDateString() }}
                </span>
              </template>
            </div>
          </div>

          <!-- Error message -->
          <div
            v-if="importError || fileError"
            class="rounded-md border border-red-300/60 bg-red-50/50 dark:bg-red-950/20 px-4 py-2.5"
          >
            <p class="text-xs font-medium text-red-700 dark:text-red-400">
              {{ importError || fileError }}
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div
          class="px-7 py-4 border-t border-border/50 shrink-0 flex items-center justify-end gap-2"
        >
          <Button variant="ghost" size="sm" @click="handleClose">
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            :disabled="
              isImporting ||
              (activeTab === 'paste' &&
                (!jsonInput.trim() || !parsedPreview)) ||
              (activeTab === 'upload' && (!selectedFile || !parsedPreview))
            "
            @click="handleImport"
          >
            <div
              v-if="isImporting"
              class="i-hugeicons:loading-01 h-3.5 w-3.5 animate-spin mr-1.5"
            />
            {{ isImporting ? "Importing…" : "Import" }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
