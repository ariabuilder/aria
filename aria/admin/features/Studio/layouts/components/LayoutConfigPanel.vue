<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { log } from "@/lib/utils/logger";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioCrudHistory } from "@/features/Studio/composer/composables/useStudioCrudHistory";
import { JsonObjectSchema } from "@/lib/schemas/json";
import { LayoutDSLSchema } from "@/lib/schemas/nodes";
import type { BuilderNode, LayoutDSL } from "@/lib/types/nodes";

interface Props {
  layoutId: string;
}

const props = defineProps<Props>();
const { recordUpdateItem } = useStudioCrudHistory();

const PersistLayoutInputSchema = z.object({
  collection: z.literal("layouts"),
  slug: z.string().min(1),
  data: LayoutDSLSchema,
});

const SlotAssignmentInputSchema = z.object({
  slotName: z.string().min(1),
  componentId: z.string(),
});

type CanonicalSlot = {
  name: string;
  label: string;
  required?: boolean;
  isDefault?: boolean;
};

type LayoutSlot = {
  name: string;
  label?: string;
  required?: boolean;
  isDefault?: boolean;
  defaultContent?: unknown[];
};

const HEADER_SLOT: CanonicalSlot = { name: "header", label: "Header" };
const FOOTER_SLOT: CanonicalSlot = { name: "footer", label: "Footer" };

const PRESET_SLOTS: Record<string, CanonicalSlot[]> = {
  "full-width": [{ name: "main", label: "Main Content", isDefault: true }],
  "left-sidebar": [
    { name: "left", label: "Left Sidebar" },
    { name: "main", label: "Main Content", isDefault: true },
  ],
  "right-sidebar": [
    { name: "main", label: "Main Content", isDefault: true },
    { name: "right", label: "Right Sidebar" },
  ],
  "two-sidebar": [
    { name: "left", label: "Left Sidebar" },
    { name: "main", label: "Main Content", isDefault: true },
    { name: "right", label: "Right Sidebar" },
  ],
};

const { layouts, pages, components, refreshLayouts } = useBuilderData();

// Full layout details from API
const layoutDetails = ref<LayoutDSL | null>(null);
const isLoadingDetails = ref(false);
const isSavingSlots = ref(false);
const saveError = ref<string | null>(null);

// Find the selected layout (lightweight metadata from list)
const layoutMeta = computed(() =>
  layouts.value.find((l) => l.id === props.layoutId),
);

const pagesUsingLayout = computed(() =>
  pages.value.filter((p) => p.layout === props.layoutId),
);

const expandedSections = ref({
  slots: true,
  usage: false,
});

function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section];
}

const componentOptions = computed(() =>
  [...components.value].sort((a, b) => a.name.localeCompare(b.name)),
);

const componentNameById = computed(() => {
  const map = new Map<string, string>();
  for (const component of componentOptions.value) {
    map.set(component.id, component.name || component.id);
  }
  return map;
});

function getPresetKey(layoutId: string): string {
  const known = Object.keys(PRESET_SLOTS);
  if (known.includes(layoutId)) return layoutId;
  const lowerId = layoutId.toLowerCase();
  const matched = known.find((key) => lowerId.includes(key));
  return matched || "full-width";
}

const activePresetKey = computed(() =>
  getPresetKey(layoutDetails.value?.id || props.layoutId),
);

const canonicalSlots = computed<CanonicalSlot[]>(() => {
  return [
    HEADER_SLOT,
    ...(PRESET_SLOTS[activePresetKey.value] || []),
    FOOTER_SLOT,
  ];
});

const canonicalSlotMap = computed(() => {
  return new Map(canonicalSlots.value.map((slot) => [slot.name, slot]));
});

const mergedSlots = computed(() => {
  const current = layoutDetails.value?.slots || [];
  const currentMap = new Map<string, LayoutSlot>();
  for (const slot of current) {
    currentMap.set(slot.name, slot);
  }
  const merged: LayoutSlot[] = canonicalSlots.value.map((canonical) => {
    const existing = currentMap.get(canonical.name);
    return {
      name: canonical.name,
      label: canonical.label,
      required: canonical.required,
      isDefault: canonical.isDefault,
      defaultContent: existing?.defaultContent,
    };
  });

  for (const slot of current) {
    if (!canonicalSlotMap.value.has(slot.name)) {
      merged.push(slot);
    }
  }

  return merged;
});

function isAssignableSlot(slotName: string): boolean {
  return slotName !== "main";
}

const assignableSlots = computed(() =>
  mergedSlots.value.filter((slot) => isAssignableSlot(slot.name)),
);

function getAssignedComponentIdForSlot(slotName: string): string {
  if (!layoutDetails.value) return "";

  const assignedRegions = {
    ...(layoutDetails.value.metadata?.regions || {}),
    ...(layoutDetails.value.regions || {}),
  };

  if (slotName === "main") {
    return "";
  }

  if (slotName === "header") {
    return assignedRegions.headerComponent || "";
  }

  if (slotName === "footer") {
    return assignedRegions.footerComponent || "";
  }

  const slot = mergedSlots.value.find((entry) => entry.name === slotName);
  const firstNode = slot?.defaultContent?.[0] as
    | {
        reference?: { type?: string; id?: string; masterId?: string };
        props?: Record<string, unknown>;
      }
    | undefined;
  const referencedComponentId =
    firstNode?.reference?.masterId || firstNode?.reference?.id;

  if (referencedComponentId) {
    return referencedComponentId;
  }

  const propComponentId = firstNode?.props?.componentId;
  if (typeof propComponentId === "string") {
    return propComponentId;
  }

  return "";
}

function getAssignedComponentLabel(slotName: string): string {
  const assignedId = getAssignedComponentIdForSlot(slotName);
  if (!assignedId) return "Unassigned";
  return componentNameById.value.get(assignedId) || assignedId;
}

function createDefaultComponentNode(slotName: string, componentId: string) {
  const node: BuilderNode = {
    id: `${slotName}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
    type: "Component",
    slot: slotName,
    props: {
      componentId,
    },
    reference: {
      type: "instance",
      masterId: componentId,
    },
    styles: {},
    children: [],
  };

  return node;
}

function cloneLayout(layout: unknown): LayoutDSL {
  try {
    return LayoutDSLSchema.parse(structuredClone(layout));
  } catch {
    return LayoutDSLSchema.parse(JSON.parse(JSON.stringify(layout)));
  }
}

function toJsonObject(layout: LayoutDSL) {
  return JSON.parse(JSON.stringify(layout));
}

async function applyLayoutUpdate(nextLayout: LayoutDSL): Promise<void> {
  const validatedLayout = LayoutDSLSchema.parse(nextLayout);
  const payload = PersistLayoutInputSchema.parse({
    collection: "layouts",
    slug: props.layoutId,
    data: validatedLayout,
  });

  const { error } = await actions.updateItem(payload);
  if (error) {
    throw new Error(error.message);
  }

  layoutDetails.value = validatedLayout;
  await refreshLayouts();
}

function buildLayoutWithCanonicalSlots(layout: unknown): {
  layout: LayoutDSL;
  changed: boolean;
} {
  const parsedLayout = LayoutDSLSchema.parse(layout);
  const currentSlots = parsedLayout.slots || [];
  const currentByName = new Map<string, LayoutSlot>();
  for (const slot of currentSlots) {
    currentByName.set(slot.name, slot);
  }
  const normalizedSlots: LayoutSlot[] = canonicalSlots.value.map(
    (canonical) => {
      const existing = currentByName.get(canonical.name);
      return {
        name: canonical.name,
        label: canonical.label,
        required: canonical.required,
        isDefault: canonical.isDefault,
        defaultContent:
          canonical.name === "main" ? undefined : existing?.defaultContent,
      };
    },
  );

  for (const existing of currentSlots) {
    if (!canonicalSlotMap.value.has(existing.name)) {
      normalizedSlots.push(existing);
    }
  }

  const before = JSON.stringify(currentSlots);
  const after = JSON.stringify(normalizedSlots);
  const changed = before !== after;

  return {
    layout: {
      ...parsedLayout,
      slots: normalizedSlots as LayoutDSL["slots"],
    },
    changed,
  };
}

async function persistLayoutUpdate(
  nextLayout: LayoutDSL,
  description = "Update layout slot assignments",
): Promise<boolean> {
  saveError.value = null;
  isSavingSlots.value = true;

  try {
    const validatedNextLayout = LayoutDSLSchema.parse(nextLayout);
    const currentLayout = layoutDetails.value as LayoutDSL | null;
    const previousLayout = currentLayout ? cloneLayout(currentLayout) : null;
    const nextLayoutData = JsonObjectSchema.parse(
      toJsonObject(validatedNextLayout),
    );

    if (!previousLayout) {
      await applyLayoutUpdate(validatedNextLayout);
      return true;
    }

    const restoreLayoutData = JsonObjectSchema.parse(
      toJsonObject(previousLayout),
    );
    const executeResult = await recordUpdateItem({
      type: "update-layout-metadata",
      description,
      collection: "layouts",
      slug: props.layoutId,
      data: nextLayoutData,
      restoreData: restoreLayoutData,
      refresh: refreshLayouts,
      afterRedo: async () => {
        layoutDetails.value = validatedNextLayout;
      },
      afterUndo: async () => {
        layoutDetails.value = previousLayout;
      },
    });

    if (!executeResult) {
      saveError.value = "Failed to save slot assignments.";
      return false;
    }

    return true;
  } catch (error) {
    saveError.value = "Failed to save slot assignments.";
    log("error", "[LayoutConfigPanel] Error saving layout", { error });
    return false;
  } finally {
    isSavingSlots.value = false;
  }
}

async function ensureCanonicalSlotsPersisted(): Promise<void> {
  if (!layoutDetails.value) return;
  const { layout: normalized, changed } = buildLayoutWithCanonicalSlots(
    layoutDetails.value,
  );
  if (!changed) return;
  await persistLayoutUpdate(
    {
      ...normalized,
      updatedAt: new Date().toISOString(),
    },
    "Normalize layout canonical slots",
  );
}

async function updateSlotAssignment(
  slotName: string,
  componentId: string,
): Promise<void> {
  if (!layoutDetails.value || isSavingSlots.value) return;

  const validatedInput = SlotAssignmentInputSchema.safeParse({
    slotName,
    componentId,
  });
  if (!validatedInput.success) {
    saveError.value =
      validatedInput.error.issues[0]?.message ||
      "Invalid slot assignment payload.";
    return;
  }

  if (!isAssignableSlot(validatedInput.data.slotName)) return;

  const selectedComponentId = validatedInput.data.componentId.trim();
  const { layout: normalized } = buildLayoutWithCanonicalSlots(
    layoutDetails.value,
  );
  const nextRegions = {
    ...(normalized.metadata?.regions || {}),
    ...(normalized.regions || {}),
  };

  if (validatedInput.data.slotName === "header") {
    if (selectedComponentId) {
      nextRegions.headerComponent = selectedComponentId;
    } else {
      delete nextRegions.headerComponent;
    }
  }

  if (validatedInput.data.slotName === "footer") {
    if (selectedComponentId) {
      nextRegions.footerComponent = selectedComponentId;
    } else {
      delete nextRegions.footerComponent;
    }
  }

  const hasRegions = Object.keys(nextRegions).length > 0;

  const updatedSlots = (normalized.slots || []).map((slot) => {
    if (slot.name !== validatedInput.data.slotName) return slot;
    if (!selectedComponentId) {
      return {
        ...slot,
        defaultContent: undefined,
      };
    }
    return {
      ...slot,
      defaultContent: [
        createDefaultComponentNode(
          validatedInput.data.slotName,
          selectedComponentId,
        ),
      ],
    };
  });

  const nextLayout: LayoutDSL = {
    ...normalized,
    slots: updatedSlots,
    regions: hasRegions ? nextRegions : undefined,
    metadata: {
      ...(normalized.metadata || {}),
      regions: hasRegions ? nextRegions : undefined,
    },
    updatedAt: new Date().toISOString(),
  };

  await persistLayoutUpdate(
    nextLayout,
    `Update slot ${validatedInput.data.slotName} assignment`,
  );
}

async function handleSlotAssignmentChange(
  slotName: string,
  event: Event,
): Promise<void> {
  const target = event.target as HTMLSelectElement | null;
  const value = target?.value || "";
  await updateSlotAssignment(slotName, value);
}

async function handleSlotAssignmentSelect(
  slotName: string,
  value: unknown,
): Promise<void> {
  const normalizedValue = typeof value === "string" ? value : "";
  await updateSlotAssignment(
    slotName,
    normalizedValue === "__none__" ? "" : normalizedValue,
  );
}

function getSlotIcon(slotName: string): string {
  if (slotName === "header") return "i-hugeicons:align-box-top-center";
  if (slotName === "footer") return "i-hugeicons:align-box-bottom-center";
  if (slotName === "left") return "i-hugeicons:sidebar-left";
  if (slotName === "right") return "i-hugeicons:source-code-square";
  if (slotName === "main") return "i-hugeicons:file-01";
  return "i-hugeicons:layer";
}

function isGlobalSlot(slotName: string): boolean {
  return slotName === "header" || slotName === "footer";
}

const slotStats = computed(() => {
  const total = assignableSlots.value.length;
  const assigned = assignableSlots.value.filter((slot) =>
    Boolean(getAssignedComponentIdForSlot(slot.name)),
  ).length;
  return {
    total,
    assigned,
    unassigned: total - assigned,
  };
});

// Fetch full layout details when layoutId changes
async function fetchLayoutDetails(id: string) {
  if (!id) {
    layoutDetails.value = null;
    return;
  }

  isLoadingDetails.value = true;
  try {
    const { data, error } = await actions.getItem({
      collection: "layouts",
      slug: id,
    });

    if (error) {
      console.error("[LayoutConfigPanel] Failed to fetch layout:", error);
      layoutDetails.value = null;
      return;
    }

    const parsedLayout = LayoutDSLSchema.safeParse(data);
    if (!parsedLayout.success) {
      console.error(
        "[LayoutConfigPanel] Invalid layout payload:",
        parsedLayout.error.issues,
      );
      layoutDetails.value = null;
      return;
    }

    layoutDetails.value = parsedLayout.data;
    await ensureCanonicalSlotsPersisted();
  } catch (err) {
    console.error("[LayoutConfigPanel] Error fetching layout:", err);
    layoutDetails.value = null;
  } finally {
    isLoadingDetails.value = false;
  }
}

// Watch for layoutId changes
watch(
  () => props.layoutId,
  (newId) => {
    fetchLayoutDetails(newId);
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex flex-col h-full bg-background mr-2 border-none rounded-md overflow-hidden"
  >
    <!-- Header -->
    <div
      class="px-4 py-3 flex justify-between items-center shrink-0 border-b border-border"
    >
      <div class="flex items-center gap-2">
        <div
          class="i-hugeicons:browser w-5 h-5 text-muted-foreground"
        />
        <span class="text-lg font-serif font-medium text-foreground">
          {{
            layoutDetails?.name ||
            layoutMeta?.name ||
            layoutMeta?.id ||
            "Layout"
          }}
        </span>
        <div
          v-if="isLoadingDetails"
          class="i-svg-spinners:ring-resize w-4 h-4 text-muted-foreground"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-4 space-y-4">
      <!-- Slots Section -->
      <div
        class="bg-sidebar border border-dashed border-border rounded-lg overflow-hidden"
      >
        <button
          @click="toggleSection('slots')"
          class="w-full px-4 py-3 flex items-center justify-between hover:bg-sidebar-accent/30 transition-colors"
        >
          <div class="flex items-center gap-2">
            <div
              :class="expandedSections.slots ? 'rotate-90' : ''"
              class="transition-transform"
            >
              <div
                class="i-hugeicons:arrow-right-01 w-3 h-3 text-muted-foreground"
              />
            </div>
            <span
              class="text-3xs uppercase tracking-widest text-muted-foreground font-medium"
            >
              Content Slots
            </span>
          </div>
          <Badge variant="secondary" class="text-3xs">
            {{ mergedSlots.length }}
          </Badge>
        </button>

        <div
          v-if="expandedSections.slots"
          class="px-4 pb-4 space-y-2 border-t border-border/50"
        >
          <div
            v-if="isLoadingDetails"
            class="py-4 flex items-center justify-center"
          >
            <div
              class="i-svg-spinners:ring-resize w-5 h-5 text-muted-foreground"
            />
          </div>
          <div
            v-else-if="!mergedSlots.length"
            class="py-4 text-center text-sm text-muted-foreground"
          >
            <div
              class="i-hugeicons:group-layers w-6 h-6 mx-auto mb-2 opacity-50"
            />
            <p>No slots defined</p>
            <p class="text-xs opacity-60">
              Slots let pages inject content into specific areas
            </p>
          </div>

          <div v-else class="pt-3 space-y-3">
            <div class="grid grid-cols-3 gap-2">
              <div
                class="rounded-md border border-border/50 bg-background/40 px-2.5 py-2"
              >
                <div
                  class="text-3xs uppercase tracking-widest text-muted-foreground"
                >
                  Total
                </div>
                <div class="text-sm font-medium text-foreground">
                  {{ slotStats.total }}
                </div>
              </div>
              <div
                class="rounded-md border border-primary/30 bg-primary/8 px-2.5 py-2"
              >
                <div
                  class="text-3xs uppercase tracking-widest text-muted-foreground"
                >
                  Assigned
                </div>
                <div class="text-sm font-medium text-primary">
                  {{ slotStats.assigned }}
                </div>
              </div>
              <div
                class="rounded-md border border-border/50 bg-background/40 px-2.5 py-2"
              >
                <div
                  class="text-3xs uppercase tracking-widest text-muted-foreground"
                >
                  Open
                </div>
                <div class="text-sm font-medium text-foreground">
                  {{ slotStats.unassigned }}
                </div>
              </div>
            </div>

            <div
              v-for="slot in mergedSlots"
              :key="slot.name"
              class="p-3 rounded-lg border border-border/50 bg-background/45 hover:border-primary/35 transition-colors"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-3 min-w-0">
                  <div
                    :class="getSlotIcon(slot.name)"
                    class="w-4 h-4 text-primary shrink-0 mt-0.5"
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class="text-sm font-medium text-foreground truncate"
                      >
                        {{ slot.label || slot.name }}
                      </span>
                      <Badge
                        v-if="slot.isDefault"
                        variant="outline"
                        class="text-4xs border-primary/40 text-primary"
                      >
                        Default
                      </Badge>
                      <Badge
                        v-if="isGlobalSlot(slot.name)"
                        variant="outline"
                        class="text-4xs"
                      >
                        Global
                      </Badge>
                      <Badge
                        v-if="slot.required"
                        variant="outline"
                        class="text-4xs border-orange-600/50 text-orange-500"
                      >
                        Required
                      </Badge>
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      {{ slot.name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-1">
                      <template v-if="isAssignableSlot(slot.name)">
                        Assigned:
                        <span class="text-foreground">{{
                          getAssignedComponentLabel(slot.name)
                        }}</span>
                      </template>
                      <template v-else>
                        Renders page content for this layout
                      </template>
                    </div>
                  </div>
                </div>

                <div
                  class="h-2.5 w-2.5 rounded-full mt-1"
                  :class="
                    !isAssignableSlot(slot.name)
                      ? 'bg-muted-foreground/70'
                      : getAssignedComponentIdForSlot(slot.name)
                        ? 'bg-primary'
                        : 'bg-border'
                  "
                />
              </div>

              <div class="mt-2.5">
                <template v-if="isAssignableSlot(slot.name)">
                  <Select
                    :disabled="isSavingSlots"
                    :model-value="
                      getAssignedComponentIdForSlot(slot.name) || '__none__'
                    "
                    @update:model-value="
                      (value) => handleSlotAssignmentSelect(slot.name, value)
                    "
                  >
                    <SelectTrigger class="h-8 w-full text-xs">
                      <SelectValue placeholder="Assign component" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      <SelectItem
                        v-for="component in componentOptions"
                        :key="component.id"
                        :value="component.id"
                      >
                        {{ component.name || component.id }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </template>
                <div
                  v-else
                  class="h-8 w-full rounded-md border border-border bg-muted/30 px-2 text-xs text-muted-foreground flex items-center"
                >
                  Page content region (not assignable)
                </div>
              </div>
            </div>
          </div>

          <div v-if="saveError" class="text-xs text-destructive pt-1">
            {{ saveError }}
          </div>
          <div
            v-else-if="isSavingSlots"
            class="text-xs text-muted-foreground pt-1"
          >
            Saving slot assignments...
          </div>
        </div>
      </div>

      <!-- Usage Section -->
      <div
        class="bg-sidebar border border-dashed border-border rounded-lg overflow-hidden"
      >
        <button
          @click="toggleSection('usage')"
          class="w-full px-4 py-3 flex items-center justify-between hover:bg-sidebar-accent/30 transition-colors"
        >
          <div class="flex items-center gap-2">
            <div
              :class="expandedSections.usage ? 'rotate-90' : ''"
              class="transition-transform"
            >
              <div
                class="i-hugeicons:arrow-right-01 w-3 h-3 text-muted-foreground"
              />
            </div>
            <span
              class="text-3xs uppercase tracking-widest text-muted-foreground font-medium"
            >
              Pages Using This Layout
            </span>
          </div>
          <Badge variant="secondary" class="text-3xs">
            {{ pagesUsingLayout.length }}
          </Badge>
        </button>

        <div
          v-if="expandedSections.usage"
          class="px-4 pb-4 border-t border-border/50"
        >
          <div
            v-if="pagesUsingLayout.length === 0"
            class="py-4 text-center text-sm text-muted-foreground"
          >
            <p>No pages using this layout yet</p>
          </div>

          <div v-else class="mt-3 space-y-1">
            <div
              v-for="page in pagesUsingLayout.slice(0, 10)"
              :key="page.id"
              class="flex items-center gap-2 p-2 rounded-md hover:bg-background/30"
            >
              <div
                class="i-hugeicons:file-01 w-3.5 h-3.5 text-muted-foreground"
              />
              <span class="text-sm text-foreground truncate">
                {{ page.title || page.id }}
              </span>
              <span class="text-xs text-muted-foreground"
                >/{{ page.slug }}</span
              >
            </div>
            <div
              v-if="pagesUsingLayout.length > 10"
              class="text-xs text-muted-foreground text-center pt-2"
            >
              +{{ pagesUsingLayout.length - 10 }} more pages
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
