<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";
import { indentWithTab } from "@codemirror/commands";
import { xml } from "@codemirror/lang-xml";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { codeEditorHighlightStyle } from "@/lib/codeEditorTheme";
import {
  discoveryArtifactEditorHeightPx,
  discoveryArtifactMaxEditorHeightPx,
} from "../lib/discoveryArtifactEditorLayout";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: "plain" | "xml";
    readonly?: boolean;
    disabled?: boolean;
  }>(),
  {
    language: "plain",
    readonly: false,
    disabled: false,
  },
);

const editorHeightPx = computed(() => {
  const lineCount = props.modelValue.split("\n").length;
  return discoveryArtifactEditorHeightPx(lineCount);
});

const editorContainerStyle = computed(() => ({
  height: `${editorHeightPx.value}px`,
  maxHeight: `${discoveryArtifactMaxEditorHeightPx()}px`,
}));

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const languageCompartment = new Compartment();

function getLanguageExtension(language: "plain" | "xml") {
  return language === "xml" ? xml() : [];
}

function createEditor(): void {
  if (!editorRoot.value || editorView.value) {
    return;
  }

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      keymap.of([indentWithTab]),
      languageCompartment.of(getLanguageExtension(props.language)),
      syntaxHighlighting(codeEditorHighlightStyle),
      EditorView.editable.of(!props.readonly && !props.disabled),
      EditorState.readOnly.of(props.readonly || props.disabled),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || props.readonly || props.disabled) {
          return;
        }
        emit("update:modelValue", update.state.doc.toString());
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
            padding: "12px 0",
          },
          ".cm-line": {
            padding: "0 12px",
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
}

function destroyEditor(): void {
  editorView.value?.destroy();
  editorView.value = null;
}

function syncEditorContent(value: string): void {
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
}

async function mountEditor(): Promise<void> {
  destroyEditor();
  await nextTick();
  if (!editorRoot.value) {
    return;
  }
  createEditor();
  syncEditorContent(props.modelValue);
}

watch(
  () => editorRoot.value,
  (root) => {
    if (!root) {
      destroyEditor();
      return;
    }
    void mountEditor();
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (value) => {
    syncEditorContent(value);
  },
);

watch(
  () => [props.language, props.readonly, props.disabled] as const,
  () => {
    void mountEditor();
  },
);

onBeforeUnmount(() => {
  destroyEditor();
});
</script>

<template>
  <div
    ref="editorRoot"
    class="code-editor-shell discovery-artifact-editor overflow-hidden rounded-md border border-border/50 bg-background"
    :style="editorContainerStyle"
  />
</template>
