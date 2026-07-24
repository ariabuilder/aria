<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { EditorContent, useEditor, VueNodeViewRenderer } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import { MediaAssetSchema } from "@/features/Studio/media/composables/mediaActionResults";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import {
  AriaStructuredEmbed,
  AriaStructuredImage,
  STRUCTURED_EMBED_NODE_NAME,
  STRUCTURED_IMAGE_NODE_NAME,
  StructuredEmbedNodeAttrsSchema,
  StructuredImageNodeAttrsSchema,
  deserializeStructuredTextToTiptap,
  inferEmbedProvider,
  serializeTiptapToStructuredText,
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "../../../../lib/cms/structuredText";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import {
  StructuredEmbedBlockView,
  StructuredImageBlockView,
} from "./StructuredTextBlockViews";

const props = withDefaults(
  defineProps<{
    modelValue: StructuredTextDocument;
    disabled?: boolean;
    placeholder?: string;
    minHeightClass?: string;
  }>(),
  {
    disabled: false,
    placeholder: "",
    minHeightClass: "min-h-34",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: StructuredTextDocument];
}>();
const { t } = useStudioI18n();

type TextStyle = "paragraph" | "h2" | "h3" | "h4" | "blockquote";
type MarkName = "bold" | "italic" | "strike" | "underline" | "code";

interface ToolbarButton {
  id: string;
  label: string;
  title: string;
  icon?: string;
  action: () => void;
  active?: () => boolean;
  disabled?: () => boolean;
}

function toEditorContent(value: StructuredTextDocument): JSONContent {
  return deserializeStructuredTextToTiptap(value);
}

function normalizedDocument(value: StructuredTextDocument): StructuredTextDocument {
  return StructuredTextDocumentSchema.parse(value);
}

function isSameDocument(
  left: StructuredTextDocument,
  right: StructuredTextDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const editorVersion = ref(0);
const isLinkDialogOpen = ref(false);
const linkHref = ref("");
const linkOpenInNewTab = ref(false);
const isMediaPickerOpen = ref(false);
const isEmbedDialogOpen = ref(false);
const embedUrl = ref("");

function refreshEditorState(): void {
  editorVersion.value += 1;
}

const editor = useEditor({
  content: toEditorContent(normalizedDocument(props.modelValue)),
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [2, 3, 4],
      },
      link: false,
    }),
    Placeholder.configure({
      placeholder: props.placeholder || t("cms.richText.placeholder"),
    }),
    Link.configure({
      autolink: false,
      linkOnPaste: true,
      openOnClick: false,
    }),
    AriaStructuredImage.extend({
      addNodeView() {
        return VueNodeViewRenderer(StructuredImageBlockView);
      },
    }),
    AriaStructuredEmbed.extend({
      addNodeView() {
        return VueNodeViewRenderer(StructuredEmbedBlockView);
      },
    }),
  ],
  onUpdate: ({ editor: activeEditor }) => {
    refreshEditorState();
    const nextDocument = serializeTiptapToStructuredText(activeEditor.getJSON());
    if (!isSameDocument(nextDocument, props.modelValue)) {
      emit("update:modelValue", nextDocument);
    }
  },
  onSelectionUpdate: () => {
    refreshEditorState();
  },
  onTransaction: () => {
    refreshEditorState();
  },
});

const buttonDisabled = computed(() => props.disabled || !editor.value);
const currentText = computed(() => {
  editorVersion.value;
  return editor.value?.getText() ?? "";
});
const wordCount = computed(() => {
  const trimmed = currentText.value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
});
const characterCount = computed(() => currentText.value.length);
const readingTimeMinutes = computed(() => Math.max(1, Math.ceil(wordCount.value / 225)));
const statsLabel = computed(() => {
  const words = wordCount.value === 1
    ? t("cms.richText.word", { count: wordCount.value })
    : t("cms.richText.words", { count: wordCount.value });
  const characters =
    characterCount.value === 1
      ? t("cms.richText.character", { count: characterCount.value })
      : t("cms.richText.characters", { count: characterCount.value });
  return t("cms.richText.stats", { words, characters, minutes: readingTimeMinutes.value });
});

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled);
  },
);

watch(
  () => props.modelValue,
  (value) => {
    const activeEditor = editor.value;
    if (!activeEditor) return;

    const currentDocument = serializeTiptapToStructuredText(
      activeEditor.getJSON(),
    );
    const nextDocument = normalizedDocument(value);
    if (isSameDocument(currentDocument, nextDocument)) {
      return;
    }
    activeEditor.commands.setContent(toEditorContent(nextDocument), {
      emitUpdate: false,
    });
    refreshEditorState();
  },
  { deep: true },
);

function isMarkActive(mark: MarkName): boolean {
  editorVersion.value;
  return editor.value?.isActive(mark) ?? false;
}

function isStyleActive(style: TextStyle): boolean {
  editorVersion.value;
  if (!editor.value) return false;
  if (style === "paragraph") return editor.value.isActive("paragraph");
  if (style === "blockquote") return editor.value.isActive("blockquote");
  return editor.value.isActive("heading", { level: Number(style.at(1)) });
}

function canUndo(): boolean {
  editorVersion.value;
  return editor.value?.can().undo() ?? false;
}

function canRedo(): boolean {
  editorVersion.value;
  return editor.value?.can().redo() ?? false;
}

function isLinkActive(): boolean {
  editorVersion.value;
  return editor.value?.isActive("link") ?? false;
}

function setTextStyle(style: TextStyle): void {
  if (!editor.value) return;
  const chain = editor.value.chain().focus();
  if (style === "paragraph") {
    chain.setParagraph().run();
    return;
  }
  if (style === "blockquote") {
    chain.toggleBlockquote().run();
    return;
  }
  chain.toggleHeading({ level: Number(style.at(1)) as 2 | 3 | 4 }).run();
}

function toggleMark(mark: MarkName): void {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  switch (mark) {
    case "bold":
      chain.toggleBold().run();
      break;
    case "italic":
      chain.toggleItalic().run();
      break;
    case "strike":
      chain.toggleStrike().run();
      break;
    case "underline":
      chain.toggleUnderline().run();
      break;
    case "code":
      chain.toggleCode().run();
      break;
  }
}

function undo(): void {
  editor.value?.chain().focus().undo().run();
}

function redo(): void {
  editor.value?.chain().focus().redo().run();
}

function toggleBulletList(): void {
  editor.value?.chain().focus().toggleBulletList().run();
}

function toggleOrderedList(): void {
  editor.value?.chain().focus().toggleOrderedList().run();
}

function insertDivider(): void {
  editor.value?.chain().focus().setHorizontalRule().run();
}

function openMediaPicker(): void {
  if (buttonDisabled.value) return;
  isMediaPickerOpen.value = true;
}

function handleMediaSelect(asset: MediaAsset): void {
  const parsed = MediaAssetSchema.safeParse(asset);
  const activeEditor = editor.value;
  if (!parsed.success || !activeEditor || parsed.data.type !== "image") {
    return;
  }

  const attrs = StructuredImageNodeAttrsSchema.parse({
    mediaId: parsed.data.id,
    alt: parsed.data.name,
    caption: "",
  });
  const chain = activeEditor.chain().focus();
  if (activeEditor.isActive(STRUCTURED_IMAGE_NODE_NAME)) {
    chain.updateAttributes(STRUCTURED_IMAGE_NODE_NAME, attrs).run();
  } else {
    chain
      .insertContent({
        type: STRUCTURED_IMAGE_NODE_NAME,
        attrs,
      })
      .run();
  }
  isMediaPickerOpen.value = false;
}

async function openEmbedDialog(): Promise<void> {
  const activeEditor = editor.value;
  if (!activeEditor || buttonDisabled.value) return;
  const attrs = activeEditor.getAttributes(STRUCTURED_EMBED_NODE_NAME);
  const parsed = StructuredEmbedNodeAttrsSchema.safeParse(attrs);
  embedUrl.value = parsed.success ? parsed.data.url : "";
  isEmbedDialogOpen.value = true;
  await nextTick();
  document
    .querySelector<HTMLInputElement>("[data-cms-embed-url-input]")
    ?.focus();
}

function closeEmbedDialog(): void {
  isEmbedDialogOpen.value = false;
}

function applyEmbed(): void {
  const activeEditor = editor.value;
  if (!activeEditor) return;
  const url = embedUrl.value.trim();
  if (!url) return;

  const attrs = StructuredEmbedNodeAttrsSchema.parse({
    provider: inferEmbedProvider(url),
    url,
  });
  const chain = activeEditor.chain().focus();
  if (activeEditor.isActive(STRUCTURED_EMBED_NODE_NAME)) {
    chain.updateAttributes(STRUCTURED_EMBED_NODE_NAME, attrs).run();
  } else {
    chain
      .insertContent({
        type: STRUCTURED_EMBED_NODE_NAME,
        attrs,
      })
      .run();
  }
  closeEmbedDialog();
}

function clearFormatting(): void {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run();
}

async function openLinkDialog(): Promise<void> {
  const activeEditor = editor.value;
  if (!activeEditor) return;
  const attrs = activeEditor.getAttributes("link");
  linkHref.value = typeof attrs.href === "string" ? attrs.href : "";
  linkOpenInNewTab.value = attrs.target === "_blank";
  isLinkDialogOpen.value = true;
  await nextTick();
  document
    .querySelector<HTMLInputElement>("[data-cms-link-href-input]")
    ?.focus();
}

function closeLinkDialog(): void {
  isLinkDialogOpen.value = false;
}

function applyLink(): void {
  const activeEditor = editor.value;
  if (!activeEditor) return;
  const trimmed = linkHref.value.trim();
  if (!trimmed) {
    return;
  }
  activeEditor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({
      href: trimmed,
      target: linkOpenInNewTab.value ? "_blank" : null,
      rel: linkOpenInNewTab.value ? "noopener noreferrer nofollow" : null,
    })
    .run();
  closeLinkDialog();
}

function removeLink(): void {
  editor.value?.chain().focus().extendMarkRange("link").unsetLink().run();
  closeLinkDialog();
}

const historyButtons = computed<ToolbarButton[]>(() => [
  {
    id: "undo",
    label: t("cms.richText.undo"),
    title: t("cms.richText.undo"),
    icon: studioIcons.undo,
    action: undo,
    disabled: () => !canUndo(),
  },
  {
    id: "redo",
    label: t("cms.richText.redo"),
    title: t("cms.richText.redo"),
    icon: studioIcons.redo,
    action: redo,
    disabled: () => !canRedo(),
  },
]);

const styleButtons = computed<ToolbarButton[]>(() => [
  {
    id: "paragraph",
    label: "P",
    title: t("cms.richText.paragraph"),
    action: () => setTextStyle("paragraph"),
    active: () => isStyleActive("paragraph"),
  },
  {
    id: "h2",
    label: "H2",
    title: t("cms.richText.heading2"),
    action: () => setTextStyle("h2"),
    active: () => isStyleActive("h2"),
  },
  {
    id: "h3",
    label: "H3",
    title: t("cms.richText.heading3"),
    action: () => setTextStyle("h3"),
    active: () => isStyleActive("h3"),
  },
  {
    id: "h4",
    label: "H4",
    title: t("cms.richText.heading4"),
    action: () => setTextStyle("h4"),
    active: () => isStyleActive("h4"),
  },
  {
    id: "blockquote",
    label: t("cms.richText.blockquote"),
    title: t("cms.richText.blockquote"),
    action: () => setTextStyle("blockquote"),
    active: () => isStyleActive("blockquote"),
  },
]);

const markButtons = computed<ToolbarButton[]>(() => [
  {
    id: "bold",
    label: "B",
    title: t("cms.richText.bold"),
    icon: studioIcons.bold,
    action: () => toggleMark("bold"),
    active: () => isMarkActive("bold"),
  },
  {
    id: "italic",
    label: "I",
    title: t("cms.richText.italic"),
    icon: studioIcons.italic,
    action: () => toggleMark("italic"),
    active: () => isMarkActive("italic"),
  },
  {
    id: "strike",
    label: "S",
    title: t("cms.richText.strikethrough"),
    action: () => toggleMark("strike"),
    active: () => isMarkActive("strike"),
  },
  {
    id: "underline",
    label: "U",
    title: t("cms.richText.underline"),
    action: () => toggleMark("underline"),
    active: () => isMarkActive("underline"),
  },
  {
    id: "code",
    label: t("cms.richText.inlineCode"),
    title: t("cms.richText.inlineCode"),
    icon: studioIcons.code,
    action: () => toggleMark("code"),
    active: () => isMarkActive("code"),
  },
]);

const structureButtons = computed<ToolbarButton[]>(() => [
  {
    id: "bullet-list",
    label: "UL",
    title: t("cms.richText.bulletedList"),
    action: toggleBulletList,
    active: () => editor.value?.isActive("bulletList") ?? false,
  },
  {
    id: "ordered-list",
    label: "1.",
    title: t("cms.richText.numberedList"),
    action: toggleOrderedList,
    active: () => editor.value?.isActive("orderedList") ?? false,
  },
  {
    id: "divider",
    label: "HR",
    title: t("cms.richText.divider"),
    action: insertDivider,
  },
]);

const blockButtons = computed<ToolbarButton[]>(() => [
  {
    id: "image",
    label: t("cms.richText.image"),
    title: t("cms.richText.image"),
    icon: studioIcons.image,
    action: openMediaPicker,
    active: () => editor.value?.isActive(STRUCTURED_IMAGE_NODE_NAME) ?? false,
  },
  {
    id: "embed",
    label: t("cms.richText.embed"),
    title: t("cms.richText.embed"),
    icon: studioIcons.externalLink,
    action: openEmbedDialog,
    active: () => editor.value?.isActive(STRUCTURED_EMBED_NODE_NAME) ?? false,
  },
]);

function buttonClass(button: ToolbarButton): string {
  const active = button.active?.() === true;
  return cn(
    "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
    active
      ? "bg-card/60 text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

function isButtonDisabled(button: ToolbarButton): boolean {
  if (buttonDisabled.value) return true;
  return button.disabled?.() === true;
}

function handleToolbarButton(button: ToolbarButton): void {
  if (isButtonDisabled(button)) {
    return;
  }
  button.action();
}

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<template>
  <div class="rounded-md border border-border bg-card/20">
    <div
      class="relative flex flex-wrap items-center gap-1 border-b border-border px-2 py-1"
    >
      <div
        v-for="group in [
          historyButtons,
          styleButtons,
          markButtons,
          structureButtons,
          blockButtons,
        ]"
        :key="group[0]?.id"
        class="flex items-center gap-1 border-r border-border/60 pr-1 last:border-r-0 last:pr-0"
      >
        <button
          v-for="button in group"
          :key="button.id"
          type="button"
          :class="buttonClass(button)"
          :disabled="isButtonDisabled(button)"
          :title="button.title"
          :aria-label="button.title"
          :aria-pressed="button.active ? button.active() : undefined"
          :data-testid="`structured-text-${button.id}`"
          @mousedown.prevent
          @click="handleToolbarButton(button)"
        >
          <span
            v-if="button.icon"
            :class="[button.icon, 'size-3.5']"
            aria-hidden="true"
          />
          <span v-else>{{ button.label }}</span>
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button
          type="button"
          :class="
            buttonClass({
              id: 'link',
              label: t('cms.richText.editLink'),
              title: t('cms.richText.editLink'),
              icon: studioIcons.link,
              action: openLinkDialog,
              active: isLinkActive,
            })
          "
          :disabled="buttonDisabled"
          :title="t('cms.richText.editLink')"
          :aria-label="t('cms.richText.editLink')"
          :aria-pressed="isLinkActive()"
          data-testid="structured-text-link"
          @mousedown.prevent
          @click="openLinkDialog"
        >
          <span :class="[studioIcons.link, 'size-3.5']" aria-hidden="true" />
        </button>
        <button
          type="button"
          :class="
            buttonClass({
              id: 'unlink',
              label: t('cms.richText.removeLink'),
              title: t('cms.richText.removeLink'),
              icon: studioIcons.unlink,
              action: removeLink,
            })
          "
          :disabled="buttonDisabled || !isLinkActive()"
          :title="t('cms.richText.removeLink')"
          :aria-label="t('cms.richText.removeLink')"
          data-testid="structured-text-unlink"
          @mousedown.prevent
          @click="removeLink"
        >
          <span :class="[studioIcons.unlink, 'size-3.5']" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          :disabled="buttonDisabled"
          :title="t('cms.richText.clearFormatting')"
          :aria-label="t('cms.richText.clearFormatting')"
          data-testid="structured-text-clear-formatting"
          @mousedown.prevent
          @click="clearFormatting"
        >
          {{ t("cms.richText.clear") }}
        </button>
      </div>

      <div
        v-if="isLinkDialogOpen"
        class="absolute left-2 top-[calc(100%+0.5rem)] z-20 grid w-80 gap-3 rounded-md border border-border bg-popover p-3 shadow-xl"
        data-testid="structured-text-link-dialog"
      >
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {{ t("cms.richText.url") }}
          <input
            v-model="linkHref"
            data-cms-link-href-input
            data-testid="structured-text-link-href"
            class="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
            placeholder="https://example.com"
            @keydown.enter.prevent="applyLink"
            @keydown.esc.prevent="closeLinkDialog"
          />
        </label>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            v-model="linkOpenInNewTab"
            type="checkbox"
            class="size-4"
            data-testid="structured-text-link-new-tab"
          />
          {{ t("cms.richText.openNewTab") }}
        </label>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="closeLinkDialog"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            :disabled="buttonDisabled || !isLinkActive()"
            @click="removeLink"
          >
            {{ t("cms.field.remove") }}
          </button>
          <button
            type="button"
            class="h-8 rounded-md border border-border bg-card/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-card/60 disabled:pointer-events-none disabled:opacity-40"
            :disabled="buttonDisabled || linkHref.trim().length === 0"
            data-testid="structured-text-link-apply"
            @click="applyLink"
          >
            {{ t("cms.richText.apply") }}
          </button>
        </div>
      </div>

      <div
        v-if="isEmbedDialogOpen"
        class="absolute left-2 top-[calc(100%+0.5rem)] z-20 grid w-80 gap-3 rounded-md border border-border bg-popover p-3 shadow-xl"
        data-testid="structured-text-embed-dialog"
      >
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {{ t("cms.richText.embedUrl") }}
          <input
            v-model="embedUrl"
            data-cms-embed-url-input
            data-testid="structured-text-embed-url"
            class="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
            placeholder="https://"
            @keydown.enter.prevent="applyEmbed"
            @keydown.esc.prevent="closeEmbedDialog"
          />
        </label>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="closeEmbedDialog"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="h-8 rounded-md border border-border bg-card/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-card/60 disabled:pointer-events-none disabled:opacity-40"
            :disabled="buttonDisabled || embedUrl.trim().length === 0"
            data-testid="structured-text-embed-apply"
            @click="applyEmbed"
          >
            {{ t("cms.richText.apply") }}
          </button>
        </div>
      </div>
    </div>
    <EditorContent
      :editor="editor"
      :class="
        cn(
          'cms-structured-text-editor px-3 py-2 text-sm text-foreground outline-none',
          minHeightClass,
          disabled ? 'opacity-70' : '',
        )
      "
      :aria-label="t('cms.richText.editorLabel')"
      spellcheck="true"
    />
    <div
      class="flex items-center justify-end border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground/75"
      data-testid="structured-text-stats"
    >
      {{ statsLabel }}
    </div>
    <MediaPickerDialog
      v-model:open="isMediaPickerOpen"
      :title="t('cms.richText.chooseImage')"
      :description="t('cms.richText.chooseImageDescription')"
      media-type="image"
      @select="handleMediaSelect"
    />
  </div>
</template>

<style scoped>
.cms-structured-text-editor :deep(.ProseMirror) {
  min-height: inherit;
  border: 0;
  box-shadow: none;
  outline: none;
}

.cms-structured-text-editor :deep(.ProseMirror:focus),
.cms-structured-text-editor :deep(.ProseMirror:focus-visible),
.cms-structured-text-editor :deep(.ProseMirror-focused) {
  box-shadow: none;
  outline: none;
}

/* Keep selected text visible despite the admin body's transparent selection reset. */
.cms-structured-text-editor :deep(.ProseMirror)::selection,
.cms-structured-text-editor :deep(.ProseMirror) *::selection {
  background-color: color-mix(in oklch, var(--primary) 24%, transparent);
  color: var(--foreground);
}

.cms-structured-text-editor :deep(.ProseMirror)::-moz-selection,
.cms-structured-text-editor :deep(.ProseMirror) *::-moz-selection {
  background-color: color-mix(in oklch, var(--primary) 24%, transparent);
  color: var(--foreground);
}

.cms-structured-text-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: var(--muted-foreground);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.cms-structured-text-editor :deep(.ProseMirror h2) {
  font-size: 1.15rem;
  font-weight: 650;
}

.cms-structured-text-editor :deep(.ProseMirror h3) {
  font-size: 1rem;
  font-weight: 650;
}

.cms-structured-text-editor :deep(.ProseMirror ul),
.cms-structured-text-editor :deep(.ProseMirror ol) {
  margin-left: 1.25rem;
}
</style>
