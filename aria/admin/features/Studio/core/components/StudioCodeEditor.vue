<script setup lang="ts">
import { indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { codeEditorHighlightStyle } from "@/lib/codeEditorTheme";

type CodeEditorLanguage = "css" | "html" | "javascript" | "json";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: CodeEditorLanguage;
    placeholder?: string;
    readonly?: boolean;
    lineNumbers?: boolean;
  }>(),
  {
    language: "javascript",
    placeholder: "",
    readonly: false,
    lineNumbers: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);

function getLanguageExtension(language: CodeEditorLanguage) {
  switch (language) {
    case "css":
      return css();
    case "html":
      return html({
        autoCloseTags: true,
        matchClosingTags: true,
      });
    case "json":
      return json();
    case "javascript":
    default:
      return javascript({
        jsx: true,
        typescript: true,
      });
  }
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
      getLanguageExtension(props.language),
      syntaxHighlighting(codeEditorHighlightStyle),
      EditorView.editable.of(!props.readonly),
      EditorState.readOnly.of(props.readonly),
      props.placeholder ? placeholder(props.placeholder) : [],
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || props.readonly) {
          return;
        }

        emit("update:modelValue", update.state.doc.toString());
      }),
      !props.lineNumbers
        ? EditorView.theme({
            ".cm-gutters": {
              display: "none !important",
            },
          })
        : [],
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
}

function destroyEditor(): void {
  editorView.value?.destroy();
  editorView.value = null;
}

function syncEditorContent(value: string): void {
  const view = editorView.value;
  if (!view) return;

  const currentValue = view.state.doc.toString();
  if (currentValue === value) return;

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

watch(() => props.modelValue, syncEditorContent);

onMounted(() => {
  createEditor();
});

onBeforeUnmount(() => {
  destroyEditor();
});
</script>

<template>
  <div
    ref="editorRoot"
    class="code-editor-shell h-full min-h-[200px] overflow-hidden rounded-sm border border-dashed border-border/50 bg-background"
    style="outline: none; box-shadow: none"
  />
</template>
