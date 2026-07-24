<script setup lang="ts">
import { log } from "@/lib/utils/logger";
import { ref, watch, computed } from "vue";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StudioCodeEditor from "@/features/Studio/core/components/StudioCodeEditor.vue";
import ComponentContentTree from "./ComponentContentTree.vue";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import type {
  BuilderNode,
  ComponentDSL,
  ComponentPropSchemaDefinition,
  JsonObject,
  NodeDataSource,
} from "@/lib/types/nodes";
import {
  BuilderNodeSchema,
  ComponentDSLSchema,
  JsonObjectSchema,
  JsonValueSchema,
  isLockedComponent,
  isAriaComponent,
} from "@/lib/schemas/nodes";
import { cloneDeep } from "@/features/Core/utils/clone";
import {
  unwrapComponentExportActionResult,
} from "@/features/Studio/composer/composables/componentPropertiesActionResults";
import { unwrapStudioCrudActionResult } from "@/features/Studio/composer/composables/studioCrudActionResults";
import { useComponentGrouping } from "@/features/Studio/components/composables/useComponentGrouping";
import { useContentEditingPreferences } from "@/features/Studio/components/composables/useContentEditingPreferences";
import { useComponentResourceBank } from "@/features/Studio/components/composables/useComponentResourceBank";
import { studioIcons } from "@/lib/icons";
import {
  buildComponentContentStructure,
  contentFieldMatchesTypeFilter,
  flattenContentStructureFields,
  type ComponentBindingTarget,
  type ContentFieldTypeFilter,
} from "@/features/Studio/components/lib/componentContentStructure";
import type { ContentFieldCmsBinding } from "./ComponentContentFieldCmsPicker.vue";

interface Props {
  componentId: string;
}

interface ComponentUsageItem {
  id: string;
  kind: "page" | "layout";
  title: string;
  path: string;
  matchCount: number;
}

type ComponentDetailTab =
  | "overview"
  | "content"
  | "usage"
  | "advanced";

const props = defineProps<Props>();
const emit = defineEmits<{
  saved: [component: ComponentDSL];
}>();
const activeTab = defineModel<ComponentDetailTab>("activeTab", {
  default: "overview",
});
const draftNameModel = defineModel<string>("name", { default: "" });
const contentEditingPreferences = useContentEditingPreferences();
const componentResourceBank = useComponentResourceBank();

const isLoading = ref(false);
const isSaving = ref(false);
const isLoadingCode = ref(false);
const isLoadingUsage = ref(false);

const componentData = ref<ComponentDSL | null>(null);
const codeOutput = ref("");
const componentUsages = ref<ComponentUsageItem[]>([]);
const savedDraftSnapshot = ref("");
const loadedCodeFor = ref<string | null>(null);
const loadedUsageFor = ref<string | null>(null);

const draftName = ref("");
const draftDescription = ref("");
const draftCategory = ref("");
const draftGroupId = ref("");
const draftPropsJson = ref("[]");
const contentFieldValues = ref<Record<string, unknown>>({});
const contentBindingValues = ref<Record<string, ContentFieldCmsBinding>>({});
const schemaPropValues = ref<Record<string, unknown>>({});
const contentFieldTypeFilter = ref<ContentFieldTypeFilter>("all");

const contentFieldTypeFilterOptions: Array<{
  value: ContentFieldTypeFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "text", label: "Text" },
  { value: "links", label: "Links" },
  { value: "media", label: "Media" },
  { value: "actions", label: "Actions" },
];

const detailLabelClass = "text-sm! text-muted-foreground";
const detailHeadingClass = "text-sm font-medium text-muted-foreground";

const groupingSourceItems = computed(() =>
  componentData.value
    ? [
        {
          id: componentData.value.id,
          name: componentData.value.name,
          category: componentData.value.category,
        },
      ]
    : [],
);
const componentGrouping = useComponentGrouping(groupingSourceItems);

const categoryGroupOptions = computed(() =>
  componentGrouping.customGroups.value.map((group) => ({
    value: group.id,
    label: group.name,
  })),
);

const pageUsages = computed(() =>
  componentUsages.value.filter((usage) => usage.kind === "page"),
);

const layoutUsages = computed(() =>
  componentUsages.value.filter((usage) => usage.kind === "layout"),
);

const isLocked = computed(() => {
  if (!componentData.value) return false;
  return isLockedComponent(componentData.value);
});

const isFromAriaLibrary = computed(() => {
  if (!componentData.value) return false;
  return isAriaComponent(componentData.value);
});

const componentSourceLabel = computed(() =>
  isFromAriaLibrary.value ? "Aria Library" : "Personal",
);

const componentLockLabel = computed(() => {
  if (!isLocked.value) return "Editable";
  return isFromAriaLibrary.value ? "Library locked" : "Read-only";
});

const totalUsageReferences = computed(() =>
  componentUsages.value.reduce((total, usage) => total + usage.matchCount, 0),
);

const selectedGroupLabel = computed(() => {
  const groupId = draftGroupId.value;
  if (groupId) {
    const group = categoryGroupOptions.value.find((item) => item.value === groupId);
    if (group) return group.label;
  }
  return draftCategory.value || componentData.value?.category || "custom";
});

const updatedLabel = computed(() => {
  const updatedAt = componentData.value?.updatedAt;
  return updatedAt ? formatRelativeTime(updatedAt) : "No edits yet";
});

function switchTab(tab: ComponentDetailTab): void {
  activeTab.value = tab;
}

function normalizedBindingSnapshot() {
  return Object.fromEntries(
    Object.entries(contentBindingValues.value).map(([id, binding]) => [
      id,
      {
        collectionName: binding.collectionName,
        entryId: binding.entryId,
        fieldPath: binding.fieldPath,
        fullPath: binding.fullPath,
      },
    ]),
  );
}

function buildDraftSnapshot(): string {
  return JSON.stringify({
    name: draftName.value.trim(),
    description: draftDescription.value.trim(),
    category: draftCategory.value.trim(),
    groupId: draftGroupId.value,
    propsJson: draftPropsJson.value,
    content: contentFieldValues.value,
    bindings: normalizedBindingSnapshot(),
    schema: schemaPropValues.value,
  });
}

function updateSavedDraftSnapshot(): void {
  savedDraftSnapshot.value = buildDraftSnapshot();
}

const hasUnsavedChanges = computed(
  () => Boolean(savedDraftSnapshot.value) && buildDraftSnapshot() !== savedDraftSnapshot.value,
);

watch(draftName, (value) => {
  if (draftNameModel.value !== value) {
    draftNameModel.value = value;
  }
});

watch(draftNameModel, (value) => {
  if (draftName.value !== value) {
    draftName.value = value;
  }
});

const contentStructure = computed(() =>
  componentData.value
    ? buildComponentContentStructure({
        component: componentData.value,
        hideLockedFields:
          contentEditingPreferences.hideLockedContentFields.value,
      })
    : [],
);

const exposedContentFields = computed(() =>
  flattenContentStructureFields(contentStructure.value),
);

const exposedContentFieldCount = computed(
  () => exposedContentFields.value.length,
);

const visibleContentFieldCount = computed(
  () =>
    exposedContentFields.value.filter((field) =>
      contentFieldMatchesTypeFilter(field, contentFieldTypeFilter.value),
    ).length,
);

const contentPreviewValues = computed<Record<string, unknown>>(() =>
  Object.fromEntries(
    Object.entries(contentBindingValues.value).map(([id, binding]) => [
      id,
      binding.previewValue ?? "",
    ]),
  ),
);

function cloneNodes(nodes: BuilderNode[]): BuilderNode[] {
  return cloneDeep(nodes);
}

function cloneComponentNodes(nodes: unknown): BuilderNode[] {
  const parsedNodes = BuilderNodeSchema.array().safeParse(nodes ?? []);

  if (!parsedNodes.success) {
    log(
      "warn",
      "[Studio/ComponentProperties] Invalid component nodes before save",
      {
        source: "ComponentPropertiesPanel.saveChanges",
        slug: props.componentId,
        issues: parsedNodes.error.issues,
      },
    );
    return [];
  }

  return cloneNodes(parsedNodes.data);
}

function sortUsageItems(items: ComponentUsageItem[]): ComponentUsageItem[] {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "page" ? -1 : 1;
    }

    if (right.matchCount !== left.matchCount) {
      return right.matchCount - left.matchCount;
    }

    return left.title.localeCompare(right.title);
  });
}

function getNodeByPath(
  nodes: BuilderNode[],
  path: number[],
): BuilderNode | null {
  let current: BuilderNode | null = null;
  let currentChildren = nodes;

  for (const index of path) {
    current = currentChildren[index] || null;
    if (!current) {
      return null;
    }
    currentChildren = current.children || [];
  }

  return current;
}

function getRootNode(component: ComponentDSL): BuilderNode | null {
  return component.nodes?.[0] ?? null;
}

function initializeSchemaValues(
  component: ComponentDSL,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const rootNode = getRootNode(component);
  const rootProps = (rootNode?.props ?? {}) as Record<string, unknown>;

  for (const field of component.propSchema ?? []) {
    const existing = rootProps[field.name];
    if (existing !== undefined) {
      result[field.name] = existing;
      continue;
    }

    if (field.default !== undefined) {
      result[field.name] = field.default;
      continue;
    }

    if (field.type === "boolean") {
      result[field.name] = false;
      continue;
    }

    result[field.name] = "";
  }

  return result;
}

function initializeContentFieldValues(component: ComponentDSL): Record<string, unknown> {
  const fields = flattenContentStructureFields(
    buildComponentContentStructure({
      component,
      hideLockedFields: false,
    }),
  );
  return fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.id] = field.staticValue ?? "";
    return result;
  }, {});
}

function bindingForTarget(
  component: ComponentDSL,
  target: ComponentBindingTarget,
): ContentFieldCmsBinding | null {
  const targetNode =
    target.kind === "schema-prop"
      ? getRootNode(component)
      : getNodeByPath(component.nodes, target.path);
  const fullPath = targetNode?.dataSource?.bindings?.[target.propName];
  const collectionName = targetNode?.dataSource?.collection;
  if (!fullPath || !collectionName) {
    return null;
  }
  const prefix = `${collectionName}.`;
  return {
    collectionId: "",
    collectionName,
    entryId:
      typeof targetNode?.dataSource?.filter?.id === "string"
        ? targetNode.dataSource.filter.id
        : "",
    fieldPath: fullPath.startsWith(prefix)
      ? fullPath.slice(prefix.length)
      : fullPath,
    fullPath,
  };
}

function initializeContentBindingValues(
  component: ComponentDSL,
): Record<string, ContentFieldCmsBinding> {
  const fields = flattenContentStructureFields(
    buildComponentContentStructure({
      component,
      hideLockedFields: false,
    }),
  );
  return fields.reduce<Record<string, ContentFieldCmsBinding>>((result, field) => {
    const binding = bindingForTarget(component, field);
    if (binding) {
      result[field.id] = binding;
    }
    return result;
  }, {});
}

function setContentFieldValue(
  target: ComponentBindingTarget,
  value: unknown,
): void {
  contentFieldValues.value = {
    ...contentFieldValues.value,
    [target.id]: value,
  };
  if (target.kind === "schema-prop") {
    setSchemaPropValue(target.propName, value);
  }
}

function setContentBindingValue(
  target: ComponentBindingTarget,
  binding: ContentFieldCmsBinding | null,
): void {
  const next = { ...contentBindingValues.value };
  if (binding) {
    next[target.id] = binding;
  } else {
    delete next[target.id];
  }
  contentBindingValues.value = next;
}

function setSchemaPropValue(name: string, value: unknown): void {
  schemaPropValues.value = {
    ...schemaPropValues.value,
    [name]: value,
  };
}

function nextDataSourceForBinding(input: {
  current: NodeDataSource | undefined;
  propName: string;
  binding: ContentFieldCmsBinding | null;
}): NodeDataSource | undefined {
  const current = input.current ? { ...input.current } : undefined;
  const bindings = { ...(current?.bindings ?? {}) };
  if (!input.binding) {
    delete bindings[input.propName];
    if (!current) {
      return undefined;
    }
    if (Object.keys(bindings).length > 0) {
      current.bindings = bindings;
    } else {
      delete current.bindings;
    }
    return current;
  }
  return {
    ...(current ?? { type: "cms" as const }),
    type: "cms",
    collection: input.binding.collectionName,
    mode: "single",
    filter: input.binding.entryId
      ? ({ id: input.binding.entryId } as JsonObject)
      : current?.filter,
    bindings: {
      ...bindings,
      [input.propName]: input.binding.fullPath,
    },
  };
}

function applyContentBindings(nodes: BuilderNode[]): void {
  for (const field of exposedContentFields.value) {
    if (field.locked) {
      continue;
    }
    const targetNode =
      field.kind === "schema-prop"
        ? nodes[0] ?? null
        : getNodeByPath(nodes, field.path);
    if (!targetNode) {
      continue;
    }
    targetNode.dataSource = nextDataSourceForBinding({
      current: targetNode.dataSource,
      propName: field.propName,
      binding: contentBindingValues.value[field.id] ?? null,
    });
  }
}

function shouldShowSchemaField(field: ComponentPropSchemaDefinition): boolean {
  if (!field.condition) {
    return true;
  }

  const dependencyValue = schemaPropValues.value[field.condition.field];

  switch (field.condition.operator) {
    case "exists":
      return dependencyValue !== undefined && dependencyValue !== null;
    case "notEmpty":
      if (typeof dependencyValue === "string") {
        return dependencyValue.trim().length > 0;
      }
      return dependencyValue !== undefined && dependencyValue !== null;
    case "equals":
      return dependencyValue === field.condition.value;
    case "notEquals":
      return dependencyValue !== field.condition.value;
    default:
      return true;
  }
}

function resolveComponentGroupId(component: ComponentDSL): string {
  const effectiveAssignments = componentGrouping.buildEffectiveAssignments([
    {
      id: component.id,
      name: component.name,
      category: component.category,
    },
  ]);
  const assignedGroupId = effectiveAssignments[component.id];

  if (
    assignedGroupId &&
    componentGrouping.customGroups.value.some(
      (group) => group.id === assignedGroupId,
    )
  ) {
    return assignedGroupId;
  }

  return (
    componentGrouping.customGroups.value.find(
      (group) => group.name === component.category,
    )?.id ?? ""
  );
}

function getCategoryFromGroup(groupId: string): string {
  return (
    componentGrouping.customGroups.value.find((group) => group.id === groupId)
      ?.name ?? draftCategory.value
  );
}

function resetDraftFromComponent(component: ComponentDSL): void {
  draftName.value = component.name || component.id;
  draftDescription.value = component.description || "";
  draftCategory.value = component.category || "custom";
  draftGroupId.value = resolveComponentGroupId(component);
  draftPropsJson.value = JSON.stringify(component.propSchema || [], null, 2);
  schemaPropValues.value = initializeSchemaValues(component);
  contentFieldValues.value = initializeContentFieldValues(component);
  contentBindingValues.value = initializeContentBindingValues(component);
  updateSavedDraftSnapshot();
}

async function loadComponent(): Promise<void> {
  const targetId = props.componentId;
  const cached = componentResourceBank.getCachedComponent(targetId);

  if (cached) {
    componentData.value = cached.component;
    resetDraftFromComponent(cached.component);
    isLoading.value = false;
    if (!componentResourceBank.isInvalidated(cached)) return;
  } else {
    componentData.value = null;
    isLoading.value = true;
  }

  try {
    const entry = await componentResourceBank.loadComponent(targetId, {
      revalidate: Boolean(cached),
    });
    if (props.componentId !== targetId) return;

    componentData.value = entry.component;
    resetDraftFromComponent(entry.component);
  } finally {
    if (props.componentId === targetId) {
      isLoading.value = false;
    }
  }
}

async function loadCode(): Promise<void> {
  isLoadingCode.value = true;

  try {
    const parsedResult = unwrapComponentExportActionResult(
      await actions.importExport.exportItem({
        type: "component",
        id: props.componentId,
      }),
      "Failed to generate component code",
      {
        source: "ComponentPropertiesPanel.loadCode",
        componentId: props.componentId,
      },
    );

    if (!parsedResult.success) {
      codeOutput.value = "// Failed to generate component code";
      return;
    }

    codeOutput.value = parsedResult.data.content;
    loadedCodeFor.value = props.componentId;
  } finally {
    isLoadingCode.value = false;
  }
}

async function loadUsage(): Promise<void> {
  isLoadingUsage.value = true;

  try {
    const response = await actions.components.getUsage({
      componentId: props.componentId,
    });
    if (response.error) throw new Error(response.error.message);

    const items = (response.data?.items ?? []) as ComponentUsageItem[];
    componentUsages.value = sortUsageItems(items);
    loadedUsageFor.value = props.componentId;
  } finally {
    isLoadingUsage.value = false;
  }
}

async function saveChanges(): Promise<void> {
  if (!componentData.value || isSaving.value) return;

  isSaving.value = true;

  try {
    const updatedNodes = cloneComponentNodes(componentData.value.nodes);

    for (const field of exposedContentFields.value) {
      if (field.locked || field.kind !== "node-prop") {
        continue;
      }

      const target = getNodeByPath(updatedNodes, field.path);
      if (!target) continue;

      const value = contentFieldValues.value[field.id] ?? field.staticValue;
      const parsedValue = JsonValueSchema.safeParse(value);
      if (!parsedValue.success) {
        log(
          "warn",
          "[Studio/ComponentProperties] Skipping invalid content field value",
          {
            source: "ComponentPropertiesPanel.saveChanges",
            slug: props.componentId,
            field: field.propName,
            issues: parsedValue.error.issues,
          },
        );
        continue;
      }

      const propsRecord = JsonObjectSchema.parse(target.props ?? {});
      propsRecord[field.propName] = parsedValue.data;
      target.props = propsRecord;
    }

    const rootNode = updatedNodes[0];
    if (rootNode) {
      const rootProps = JsonObjectSchema.parse(rootNode.props ?? {});
      for (const field of componentData.value.propSchema ?? []) {
        if (!shouldShowSchemaField(field)) {
          continue;
        }

        if (schemaPropValues.value[field.name] !== undefined) {
          const parsedPropValue = JsonValueSchema.safeParse(
            schemaPropValues.value[field.name],
          );

          if (!parsedPropValue.success) {
            log(
              "warn",
              "[Studio/ComponentProperties] Skipping invalid schema prop value",
              {
                source: "ComponentPropertiesPanel.saveChanges",
                slug: props.componentId,
                field: field.name,
                issues: parsedPropValue.error.issues,
              },
            );
            continue;
          }

          rootProps[field.name] = parsedPropValue.data;
        }
      }
      rootNode.props = rootProps;
    }

    applyContentBindings(updatedNodes);

    let parsedPropSchema: ComponentDSL["propSchema"] =
      componentData.value.propSchema || [];
    try {
      const parsed = JSON.parse(draftPropsJson.value);
      parsedPropSchema = Array.isArray(parsed) ? parsed : parsedPropSchema;
    } catch {
      parsedPropSchema = componentData.value.propSchema || [];
    }

    const parsedUpdatedComponent = ComponentDSLSchema.safeParse({
      ...componentData.value,
      name: draftName.value.trim() || componentData.value.name,
      description: draftDescription.value.trim(),
      category:
        getCategoryFromGroup(draftGroupId.value).trim() ||
        draftCategory.value.trim() ||
        "custom",
      propSchema: parsedPropSchema,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    });

    if (!parsedUpdatedComponent.success) {
      log(
        "warn",
        "[Studio/ComponentProperties] Invalid component payload before updateItem",
        {
          source: "ComponentPropertiesPanel.saveChanges",
          slug: props.componentId,
          issues: parsedUpdatedComponent.error.issues,
        },
      );
      return;
    }

    const updateResult = unwrapStudioCrudActionResult(
      "update",
      await actions.updateItem({
        collection: "components",
        slug: props.componentId,
        data: JsonObjectSchema.parse(
          JSON.parse(JSON.stringify(parsedUpdatedComponent.data)),
        ),
      }),
      {
        source: "ComponentPropertiesPanel.saveChanges",
        slug: props.componentId,
      },
    );

    if (updateResult.success) {
      if (draftGroupId.value) {
        await componentGrouping.moveComponentToGroup(
          props.componentId,
          draftGroupId.value,
        );
      }
      componentData.value = parsedUpdatedComponent.data;
      componentResourceBank.updateCachedComponent(parsedUpdatedComponent.data);
      updateSavedDraftSnapshot();
      if (loadedCodeFor.value === props.componentId) {
        await loadCode();
      }
      emit("saved", parsedUpdatedComponent.data);
    }
  } finally {
    isSaving.value = false;
  }
}

async function copyCode(): Promise<void> {
  if (!codeOutput.value) return;
  await navigator.clipboard.writeText(codeOutput.value);
}

defineExpose({
  saveChanges,
  isLoading,
  isSaving,
  isLocked,
  hasUnsavedChanges,
});

watch(
  () => props.componentId,
  async () => {
    activeTab.value = "overview";
    codeOutput.value = "";
    componentUsages.value = [];
    loadedCodeFor.value = null;
    loadedUsageFor.value = null;
    await loadComponent();
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (tab === "advanced" && loadedCodeFor.value !== props.componentId) {
    void loadCode();
  }
  if (tab === "usage" && loadedUsageFor.value !== props.componentId) {
    void loadUsage();
  }
});

watch(
  () => componentGrouping.hasHydratedFromServer.value,
  (hasHydrated) => {
    if (!hasHydrated || !componentData.value || draftGroupId.value) {
      return;
    }

    draftGroupId.value = resolveComponentGroupId(componentData.value);
    updateSavedDraftSnapshot();
  },
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        v-if="activeTab === 'overview'"
        class="min-h-0 flex-1 space-y-6 overflow-auto px-6 py-5"
      >
        <div v-if="isLoading" class="text-xs text-muted-foreground">
          Loading component overview...
        </div>

        <template v-else>
          <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div class="rounded-md border border-border bg-card/20 px-4 py-4">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span :class="[studioIcons.layers, 'size-4 text-muted-foreground']" />
                Source
              </div>
              <p class="m-0 text-lg font-semibold leading-tight text-foreground">
                {{ componentSourceLabel }}
              </p>
              <p class="m-0 mt-1 text-xs leading-snug text-muted-foreground">
                {{ componentLockLabel }}
              </p>
            </div>

            <div class="rounded-md border border-border bg-card/20 px-4 py-4">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span :class="[studioIcons.props, 'size-4 text-muted-foreground']" />
                Fields
              </div>
              <p class="m-0 text-2xl font-semibold leading-none tabular-nums">
                {{ exposedContentFieldCount }}
              </p>
              <p class="m-0 mt-2 text-xs leading-snug text-muted-foreground">
                exposed content fields
              </p>
            </div>

            <div class="rounded-md border border-border bg-card/20 px-4 py-4">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span :class="[studioIcons.link, 'size-4 text-muted-foreground']" />
                Usage
              </div>
              <p class="m-0 text-2xl font-semibold leading-none tabular-nums">
                {{ totalUsageReferences }}
              </p>
              <p class="m-0 mt-2 text-xs leading-snug text-muted-foreground">
                references across pages and layouts
              </p>
            </div>

            <div class="rounded-md border border-border bg-card/20 px-4 py-4">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span :class="[studioIcons.page, 'size-4 text-muted-foreground']" />
                Pages
              </div>
              <p class="m-0 text-2xl font-semibold leading-none tabular-nums">
                {{ pageUsages.length }}
              </p>
              <p class="m-0 mt-2 text-xs leading-snug text-muted-foreground">
                pages reference it
              </p>
            </div>

            <div class="rounded-md border border-border bg-card/20 px-4 py-4">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span :class="[studioIcons.history, 'size-4 text-muted-foreground']" />
                Updated
              </div>
              <p class="m-0 text-lg font-semibold leading-tight text-foreground">
                {{ updatedLabel }}
              </p>
              <p class="m-0 mt-1 text-xs leading-snug text-muted-foreground">
                latest component edit
              </p>
            </div>
          </section>

          <section class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div class="space-y-5">
              <section class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                  <Label :class="detailLabelClass">
                    Name
                  </Label>
                  <Input
                    v-model="draftName"
                    class="h-8 text-xs"
                    :disabled="isLocked"
                  />
                </div>

                <div class="space-y-2">
                  <Label :class="detailLabelClass">
                    Category
                  </Label>
                  <Select
                    v-model="draftGroupId"
                    :disabled="isLocked || categoryGroupOptions.length === 0"
                  >
                    <SelectTrigger class="h-8 text-xs">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="group in categoryGroupOptions"
                        :key="group.value"
                        :value="group.value"
                      >
                        {{ group.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section class="space-y-2">
                <Label :class="detailLabelClass">
                  Description
                </Label>
                <Textarea
                  v-model="draftDescription"
                  class="min-h-18 text-xs"
                  :disabled="isLocked"
                />
              </section>
            </div>

            <aside class="space-y-3">
              <div class="rounded-md border border-dashed border-border px-3 py-3">
                <Label :class="detailLabelClass">
                  Current group
                </Label>
                <div class="mt-2 truncate text-sm font-medium text-foreground">
                  {{ selectedGroupLabel }}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="w-full justify-start"
                @click="switchTab('content')"
              >
                <span :class="[studioIcons.text, 'mr-2 size-3.5']" />
                Edit content
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="w-full justify-start"
                @click="switchTab('usage')"
              >
                <span :class="[studioIcons.link, 'mr-2 size-3.5']" />
                View usage
              </Button>
            </aside>
          </section>
        </template>
      </div>

      <div
        v-else-if="activeTab === 'content'"
        class="min-h-0 flex-1 space-y-6 overflow-auto px-6 py-5"
      >
        <div v-if="isLoading" class="text-xs text-muted-foreground">
          Loading component details...
        </div>

        <template v-else>
          <div
            class="flex min-h-8 flex-wrap items-center justify-between gap-3 border-b border-dashed border-border pb-2"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <span :class="detailHeadingClass">
                  Fields
                </span>
                <span class="text-3xs tabular-nums text-muted-foreground">
                  {{ visibleContentFieldCount }}
                  <span
                    v-if="visibleContentFieldCount !== exposedContentFieldCount"
                    class="text-muted-foreground/50"
                  >
                    / {{ exposedContentFieldCount }}
                  </span>
                </span>
              </div>
              <div
                class="inline-flex h-7 items-center overflow-hidden rounded-sm border border-dashed border-border/60 bg-sidebar/20"
              >
                <button
                  v-for="option in contentFieldTypeFilterOptions"
                  :key="option.value"
                  type="button"
                  :class="[
                    'h-full px-2.5 text-xs transition-colors hover:bg-sidebar/60 hover:text-foreground',
                    contentFieldTypeFilter === option.value
                      ? 'bg-sidebar text-primary'
                      : 'text-muted-foreground',
                  ]"
                  @click="contentFieldTypeFilter = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <label
              class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <span>Show locked</span>
              <Switch
                :checked="contentEditingPreferences.showLockedContentFields.value"
                @update:checked="
                  (value: boolean) =>
                    (contentEditingPreferences.showLockedContentFields.value =
                      value)
                "
              />
            </label>
          </div>

          <div
            v-if="exposedContentFieldCount === 0"
            class="px-1 py-3 text-2xs text-muted-foreground"
          >
            No content fields available.
          </div>

          <div
            v-else-if="visibleContentFieldCount === 0"
            class="px-1 py-3 text-2xs text-muted-foreground"
          >
            No fields match this filter.
          </div>

          <div
            v-else
            class="overflow-hidden rounded-sm border border-dashed border-border/60"
          >
            <ComponentContentTree
              :nodes="contentStructure"
              :values="contentFieldValues"
              :bindings="contentBindingValues"
              :preview-values="contentPreviewValues"
              :disabled="isLocked"
              :type-filter="contentFieldTypeFilter"
              @update-field="setContentFieldValue"
              @update-binding="setContentBindingValue"
            />
          </div>
        </template>
      </div>

      <div
        v-else-if="activeTab === 'usage'"
        class="min-h-0 flex-1 overflow-auto px-6 py-5"
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span :class="detailHeadingClass">
              Pages And Layouts Referencing This Component
            </span>
            <Badge variant="outline" class="text-4xs">
              {{ componentUsages.length }}
            </Badge>
          </div>

          <div v-if="isLoadingUsage" class="text-2xs text-muted-foreground">
            Scanning pages and layouts...
          </div>

          <template v-else>
            <div
              v-if="componentUsages.length === 0"
              class="rounded-sm border border-dashed border-border px-3 py-4 text-2xs text-muted-foreground"
            >
              No page or layout references found for this component.
            </div>

            <template v-else>
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span :class="detailHeadingClass">
                    Pages
                  </span>
                  <Badge variant="secondary" class="text-4xs">
                    {{ pageUsages.length }}
                  </Badge>
                </div>

                <div v-if="pageUsages.length === 0" class="text-2xs text-muted-foreground">
                  No page references.
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="usage in pageUsages"
                    :key="`page-${usage.id}`"
                    class="rounded-sm border border-dashed border-border px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate text-xs text-foreground">
                          {{ usage.title }}
                        </div>
                        <div class="truncate text-2xs text-muted-foreground">
                          {{ usage.path }}
                        </div>
                      </div>
                      <Badge variant="outline" class="shrink-0 text-4xs">
                        {{ usage.matchCount }}
                        {{ usage.matchCount === 1 ? "instance" : "instances" }}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span :class="detailHeadingClass">
                    Layouts
                  </span>
                  <Badge variant="secondary" class="text-4xs">
                    {{ layoutUsages.length }}
                  </Badge>
                </div>

                <div v-if="layoutUsages.length === 0" class="text-2xs text-muted-foreground">
                  No layout references.
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="usage in layoutUsages"
                    :key="`layout-${usage.id}`"
                    class="rounded-sm border border-dashed border-border px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate text-xs text-foreground">
                          {{ usage.title }}
                        </div>
                        <div class="truncate text-2xs text-muted-foreground">
                          {{ usage.path }}
                        </div>
                      </div>
                      <Badge variant="outline" class="shrink-0 text-4xs">
                        {{ usage.matchCount }}
                        {{
                          usage.matchCount === 1 ? "reference" : "references"
                        }}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <div
        v-else-if="activeTab === 'advanced'"
        class="min-h-0 flex-1 space-y-5 overflow-auto px-6 py-5"
      >
        <section class="space-y-2">
          <Label :class="detailLabelClass">
            Prop Schema (JSON)
          </Label>
          <StudioCodeEditor
            v-model="draftPropsJson"
            language="json"
            class="h-70"
            :readonly="isLocked"
          />
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <span :class="detailHeadingClass">
              Astro Export
            </span>
            <Button variant="ghost" size="sm" class="h-7 text-2xs" @click="copyCode">
              Copy
            </Button>
          </div>

          <StudioCodeEditor
            :model-value="isLoadingCode ? 'Generating code...' : codeOutput"
            language="javascript"
            readonly
            class="h-96"
          />
        </section>
      </div>
    </div>
  </div>
</template>
