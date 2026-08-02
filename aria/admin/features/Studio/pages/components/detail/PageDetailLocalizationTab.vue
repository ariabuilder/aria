<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LocalizationConfirmationDialog from "@/features/Studio/core/components/LocalizationConfirmationDialog.vue";

type MatrixRow = {
  locale: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  ownsRoute: boolean;
  publishReady: boolean;
  direction?: "ltr" | "rtl";
  meta: {
    draftVersion: string;
    publishedVersion: string | null;
    currentVersion: string;
    updatedAt: string;
  } | null;
  state: {
    publication: "missing" | "draft" | "published";
    localeEnabled: boolean;
    hasUnpublishedChanges: boolean;
    draftFreshness: "current" | "outdated" | null;
    publishedFreshness: "current" | "outdated" | null;
    suppressedBy: string[];
  };
};

type TranslationEditor = {
  locale: string;
  label: string;
  expectedCurrentVersion: string;
  sourceVersion: string;
  pathname: string;
  ownsRoute: boolean;
  slug: string | null;
  seo: {
    title: string | null;
    description: string | null;
    canonicalPath: string | null;
    noindex: boolean;
    nofollow: boolean;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
  };
  dsl: Record<string, unknown>;
  translatedPaths: string[];
  sourceManifestHash: string;
  sourceStructureHash: string;
  layoutId: string | null;
  fallbackLayoutVersion: string | null;
  contentHash: string | null;
  sourceDsl: Record<string, unknown>;
  manifest: Array<{
    path: string;
    kind:
      | "text"
      | "rich-text"
      | "plain-url"
      | "head-meta"
      | "media-alt"
      | "access-prompt";
  }>;
};

const props = defineProps<{
  pageId?: string;
  pageSlug?: string;
  disabled?: boolean;
}>();

const rows = ref<MatrixRow[]>([]);
const isLoading = ref(false);
const busyLocale = ref<string | null>(null);
const pathnameByLocale = ref<Record<string, string>>({});
const editor = ref<TranslationEditor | null>(null);
const editorBaseline = ref<string | null>(null);
const confirmDiscardEditor = ref(false);
const pendingLifecycleAction = ref<{
  kind: "publish" | "unpublish" | "rebase" | "delete";
  row: MatrixRow;
} | null>(null);

const editableRows = computed(() => rows.value.filter((row) => !row.isDefault));
const hasUnsavedEditorChanges = computed(() =>
  Boolean(editor.value) &&
  editorBaseline.value !==
    JSON.stringify({
      pathname: editor.value?.pathname,
      slug: editor.value?.slug,
      seo: editor.value?.seo,
      dsl: editor.value?.dsl,
      translatedPaths: editor.value?.translatedPaths,
    }),
);

function clearEditor(): void {
  editor.value = null;
  editorBaseline.value = null;
  confirmDiscardEditor.value = false;
}

function requestCloseEditor(): void {
  if (hasUnsavedEditorChanges.value) {
    confirmDiscardEditor.value = true;
    return;
  }
  clearEditor();
}

function stateLabel(row: MatrixRow): string {
  if (!row.state.localeEnabled) return "Disabled";
  if (row.state.publication === "missing") return "Missing";
  const labels = [
    row.state.publication === "published" ? "Published" : "Draft",
  ];
  if (row.state.hasUnpublishedChanges) labels.push("draft changes");
  if (row.state.draftFreshness === "outdated") labels.push("needs rebase");
  if (row.state.suppressedBy.length)
    labels.push(`blocked: ${row.state.suppressedBy.join(", ")}`);
  return labels.join(" · ");
}

function locationForPath(
  path: string,
): { nodeId: string; prop: string } | null {
  const match = /^node:([^:]+):prop:([A-Za-z0-9_-]+)$/.exec(path);
  if (!match) return null;
  try {
    return { nodeId: decodeURIComponent(match[1]), prop: match[2] };
  } catch {
    return null;
  }
}

function findNode(
  dsl: Record<string, unknown>,
  nodeId: string,
): (Record<string, unknown> & { props?: Record<string, unknown> }) | null {
  const walk = (
    nodes: unknown,
  ): (Record<string, unknown> & { props?: Record<string, unknown> }) | null => {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown> & {
        props?: Record<string, unknown>;
      };
      if (record.id === nodeId) return record;
      const child = walk(record.children);
      if (child) return child;
    }
    return null;
  };
  return walk(dsl.nodes);
}

function valueAt(dsl: Record<string, unknown>, path: string): string {
  const location = locationForPath(path);
  if (!location) return "";
  const value = findNode(dsl, location.nodeId)?.props?.[location.prop];
  return typeof value === "string" ? value : "";
}

const translationFields = computed(() => {
  if (!editor.value) return [];
  return editor.value.manifest.map((entry) => ({
    ...entry,
    id: `translation-field-${entry.path.replace(/[^A-Za-z0-9_-]/g, "-")}`,
    label: entry.path.replace(/^node:([^:]+):prop:/, "$1 · "),
    value: valueAt(editor.value!.dsl, entry.path),
    source: valueAt(editor.value!.sourceDsl, entry.path),
  }));
});

function updateTranslationField(path: string, value: string): void {
  if (!editor.value) return;
  const location = locationForPath(path);
  if (!location) return;
  const node = findNode(editor.value.dsl, location.nodeId);
  if (!node || !node.props || typeof node.props !== "object") return;
  node.props[location.prop] = value;
  editor.value.translatedPaths = editor.value.manifest
    .filter(
      (entry) =>
        valueAt(editor.value!.dsl, entry.path) !==
        valueAt(editor.value!.sourceDsl, entry.path),
    )
    .map((entry) => entry.path);
}

function proposedPath(row: MatrixRow): string {
  return (
    pathnameByLocale.value[row.locale] ??
    `/${props.pageSlug === "index" ? "" : (props.pageSlug ?? "")}`
  );
}

async function load(): Promise<void> {
  if (!props.pageId) return;
  isLoading.value = true;
  try {
    const { data, error } = await actions.localization.pageMatrix({
      pageId: props.pageId,
    });
    if (error) throw new Error(error.message ?? "Unable to load translations.");
    rows.value = (data ?? []) as MatrixRow[];
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to load translations.",
    );
  } finally {
    isLoading.value = false;
  }
}

async function createDraft(row: MatrixRow): Promise<void> {
  if (!props.pageId) return;
  busyLocale.value = row.locale;
  try {
    const { error } = await actions.localization.createPageDraft({
      pageId: props.pageId,
      locale: row.locale,
      pathname: proposedPath(row),
    });
    if (error)
      throw new Error(error.message ?? "Unable to create translation draft.");
    toast.success(`${row.label} draft created`);
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Unable to create translation draft.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function edit(row: MatrixRow): Promise<void> {
  if (!props.pageId || !row.meta) return;
  busyLocale.value = row.locale;
  try {
    const { data, error } = await actions.localization.getPageTranslation({
      pageId: props.pageId,
      locale: row.locale,
    });
    if (error || !data)
      throw new Error(error?.message ?? "Unable to load translation.");
    const value = data;
    editor.value = {
      locale: row.locale,
      label: row.label,
      expectedCurrentVersion: value.meta.currentVersion,
      sourceVersion: value.version.sourceVersion,
      pathname: value.route?.pathname ?? proposedPath(row),
      ownsRoute: row.ownsRoute,
      slug: value.version.slug,
      seo: { ...value.version.seo },
      dsl: value.version.dsl,
      translatedPaths: [...value.version.translatedPaths],
      sourceManifestHash: value.version.sourceManifestHash,
      sourceStructureHash: value.version.sourceStructureHash,
      layoutId: value.version.layoutId,
      fallbackLayoutVersion: value.version.fallbackLayoutVersion,
      contentHash: value.version.contentHash,
      sourceDsl: value.sourceDsl,
      manifest: value.manifest.entries,
    };
    editorBaseline.value = JSON.stringify({
      pathname: editor.value.pathname,
      slug: editor.value.slug,
      seo: editor.value.seo,
      dsl: editor.value.dsl,
      translatedPaths: editor.value.translatedPaths,
    });
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to load translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function saveEditor(): Promise<void> {
  if (!props.pageId || !editor.value) return;
  const value = editor.value;
  busyLocale.value = value.locale;
  try {
    const { error } = await actions.localization.savePageDraft({
      pageId: props.pageId,
      locale: value.locale,
      expectedCurrentVersion: value.expectedCurrentVersion,
      sourceVersion: value.sourceVersion,
      pathname: value.ownsRoute ? value.pathname : null,
      slug: value.slug,
      accessPromptTitle: null,
      accessPromptDescription: null,
      seo: value.seo,
      dsl: value.dsl,
      translatedPaths: value.translatedPaths,
      sourceManifestHash: value.sourceManifestHash,
      sourceStructureHash: value.sourceStructureHash,
      layoutId: value.layoutId,
      fallbackLayoutVersion: value.fallbackLayoutVersion,
      contentHash: value.contentHash,
    });
    if (error) throw new Error(error.message ?? "Unable to save translation.");
    toast.success(`${value.label} draft saved`);
    clearEditor();
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to save translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function publish(row: MatrixRow): Promise<void> {
  if (!props.pageId || !row.meta) return;
  busyLocale.value = row.locale;
  try {
    const { error } = await actions.localization.publishPage({
      pageId: props.pageId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "publish",
    });
    if (error)
      throw new Error(error.message ?? "Unable to publish translation.");
    toast.success(`${row.label} translation published`);
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to publish translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function unpublish(row: MatrixRow): Promise<void> {
  if (!props.pageId || !row.meta) return;
  busyLocale.value = row.locale;
  try {
    const { error } = await actions.localization.unpublishPage({
      pageId: props.pageId,
      locale: row.locale,
      confirmation: "unpublish",
    });
    if (error)
      throw new Error(error.message ?? "Unable to unpublish translation.");
    toast.success(`${row.label} translation unpublished`);
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Unable to unpublish translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function deleteTranslation(row: MatrixRow): Promise<void> {
  if (!props.pageId || !row.meta) return;
  busyLocale.value = row.locale;
  try {
    const { error } = await actions.localization.deletePage({
      pageId: props.pageId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "delete",
    });
    if (error)
      throw new Error(error.message ?? "Unable to delete translation.");
    clearEditor();
    toast.success(`${row.label} translation deleted`);
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to delete translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function rebase(row: MatrixRow): Promise<void> {
  if (!props.pageId || !row.meta) return;
  busyLocale.value = row.locale;
  try {
    const { data, error } = await actions.localization.rebasePageDraft({
      pageId: props.pageId,
      locale: row.locale,
      expectedCurrentVersion: row.meta.currentVersion,
      confirmation: "rebase",
    });
    if (error)
      throw new Error(error.message ?? "Unable to rebase translation.");
    const dropped =
      (data as { droppedPaths?: string[] } | undefined)?.droppedPaths?.length ??
      0;
    clearEditor();
    toast.success(
      dropped
        ? `${row.label} rebased; ${dropped} field${dropped === 1 ? "" : "s"} need review`
        : `${row.label} rebased from the current source`,
    );
    await load();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to rebase translation.",
    );
  } finally {
    busyLocale.value = null;
  }
}

async function confirmLifecycleAction(): Promise<void> {
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
  if (pending.kind === "publish") {
    return {
      title: `Publish ${pending.row.label} translation?`,
      description:
        "This makes the current localized draft public at its localized route.",
      confirmLabel: "Publish",
      destructive: false,
    };
  }
  if (pending.kind === "unpublish") {
    return {
      title: `Unpublish ${pending.row.label} translation?`,
      description:
        "The localized route will stop serving, but the draft remains in Studio.",
      confirmLabel: "Unpublish",
      destructive: true,
    };
  }
  if (pending.kind === "rebase") {
    return {
      title: `Rebase ${pending.row.label} translation?`,
      description:
        "This creates a new draft from the current source and keeps only translated fields that still exist.",
      confirmLabel: "Rebase draft",
      destructive: false,
    };
  }
  return {
    title: `Delete ${pending.row.label} translation?`,
    description:
      "This permanently deletes the unpublished locale draft and its history.",
    confirmLabel: "Delete translation",
    destructive: true,
  };
});

watch(
  () => props.pageId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <section class="max-w-4xl space-y-6">
    <header class="space-y-1">
      <h2 class="m-0 text-base font-semibold">Localization</h2>
      <p class="m-0 text-sm text-muted-foreground">
        Create immutable drafts from the canonical page, then publish each
        locale independently.
      </p>
    </header>

    <div
      v-if="isLoading"
      class="rounded-md border border-dashed p-5 text-sm text-muted-foreground"
    >
      Loading translations…
    </div>
    <div
      v-else-if="editableRows.length === 0"
      class="rounded-md border border-dashed p-5 text-sm text-muted-foreground"
    >
      Add and enable a non-default content language in Settings → Localization
      first.
    </div>
    <div v-else class="overflow-hidden rounded-md border border-border/70">
      <div
        v-for="row in editableRows"
        :key="row.locale"
        class="grid gap-3 border-b border-border/60 p-4 last:border-b-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.4fr)_auto] sm:items-end"
      >
        <div>
          <div class="font-medium">{{ row.label }}</div>
          <div class="text-xs text-muted-foreground">
            {{ row.locale }} · {{ row.direction ?? "ltr" }}
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ stateLabel(row) }}
          </div>
        </div>
        <div v-if="!row.meta && row.ownsRoute" class="space-y-1.5">
          <Label :for="`locale-path-${row.locale}`" class="text-xs"
            >Localized route</Label
          >
          <Input
            :id="`locale-path-${row.locale}`"
            :model-value="proposedPath(row)"
            :disabled="
              props.disabled || !row.enabled || busyLocale === row.locale
            "
            @update:model-value="pathnameByLocale[row.locale] = String($event)"
          />
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            v-if="!row.meta"
            size="sm"
            :disabled="
              props.disabled || !row.enabled || busyLocale === row.locale
            "
            @click="createDraft(row)"
            >Create draft</Button
          >
          <template v-else>
            <Button
              size="sm"
              variant="outline"
              :disabled="props.disabled || busyLocale === row.locale"
              @click="edit(row)"
              >Edit</Button
            >
            <Button
              v-if="!row.meta.publishedVersion"
              size="sm"
              :disabled="
                props.disabled || !row.publishReady || busyLocale === row.locale
              "
              :title="
                row.publishReady
                  ? undefined
                  : 'Publish the canonical source and rebase this translation first.'
              "
              @click="pendingLifecycleAction = { kind: 'publish', row }"
              >Publish</Button
            >
            <Button
              v-else
              size="sm"
              variant="outline"
              :disabled="props.disabled || busyLocale === row.locale"
              @click="pendingLifecycleAction = { kind: 'unpublish', row }"
              >Unpublish</Button
            >
            <Button
              v-if="!row.meta.publishedVersion"
              size="sm"
              variant="ghost"
              :disabled="props.disabled || busyLocale === row.locale"
              @click="pendingLifecycleAction = { kind: 'delete', row }"
              >Delete</Button
            >
          </template>
        </div>
      </div>
    </div>

    <form
      v-if="editor"
      class="space-y-5 rounded-md border border-border/70 bg-muted/20 p-4"
      @submit.prevent="saveEditor"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="m-0 text-sm font-semibold">
            {{ editor.label }} translation
          </h3>
          <p class="m-0 text-xs text-muted-foreground">
            Source {{ editor.sourceVersion }} · editing
            {{ editor.expectedCurrentVersion }}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          :disabled="busyLocale === editor.locale"
          @click="requestCloseEditor"
          >Cancel</Button
        >
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div v-if="editor.ownsRoute" class="space-y-1.5">
          <Label for="translation-route">Localized route</Label>
          <Input
            id="translation-route"
            v-model="editor.pathname"
            :disabled="props.disabled || busyLocale === editor.locale"
          />
        </div>
        <div class="space-y-1.5">
          <Label for="translation-title">SEO title</Label>
          <Input
            id="translation-title"
            v-model="editor.seo.title"
            :disabled="props.disabled || busyLocale === editor.locale"
          />
        </div>
        <div class="space-y-1.5 sm:col-span-2">
          <Label for="translation-description">SEO description</Label>
          <Input
            id="translation-description"
            v-model="editor.seo.description"
            :disabled="props.disabled || busyLocale === editor.locale"
          />
        </div>
        <div class="space-y-1.5">
          <Label for="translation-og-title">Open Graph title</Label>
          <Input
            id="translation-og-title"
            v-model="editor.seo.ogTitle"
            :disabled="props.disabled || busyLocale === editor.locale"
          />
        </div>
        <div class="space-y-1.5">
          <Label for="translation-og-image">Open Graph image</Label>
          <Input
            id="translation-og-image"
            v-model="editor.seo.ogImage"
            :disabled="props.disabled || busyLocale === editor.locale"
          />
        </div>
      </div>
      <div
        v-if="translationFields.length"
        class="space-y-3 border-t border-border/60 pt-4"
      >
        <div>
          <h4 class="m-0 text-sm font-semibold">Localized content</h4>
          <p class="m-0 text-xs text-muted-foreground">
            Only canonical text and image alt text can change here; structure
            stays pinned to the source version.
          </p>
        </div>
        <div
          v-for="field in translationFields"
          :key="field.path"
          class="space-y-1.5"
        >
          <Label :for="field.id">{{ field.label }}</Label>
          <Textarea
            v-if="field.kind === 'rich-text'"
            :id="field.id"
            :model-value="field.value"
            :disabled="props.disabled || busyLocale === editor.locale"
            @update:model-value="
              updateTranslationField(field.path, String($event))
            "
          />
          <Input
            v-else
            :id="field.id"
            :model-value="field.value"
            :disabled="props.disabled || busyLocale === editor.locale"
            @update:model-value="
              updateTranslationField(field.path, String($event))
            "
          />
          <p class="m-0 text-xs text-muted-foreground">
            Source: {{ field.source || "—" }}
          </p>
        </div>
      </div>
      <p v-else class="m-0 text-xs text-muted-foreground">
        This source version has no text or image alt fields exposed for
        localization.
      </p>
      <div class="flex justify-end">
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            :disabled="props.disabled || busyLocale === editor.locale"
            @click="
              pendingLifecycleAction = {
                kind: 'rebase',
                row: rows.find((row) => row.locale === editor!.locale)!,
              }
            "
            >Rebase from source</Button
          >
          <Button
            type="submit"
            :disabled="props.disabled || busyLocale === editor.locale"
            >Save localized draft</Button
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
      :busy="busyLocale === pendingLifecycleAction.row.locale"
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
      description="Your edits to this localized draft have not been saved."
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
