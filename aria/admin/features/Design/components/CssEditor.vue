<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { indentWithTab } from "@codemirror/commands";
import { cssLanguage } from "@codemirror/lang-css";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { codeEditorHighlightStyle } from "@/lib/codeEditorTheme";
import type { VariableReferenceOption } from "@/lib/variableReferences";
import { createCssDeclarationCompletionSource } from "../lib/cssVariableCompletions";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    lineNumbers?: boolean;
    variableReferences?: readonly VariableReferenceOption[];
  }>(),
  {
    placeholder: "",
    lineNumbers: true,
    variableReferences: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);

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
      cssLanguage,
      cssLanguage.data.of({
        autocomplete: createCssDeclarationCompletionSource(
          () => props.variableReferences,
        ),
      }),
      syntaxHighlighting(codeEditorHighlightStyle),
      props.placeholder ? placeholder(props.placeholder) : [],
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) {
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
      EditorView.theme({
        "&": {
          outline: "none",
        },
        ".cm-editor": {
          outline: "none !important",
        },
        ".cm-editor.cm-focused": {
          outline: "none !important",
          boxShadow: "none !important",
        },
        ".cm-scroller": {
          outline: "none !important",
        },
        ".cm-content": {
          outline: "none !important",
          border: "none !important",
        },
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
            paddingRight: "0px",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "transparent",
            color: "var(--code-editor-gutter-active)",
          },
          ".cm-activeLine": {
            backgroundColor: "transparent",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            backgroundColor: "var(--code-editor-selection)",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "hsl(var(--primary))",
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

// Sync external model changes into the editor
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
    class="code-editor-shell h-full min-h-[200px] overflow-hidden rounded-md border border-border/50 bg-background"
    style="outline: none; box-shadow: none"
  />
</template>
