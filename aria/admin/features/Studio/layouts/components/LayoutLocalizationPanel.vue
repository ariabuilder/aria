<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LocalizationConfirmationDialog from "@/features/Studio/core/components/LocalizationConfirmationDialog.vue";

type Row = {
  locale: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  publishReady: boolean;
  direction?: "ltr" | "rtl";
  meta: { publishedVersion: string | null; currentVersion: string } | null;
  state: {
    publication: "missing" | "draft" | "published";
    localeEnabled: boolean;
    hasUnpublishedChanges: boolean;
    draftFreshness: "current" | "outdated" | null;
    publishedFreshness: "current" | "outdated" | null;
    suppressedBy: string[];
  };
};
type Field = { path: string; kind: "text" | "rich-text" | "media-alt" };
type Editor = {
  locale: string;
  label: string;
  expectedCurrentVersion: string;
  sourceVersion: string;
  dsl: Record<string, unknown>;
  sourceDsl: Record<string, unknown>;
  manifest: Field[];
  translatedPaths: string[];
  sourceManifestHash: string;
  sourceStructureHash: string;
  contentHash: string | null;
};

const props = defineProps<{ layoutId: string }>();
const rows = ref<Row[]>([]);
const editor = ref<Editor | null>(null);
const editorBaseline = ref<string | null>(null);
const confirmDiscardEditor = ref(false);
const busy = ref<string | null>(null);
const pendingLifecycleAction = ref<{
  kind: "publish" | "unpublish" | "rebase" | "delete";
  row: Row;
} | null>(null);
const editable = computed(() => rows.value.filter((row) => !row.isDefault));
const hasUnsavedEditorChanges = computed(() =>
  Boolean(editor.value) &&
  editorBaseline.value !==
    JSON.stringify({
      dsl: editor.value?.dsl,
      translatedPaths: editor.value?.translatedPaths,
    }),
);

function clearEditor() {
  editor.value = null;
  editorBaseline.value = null;
  confirmDiscardEditor.value = false;
}
function requestCloseEditor() {
  if (hasUnsavedEditorChanges.value) {
    confirmDiscardEditor.value = true;
    return;
  }
  clearEditor();
}

function stateLabel(row: Row): string {
  if (!row.state.localeEnabled) return "Disabled";
  if (row.state.publication === "missing") return "Missing";
  const labels = [
    row.state.publication === "published" ? "Published" : "Draft",
  ];
  if (row.state.hasUnpublishedChanges) labels.push("draft changes");
  if (row.state.draftFreshness === "outdated") labels.push("needs rebase");
  return labels.join(" · ");
}

function location(path: string): { nodeId: string; prop: string } | null {
  const match = /^node:([^:]+):prop:([A-Za-z0-9_-]+)$/.exec(path);
  if (!match) return null;
  try {
    return { nodeId: decodeURIComponent(match[1]), prop: match[2] };
  } catch {
    return null;
  }
}
function nodeAt(
  dsl: Record<string, unknown>,
  id: string,
): (Record<string, unknown> & { props?: Record<string, unknown> }) | null {
  const walk = (
    nodes: unknown,
  ): (Record<string, unknown> & { props?: Record<string, unknown> }) | null => {
    if (!Array.isArray(nodes)) return null;
    for (const item of nodes) {
      if (!item || typeof item !== "object") continue;
      const node = item as Record<string, unknown> & {
        props?: Record<string, unknown>;
      };
      if (node.id === id) return node;
      const child = walk(node.children);
      if (child) return child;
    }
    return null;
  };
  const direct = walk(dsl.nodes);
  if (direct) return direct;
  const slots = dsl.slots;
  if (!Array.isArray(slots)) return null;
  for (const slot of slots) {
    const node = walk(
      slot && typeof slot === "object"
        ? (slot as Record<string, unknown>).defaultContent
        : undefined,
    );
    if (node) return node;
  }
  return null;
}
function valueAt(dsl: Record<string, unknown>, path: string): string {
  const target = location(path);
  const value = target
    ? nodeAt(dsl, target.nodeId)?.props?.[target.prop]
    : null;
  return typeof value === "string" ? value : "";
}
const fields = computed(
  () =>
    editor.value?.manifest.map((field) => ({
      ...field,
      label: field.path.replace(/^node:([^:]+):prop:/, "$1 · "),
      value: valueAt(editor.value!.dsl, field.path),
      source: valueAt(editor.value!.sourceDsl, field.path),
    })) ?? [],
);
function updateField(path: string, value: string) {
  if (!editor.value) return;
  const target = location(path);
  const node = target ? nodeAt(editor.value.dsl, target.nodeId) : null;
  if (!node?.props || !target) return;
  node.props[target.prop] = value;
  editor.value.translatedPaths = editor.value.manifest
    .filter(
      (field) =>
        valueAt(editor.value!.dsl, field.path) !==
        valueAt(editor.value!.sourceDsl, field.path),
    )
    .map((field) => field.path);
}
async function load() {
  const { data, error } = await actions.localization.layoutMatrix({
    layoutId: props.layoutId,
  });
  if (error)
    throw new Error(error.message ?? "Unable to load layout translations.");
  rows.value = (data ?? []) as Row[];
}
async function run(locale: string, work: () => Promise<void>) {
  busy.value = locale;
  try {
    await work();
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Localization request failed.",
    );
  } finally {
    busy.value = null;
  }
}
function create(row: Row) {
  return run(row.locale, async () => {
    const { error } = await actions.localization.createLayoutDraft({
      layoutId: props.layoutId,
      locale: row.locale,
    });
    if (error)
      throw new Error(error.message ?? "Unable to create layout draft.");
    toast.success(`${row.label} layout draft created`);
  });
}
function edit(row: Row) {
  return run(row.locale, async () => {
    const { data, error } = await actions.localization.getLayoutTranslation({
      layoutId: props.layoutId,
      locale: row.locale,
    });
    if (error || !data)
      throw new Error(error?.message ?? "Unable to load layout translation.");
    const value = data;
    editor.value = {
      locale: row.locale,
      label: row.label,
      expectedCurrentVersion: value.meta.currentVersion,
      sourceVersion: value.version.sourceVersion,
      dsl: value.version.dsl,
      sourceDsl: value.sourceDsl,
      manifest: value.manifest.entries,
      translatedPaths: value.version.translatedPaths,
      sourceManifestHash: value.version.sourceManifestHash,
      sourceStructureHash: value.version.sourceStructureHash,
      contentHash: value.version.contentHash,
    };
    editorBaseline.value = JSON.stringify({
      dsl: editor.value.dsl,
      translatedPaths: editor.value.translatedPaths,
    });
  });
}
function save() {
  if (!editor.value) return Promise.resolve();
  const value = editor.value;
  return run(value.locale, async () => {
    const { error } = await actions.localization.saveLayoutDraft({
      layoutId: props.layoutId,
      locale: value.locale,
      expectedCurrentVersion: value.expectedCurrentVersion,
      sourceVersion: value.sourceVersion,
      dsl: value.dsl,
      translatedPaths: value.translatedPaths,
      sourceManifestHash: value.sourceManifestHash,
      sourceStructureHash: value.sourceStructureHash,
      contentHash: value.contentHash,
    });
    if (error) throw new Error(error.message ?? "Unable to save layout draft.");
    clearEditor();
    toast.success(`${value.label} layout draft saved`);
  });
}
function publish(row: Row) {
  return run(row.locale, async () => {
    if (!row.meta) return;
    const { error } = await actions.localization.publishLayout({
      layoutId: props.layoutId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "publish",
    });
    if (error)
      throw new Error(error.message ?? "Unable to publish layout translation.");
    toast.success(`${row.label} layout published`);
  });
}
function unpublish(row: Row) {
  return run(row.locale, async () => {
    const { error } = await actions.localization.unpublishLayout({
      layoutId: props.layoutId,
      locale: row.locale,
      confirmation: "unpublish",
    });
    if (error)
      throw new Error(
        error.message ?? "Unable to unpublish layout translation.",
      );
    toast.success(`${row.label} layout unpublished`);
  });
}
function deleteTranslation(row: Row) {
  return run(row.locale, async () => {
    if (!row.meta) return;
    const { error } = await actions.localization.deleteLayout({
      layoutId: props.layoutId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "delete",
    });
    if (error)
      throw new Error(error.message ?? "Unable to delete layout translation.");
    clearEditor();
    toast.success(`${row.label} layout translation deleted`);
  });
}
function rebase(row: Row) {
  return run(row.locale, async () => {
    if (!row.meta) return;
    const { data, error } = await actions.localization.rebaseLayoutDraft({
      layoutId: props.layoutId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "rebase",
    });
    if (error)
      throw new Error(error.message ?? "Unable to rebase layout translation.");
    clearEditor();
    const dropped =
      (data as { droppedPaths?: string[] } | undefined)?.droppedPaths?.length ??
      0;
    toast.success(
      dropped
        ? `${row.label} layout rebased; ${dropped} fields need review`
        : `${row.label} layout rebased from the current source`,
    );
  });
}
async function confirmLifecycleAction() {
  const pending = pendingLifecycleAction.value;
  if (!pending) return;
  if (pending.kind === "publish") await publish(pending.row);
  if (pending.kind === "unpublish") await unpublish(pending.row);
  if (pending.kind === "rebase") await rebase(pending.row);
  if (pending.kind === "delete") await deleteTranslation(pending.row);
  pendingLifecycleAction.value = null;
}
const lifecycleDialog = computed(() => {
  const pending = pendingLifecycleAction.value;
  if (!pending) return null;
  if (pending.kind === "publish")
    return {
      title: `Publish ${pending.row.label} layout?`,
      description:
        "This makes the current localized layout live for eligible localized pages.",
      confirmLabel: "Publish",
      destructive: false,
    };
  if (pending.kind === "unpublish")
    return {
      title: `Unpublish ${pending.row.label} layout?`,
      description:
        "Localized pages will fall back to their pinned canonical layout revision.",
      confirmLabel: "Unpublish",
      destructive: true,
    };
  if (pending.kind === "rebase")
    return {
      title: `Rebase ${pending.row.label} layout?`,
      description:
        "This creates a new draft from the current source and keeps only compatible translated fields.",
      confirmLabel: "Rebase draft",
      destructive: false,
    };
  return {
    title: `Delete ${pending.row.label} layout?`,
    description:
      "This permanently deletes the unpublished locale draft and history.",
    confirmLabel: "Delete translation",
    destructive: true,
  };
});
onMounted(() => void load().catch((error) => toast.error(error.message)));
watch(
  () => props.layoutId,
  () => void load().catch((error) => toast.error(error.message)),
);
</script>

<template>
  <section
    class="rounded-lg border border-dashed border-border bg-sidebar p-4 space-y-4"
  >
    <div>
      <h2 class="m-0 text-sm font-semibold">Localization</h2>
      <p class="m-0 text-xs text-muted-foreground">
        Translate each shared layout independently. Published pages use the
        published locale layout when available.
      </p>
    </div>
    <div v-if="!editable.length" class="text-sm text-muted-foreground">
      Enable a non-default content language in Settings → Localization to add
      layout translations.
    </div>
    <div v-else class="space-y-2">
      <div v-for="row in editable" :key="row.locale">
        <div>
          <div class="font-medium text-sm">{{ row.label }}</div>
          <div class="text-xs text-muted-foreground">
            {{ row.locale }} · {{ row.direction ?? "ltr" }} ·
            {{ stateLabel(row) }}
          </div>
        </div>
        <div class="flex gap-2">
          <Button
            v-if="!row.meta"
            size="sm"
            :disabled="!row.enabled || busy === row.locale"
            @click="create(row)"
            >Create draft</Button
          ><template v-else
            ><Button
              size="sm"
              variant="outline"
              :disabled="busy === row.locale"
              @click="edit(row)"
              >Edit</Button
            ><Button
              v-if="!row.meta.publishedVersion"
              size="sm"
              :disabled="!row.publishReady || busy === row.locale"
              :title="
                row.publishReady
                  ? undefined
                  : 'Rebase this translation on the latest layout first.'
              "
              @click="pendingLifecycleAction = { kind: 'publish', row }"
              >Publish</Button
            ><Button
              v-else
              size="sm"
              variant="outline"
              :disabled="busy === row.locale"
              @click="pendingLifecycleAction = { kind: 'unpublish', row }"
              >Unpublish</Button
            ><Button
              v-if="!row.meta.publishedVersion"
              size="sm"
              variant="ghost"
              :disabled="busy === row.locale"
              @click="pendingLifecycleAction = { kind: 'delete', row }"
              >Delete</Button
            ></template
          >
        </div>
      </div>
    </div>
    <form
      v-if="editor"
      class="space-y-3 border-t border-border/60 pt-4"
      @submit.prevent="save"
    >
      <div class="flex items-center justify-between">
        <div>
          <h3 class="m-0 text-sm font-semibold">{{ editor.label }} layout</h3>
          <p class="m-0 text-xs text-muted-foreground">
            Source {{ editor.sourceVersion }}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" @click="requestCloseEditor"
          >Cancel</Button
        >
      </div>
      <div v-for="field in fields" :key="field.path" class="space-y-1">
        <Label>{{ field.label }}</Label
        ><Textarea
          v-if="field.kind === 'rich-text'"
          :model-value="field.value"
          @update:model-value="updateField(field.path, String($event))"
        /><Input
          v-else
          :model-value="field.value"
          @update:model-value="updateField(field.path, String($event))"
        />
        <p class="m-0 text-xs text-muted-foreground">
          Source: {{ field.source || "—" }}
        </p>
      </div>
      <p v-if="!fields.length" class="m-0 text-xs text-muted-foreground">
        This layout has no text or image alt fields exposed for localization.
      </p>
      <div class="flex justify-end">
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            :disabled="busy === editor.locale"
            @click="
              pendingLifecycleAction = {
                kind: 'rebase',
                row: rows.find((row) => row.locale === editor!.locale)!,
              }
            "
            >Rebase from source</Button
          >
          <Button type="submit" :disabled="busy === editor.locale"
            >Save layout draft</Button
          >
        </div>
      </div>
    </form>
    <LocalizationConfirmationDialog
      v-if="pendingLifecycleAction && lifecycleDialog"
      :open="true"
      :title="lifecycleDialog.title"
      :description="lifecycleDialog.description"
      :confirm-label="lifecycleDialog.confirmLabel"
      :destructive="lifecycleDialog.destructive"
      :busy="busy === pendingLifecycleAction.row.locale"
      @update:open="
        (open) => {
          if (!open) pendingLifecycleAction = null;
        }
      "
      @confirm="confirmLifecycleAction"
    />
    <LocalizationConfirmationDialog
      v-if="confirmDiscardEditor"
      :open="true"
      title="Discard unsaved translation changes?"
      description="Your edits to this localized layout draft have not been saved."
      confirm-label="Discard changes"
      :destructive="true"
      :busy="false"
      @update:open="
        (open) => {
          if (!open) confirmDiscardEditor = false;
        }
      "
      @confirm="clearEditor"
    />
  </section>
</template>
