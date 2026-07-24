<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TYPOGRAPHY_FONTS_UPDATED_EVENT,
  useTypography,
} from "../composables/useTypography";
import { useStudioI18n } from "@/i18n";

type SimpleRole = "mono";

type DialogTarget =
  | { kind: "all-headings" }
  | { kind: "one-heading"; stepId: string; level: string }
  | { kind: "all-body" }
  | { kind: "one-body"; stepId: string; label: string }
  | { kind: "mono" };

const HEADING_ROWS = [
  { id: "5xl", level: "H1" },
  { id: "4xl", level: "H2" },
  { id: "3xl", level: "H3" },
  { id: "2xl", level: "H4" },
  { id: "xl", level: "H5" },
  { id: "lg", level: "H6" },
] as const;

const BODY_ROWS = [
  { id: "base", labelKey: "design.fonts.bodyRegular", previewClass: "text-sm" },
  { id: "sm", labelKey: "design.fonts.bodySmall", previewClass: "text-xs" },
] as const;

const {
  typography,
  fontOptions,
  updateFamily,
  updateHeadingOverride,
  clearHeadingOverride,
  clearAllHeadingOverrides,
  updateBodyOverride,
  clearBodyOverride,
  clearAllBodyOverrides,
  loadFontOptions,
} = useTypography();

const { t } = useStudioI18n();
const dialogTarget = ref<DialogTarget | null>(null);
const searchQuery = ref("");

const isDialogOpen = computed({
  get: () => dialogTarget.value !== null,
  set: (value: boolean) => {
    if (!value) {
      dialogTarget.value = null;
      searchQuery.value = "";
    }
  },
});

const dialogTitle = computed(() => {
  const target = dialogTarget.value;
  if (!target) return "";
  if (target.kind === "all-headings") return t("design.fonts.allHeadings");
  if (target.kind === "one-heading") {
    return t("design.fonts.levelFont", { level: target.level });
  }
  if (target.kind === "all-body") return t("design.fonts.body");
  if (target.kind === "one-body") {
    return t("design.fonts.labelFont", { label: target.label });
  }
  if (target.kind === "mono") return t("design.fonts.mono");
  return "";
});

const currentDialogFamily = computed(() => {
  const target = dialogTarget.value;
  if (!target) return "";
  if (target.kind === "all-headings") return typography.value.families.heading;
  if (target.kind === "one-heading") return resolveHeadingFamily(target.stepId);
  if (target.kind === "all-body") return typography.value.families.body;
  if (target.kind === "one-body") return resolveBodyFamily(target.stepId);
  if (target.kind === "mono") return typography.value.families.mono;
  return "";
});

const filteredFonts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return fontOptions.value;
  return fontOptions.value.filter(
    (font) =>
      font.label.toLowerCase().includes(query) ||
      font.family.toLowerCase().includes(query),
  );
});

const stepById = computed(() => {
  const map = new Map<
    string,
    { size: number; lineHeight: number; letterSpacing: number }
  >();

  for (const step of typography.value.scale) {
    map.set(step.id, step);
  }

  return map;
});

function getHeadingStyle(stepId: string) {
  const step = stepById.value.get(stepId);
  if (!step) return {};

  return {
    fontSize: `${step.size}px`,
    lineHeight: 1,
    letterSpacing: `${step.letterSpacing}em`,
    fontFamily: resolveHeadingFamily(stepId),
  };
}

function getBodyStyle(stepId: string) {
  const step = stepById.value.get(stepId);
  if (!step) return {};

  return {
    fontSize: `${step.size}px`,
    lineHeight: `${step.lineHeight}px`,
    fontFamily: resolveBodyFamily(stepId),
  };
}

function resolveHeadingFamily(stepId: string): string {
  return (
    typography.value.headingOverrides?.[stepId] ??
    typography.value.families.heading ??
    "Outfit, -apple-system, BlinkMacSystemFont, sans-serif"
  );
}

function resolveBodyFamily(stepId: string): string {
  return (
    typography.value.bodyOverrides?.[stepId] ??
    typography.value.families.body ??
    "Outfit, -apple-system, BlinkMacSystemFont, sans-serif"
  );
}

function resolveSimpleFamily(role: SimpleRole): string {
  return typography.value.families[role] ?? "ui-monospace, monospace";
}

function hasHeadingOverride(stepId: string): boolean {
  return Boolean(typography.value.headingOverrides?.[stepId]);
}

function hasBodyOverride(stepId: string): boolean {
  return Boolean(typography.value.bodyOverrides?.[stepId]);
}

function openAllHeadings() {
  dialogTarget.value = { kind: "all-headings" };
  searchQuery.value = "";
}

function openOneHeading(stepId: string, level: string) {
  dialogTarget.value = { kind: "one-heading", stepId, level };
  searchQuery.value = "";
}

function openAllBody() {
  dialogTarget.value = { kind: "all-body" };
  searchQuery.value = "";
}

function openOneBody(stepId: string, label: string) {
  dialogTarget.value = { kind: "one-body", stepId, label };
  searchQuery.value = "";
}

function openSimpleRole(role: SimpleRole) {
  dialogTarget.value = { kind: role };
  searchQuery.value = "";
}

function selectFont(family: string) {
  const target = dialogTarget.value;
  if (!target) return;

  if (target.kind === "all-headings") {
    updateFamily("heading", family);
    clearAllHeadingOverrides();
  } else if (target.kind === "one-heading") {
    updateHeadingOverride(target.stepId, family);
  } else if (target.kind === "all-body") {
    updateFamily("body", family);
    clearAllBodyOverrides();
  } else if (target.kind === "one-body") {
    updateBodyOverride(target.stepId, family);
  } else if (target.kind === "mono") {
    updateFamily("mono", family);
  }

  isDialogOpen.value = false;
}

function handleFontsUpdated() {
  void loadFontOptions();
}

onMounted(() => {
  void loadFontOptions();
  window.addEventListener(TYPOGRAPHY_FONTS_UPDATED_EVENT, handleFontsUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener(
    TYPOGRAPHY_FONTS_UPDATED_EVENT,
    handleFontsUpdated,
  );
});
</script>

<template>
  <div class="grid grid-cols-[0.88fr_1.12fr] gap-3">
    <div class="group/headings flex flex-col gap-2">
      <div class="flex items-center gap-4">
        <h3 class="text-2xl font-semibold tracking-tight text-foreground">
          {{ t("design.fonts.headings") }}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          :title="t('design.fonts.setAllHeadings')"
          class="opacity-0 translate-x-1 text-muted-foreground group-hover/headings:translate-x-0 group-hover/headings:opacity-100 hover:text-primary cursor-pointer"
          @click="openAllHeadings"
        >
          <span class="i-hugeicons:pen-01 size-4" />
        </Button>
      </div>

      <div class="flex flex-col">
        <div
          v-for="{ id, level } in HEADING_ROWS"
          :key="id"
          class="group/row relative flex min-h-18 cursor-pointer items-center gap-4"
          role="button"
          tabindex="0"
          @click="openOneHeading(id, level)"
          @keydown.enter.prevent="openOneHeading(id, level)"
          @keydown.space.prevent="openOneHeading(id, level)"
        >
          <span
            class="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 text-muted-foreground opacity-0 transition-all duration-150 group-hover/row:translate-x-0 group-hover/row:opacity-100"
            aria-hidden="true"
          >
            <span class="i-hugeicons:pen-01 size-4" />
          </span>

          <span
            class="inline-flex w-7 shrink-0 items-center self-center text-sm leading-none font-serif text-muted-foreground/50 transition-opacity duration-100 group-hover/row:opacity-0"
          >
            {{ level }}
          </span>

          <div
            class="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3"
          >
            <span
              class="inline-flex w-full shrink-0 items-center self-center leading-none text-foreground"
              :style="getHeadingStyle(id)"
            >
              Aa
            </span>

            <span
              class="min-w-0 flex items-center self-center gap-1.5"
              :class="
                hasHeadingOverride(id)
                  ? 'text-primary'
                  : 'text-muted-foreground/60'
              "
            >
              <span
                class="inline-flex max-w-28 items-center truncate text-sm leading-none font-serif"
              >
                {{ resolveHeadingFamily(id) }}
              </span>
              <Button
                v-if="hasHeadingOverride(id)"
                type="button"
                variant="ghost"
                size="icon-sm"
                :title="t('design.fonts.resetHeadingFont')"
                class="size-4 text-muted-foreground opacity-60 transition-opacity hover:text-current hover:opacity-100"
                @click.stop="clearHeadingOverride(id)"
              >
                <span class="i-hugeicons:cancel-circle size-4" />
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="group/body flex flex-col gap-8">
      <div class="flex items-center gap-4">
        <h3 class="text-2xl font-semibold tracking-tight text-foreground">
          {{ t("design.fonts.body") }}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          :title="t('design.fonts.setAllBody')"
          class="opacity-0 -translate-x-1 text-muted-foreground group-hover/body:translate-x-0 group-hover/body:opacity-100 hover:text-primary"
          @click="openAllBody"
        >
          <span class="i-hugeicons:pen-01 size-4" />
        </Button>
      </div>

      <div class="space-y-8">
        <div
          v-for="{ id, labelKey, previewClass } in BODY_ROWS"
          :key="id"
          class="group/body-row cursor-pointer space-y-2"
          role="button"
          tabindex="0"
          @click="openOneBody(id, t(labelKey))"
          @keydown.enter.prevent="openOneBody(id, t(labelKey))"
          @keydown.space.prevent="openOneBody(id, t(labelKey))"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex-1 text-md font-serif font-semibold text-foreground"
            >
              {{ t(labelKey) }}
            </span>

            <span
              class="shrink-0 flex items-center gap-1.5"
              :class="
                hasBodyOverride(id)
                  ? 'text-primary'
                  : 'text-muted-foreground/60'
              "
            >
              <span class="text-sm font-serif">{{
                resolveBodyFamily(id)
              }}</span>
              <Button
                v-if="hasBodyOverride(id)"
                type="button"
                variant="ghost"
                size="icon-xs"
                :title="t('design.fonts.resetBodyFont')"
                class="size-3 text-muted-foreground opacity-60 transition-opacity hover:text-primary hover:opacity-100"
                @click.stop="clearBodyOverride(id)"
              >
                <span class="i-hugeicons:cancel-circle size-4" />
              </Button>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :title="t('design.fonts.setFontFor', { label: t(labelKey) })"
              class="shrink-0 opacity-0 translate-x-1 text-primary transition-all duration-100 group-hover/body-row:translate-x-0 group-hover/body-row:opacity-100"
              @click.stop="openOneBody(id, t(labelKey))"
            >
              <span class="i-hugeicons:pen-01 size-4" />
            </Button>
          </div>

          <p
            class="text-muted-foreground"
            :class="previewClass"
            :style="getBodyStyle(id)"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
        </div>

        <div class="group/mono space-y-2">
          <div class="flex items-center gap-3">
            <span
              class="flex-1 text-md font-serif font-semibold text-foreground"
            >
              Mono
            </span>

            <span
              class="shrink-0 flex items-center gap-1.5 text-muted-foreground/60"
            >
              <span class="text-sm font-serif">
                {{ resolveSimpleFamily("mono") }}
              </span>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="opacity-0 -translate-x-1 text-muted-foreground transition-all duration-150 group-hover/mono:translate-x-0 group-hover/mono:opacity-100 hover:text-primary cursor-pointer"
              @click="openSimpleRole('mono')"
            >
              <span class="i-hugeicons:pen-01 size-4" />
            </Button>
          </div>

          <p
            class="text-xs text-muted-foreground"
            :style="{
              fontFamily: resolveSimpleFamily('mono'),
              lineHeight: 1.6,
            }"
          >
            grid-template-columns: 2fr 1fr;
          </p>
        </div>
      </div>
    </div>
  </div>

  <Dialog v-model:open="isDialogOpen">
    <DialogContent class="max-w-xl border-border bg-card p-0">
      <DialogHeader class="border-b border-border px-6 py-5">
        <DialogTitle
          class="text-xl font-semibold tracking-tight text-foreground"
        >
          {{ dialogTitle }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4 p-6">
        <div class="relative">
          <span
            class="i-hugeicons:search-01 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="searchQuery"
            :placeholder="t('design.fonts.searchActiveFonts')"
            class="h-11 rounded-md border-border bg-background pl-9"
          />
        </div>

        <ScrollArea
          class="h-96 rounded-xl border border-border bg-background/70 p-2"
        >
          <div class="space-y-1 pr-3">
            <Button
              v-for="font in filteredFonts"
              :key="font.family"
              type="button"
              variant="ghost"
              class="h-auto w-full justify-between gap-4 rounded-xl border border-transparent px-4 py-3 text-left text-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
              :class="{
                'border-primary/25 bg-primary/5':
                  font.family === currentDialogFamily,
              }"
              @click="selectFont(font.family)"
            >
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-base text-foreground"
                  :style="{ fontFamily: font.family }"
                >
                  {{ font.label }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ font.family }}
                </p>
              </div>

              <span
                v-if="font.family === currentDialogFamily"
                class="i-hugeicons:checkmark-circle-01 size-4 shrink-0 text-primary"
              />
            </Button>
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>
