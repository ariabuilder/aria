<script setup lang="ts">
import { studioIcons } from "@/lib/icons";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";
import { indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { codeEditorHighlightStyle } from "@/lib/codeEditorTheme";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  getCodeBlockRenderMode,
  inferCodeLanguage,
  type CodeBlockRenderMode,
} from "../../../../lib/utils/codeLanguage";
import { usePropertySave } from "../../Core";
import BaseProperty from "./BaseProperty.vue";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const { selectedNode, selectedNodeId, isLoading, error, saveProperties } =
  usePropertySave();

const CodeSchema = z.object({
  content: z.string(),
});

const content = ref("");
const draftContent = ref("");
const renderMode = ref<CodeBlockRenderMode>("display");
const isDialogOpen = ref(false);
const validationError = ref<string | null>(null);
const editorRoot = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);

const languageCompartment = new Compartment();

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});
const inferredLanguage = computed(() => inferCodeLanguage(draftContent.value));
const isRenderMode = computed(() => renderMode.value === "render");
const hasCodeChanges = computed(
  () => content.value.length > 0 || renderMode.value !== "display",
);
const renderToggleValue = computed({
  get: () => isRenderMode.value,
  set: (value: boolean) => {
    void handleRenderModeChange(Boolean(value));
  },
});
const selectedCodeContent = computed(() =>
  String(
    selectedNode.value?.props?.content ??
      selectedNode.value?.props?.code ??
      selectedNode.value?.props?.text ??
      "",
  ),
);
const selectedCodeRenderMode = computed<CodeBlockRenderMode>(() =>
  getCodeBlockRenderMode(selectedNode.value?.props?.renderMode),
);
const dialogModeLabel = computed(() => t("inspector.code.editor"));
const dialogModeHint = computed(() => t("inspector.code.saveHint"));

const getLanguageExtension = (language: string) => {
  switch (language) {
    case "html":
      return html({
        autoCloseTags: true,
        matchClosingTags: true,
      });
    case "css":
      return css();
    case "json":
      return json();
    case "javascript":
    default:
      return javascript();
  }
};

const createEditor = (): void => {
  if (!editorRoot.value || editorView.value) {
    return;
  }

  const state = EditorState.create({
    doc: draftContent.value,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      keymap.of([indentWithTab]),
      languageCompartment.of(getLanguageExtension(inferredLanguage.value)),
      syntaxHighlighting(codeEditorHighlightStyle),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) {
          return;
        }

        draftContent.value = update.state.doc.toString();
      }),
      EditorView.theme(
        {
          "&": {
            height: "100%",
            fontSize: "13px",
            backgroundColor: "var(--code-editor-bg)",
            color: "var(--code-editor-foreground)",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
          },
          ".cm-content": {
            minHeight: "100%",
            padding: "16px 0",
          },
          ".cm-line": {
            padding: "0 16px",
          },
          ".cm-gutters": {
            border: "none",
            backgroundColor: "var(--code-editor-bg)",
            color: "var(--code-editor-gutter-foreground)",
            paddingRight: "8px",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "transparent",
            color: "var(--code-editor-gutter-active)",
          },
          ".cm-activeLine": {
            backgroundColor: "var(--code-editor-active-line)",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            backgroundColor: "var(--code-editor-selection)",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--code-editor-cursor)",
          },
        },
        { dark: true },
      ),
    ],
  });

  editorView.value = new EditorView({
    state,
    parent: editorRoot.value,
  });
};

const destroyEditor = (): void => {
  editorView.value?.destroy();
  editorView.value = null;
};

const syncEditorContent = (value: string): void => {
  const view = editorView.value;

  if (!view) {
    return;
  }

  const currentValue = view.state.doc.toString();

  if (currentValue === value) {
    return;
  }

  const cursorPosition = Math.min(view.state.selection.main.head, value.length);

  view.dispatch({
    changes: {
      from: 0,
      to: currentValue.length,
      insert: value,
    },
    selection: EditorSelection.cursor(cursorPosition),
  });
};

watch(
  [selectedCodeContent, selectedCodeRenderMode],
  ([nextContent, nextRenderMode]) => {
    content.value = nextContent;
    renderMode.value = nextRenderMode;

    if (!isDialogOpen.value) {
      draftContent.value = nextContent;
    }
  },
  { immediate: true },
);

watch(isDialogOpen, async (open) => {
  if (!open) {
    draftContent.value = content.value;
    destroyEditor();
    return;
  }

  draftContent.value = content.value;
  await nextTick();
  createEditor();
  syncEditorContent(draftContent.value);
  editorView.value?.focus();
});

watch(draftContent, (value) => {
  if (!isDialogOpen.value) {
    return;
  }

  syncEditorContent(value);
});

watch(inferredLanguage, (language) => {
  const view = editorView.value;

  if (!view) {
    return;
  }

  view.dispatch({
    effects: languageCompartment.reconfigure(getLanguageExtension(language)),
  });
});

const saveContent = async (value: string): Promise<boolean> => {
  if (
    !selectedNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return false;
  }

  const parsed = CodeSchema.safeParse({
    content: value,
  });

  if (!parsed.success) {
    validationError.value = t("inspector.validation.invalidCode");
    return false;
  }

  validationError.value = null;

  const success = await saveProperties(
    {
      content: value,
      code: undefined,
      text: undefined,
      language: undefined,
      renderMode: renderMode.value,
    },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    return false;
  }

  content.value = value;
  draftContent.value = value;
  return true;
};

const handleDialogSave = async (): Promise<void> => {
  const success = await saveContent(draftContent.value);

  if (success) {
    isDialogOpen.value = false;
  }
};

const handleDialogToggle = (open: boolean): void => {
  isDialogOpen.value = open;
};

const handleRenderModeChange = async (checked: boolean): Promise<void> => {
  const nextMode: CodeBlockRenderMode = checked ? "render" : "display";

  if (nextMode === renderMode.value) {
    return;
  }

  renderMode.value = nextMode;

  if (
    !selectedNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  const success = await saveProperties(
    { renderMode: nextMode },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!success) {
    renderMode.value = checked ? "display" : "render";
  }
};

const handleDialogKeydown = async (event: KeyboardEvent): Promise<void> => {
  if ((!event.metaKey && !event.ctrlKey) || event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  await handleDialogSave();
};

onBeforeUnmount(() => {
  destroyEditor();
});

const resetCode = async (): Promise<void> => {
  if (
    !selectedNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  const success = await saveProperties(
    {
      content: "",
      code: undefined,
      text: undefined,
      language: undefined,
      renderMode: undefined,
    },
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    validationError.value = null;
    content.value = "";
    draftContent.value = "";
    renderMode.value = "display";
    if (isDialogOpen.value) {
      syncEditorContent("");
    }
  }
};
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="defaultOpen"
    :has-changes="hasCodeChanges"
    :show-reset="hasCodeChanges"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.code.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetCode()"
    title="Code"
  >
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3 px-3 py-2">
        <div class="flex items-center font-regular">
          <Button
            variant="outline"
            size="sm"
            class="min-w-24 shrink-0 hover:bg-primary"
            :disabled="isPanelDisabled"
            @click="handleDialogToggle(true)"
          >
            <span :class="[studioIcons.code, 'size-4']" />
            {{ t("inspector.code.edit") }}
          </Button>
        </div>

        <div class="flex items-center gap-3">
          <span
            class="text-xs font-mono uppercase tracking-widest text-muted-foreground"
          >
            {{ t("inspector.code.render") }}
          </span>
          <Switch v-model="renderToggleValue" :disabled="isPanelDisabled" />
        </div>
      </div>

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-red-500">
        {{ error }}
      </div>
    </div>
  </BaseProperty>

  <Dialog :open="isDialogOpen" @update:open="handleDialogToggle">
    <DialogContent
      class="w-[72svw]! max-w-6xl! max-h-[86dvh]! p-0 gap-0 overflow-hidden [&>button]:top-6 [&>button]:right-6"
      @keydown="(event: KeyboardEvent) => void handleDialogKeydown(event)"
    >
      <div class="flex min-h-[72dvh] flex-col bg-sidebar">
        <div class="shrink-0 px-6 py-5">
          <DialogHeader class="space-y-3 pr-16">
            <DialogTitle
              class="font-serif text-2xl font-medium text-foreground"
            >
              {{ dialogModeLabel }}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div class="flex min-h-0 flex-1 flex-col">
          <div
            class="flex items-center justify-end px-6 py-3 text-xs text-muted-foreground/70"
          >
            <div
              class="flex shrink-0 items-center gap-3 rounded-full border border-border/50 bg-background/70 px-3 py-1.5"
            >
              <span
                class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/72"
              >
                {{ t("inspector.code.render") }}
              </span>
              <Switch v-model="renderToggleValue" :disabled="isPanelDisabled" />
            </div>
          </div>

          <div class="min-h-0 flex-1 p-4">
            <div
              ref="editorRoot"
              class="code-editor-shell h-full min-h-[56dvh] overflow-hidden rounded-md border border-border/50 bg-background"
            />
          </div>
        </div>

        <div class="shrink-0 border-t border-border/50 px-6 py-4">
          <div class="flex items-center justify-between gap-4">
            <span class="text-xs text-muted-foreground/70">
              {{ dialogModeHint }}
            </span>

            <div class="flex items-center gap-2">
              <Button variant="outline" @click="handleDialogToggle(false)">
                {{ t("common.cancel") }}
              </Button>
              <Button
                :disabled="isPanelDisabled"
                @click="() => void handleDialogSave()"
              >
                {{ t("inspector.code.save") }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
