<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTheme } from "../../Design";
import { studioIcons } from "@/lib/icons";
import { formatShiftModifierShortcut } from "@/lib/keyboardShortcuts";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    showOutlines?: boolean;
    wireframeMode?: boolean;
    isPublished?: boolean;
    livePageHref?: string | null;
    showSlotGroups?: boolean;
  }>(),
  {
    showOutlines: false,
    wireframeMode: false,
    isPublished: false,
    livePageHref: null,
    showSlotGroups: true,
  },
);

const emit = defineEmits<{
  "update:show-outlines": [value: boolean];
  "update:wireframe-mode": [value: boolean];
  "update:show-slot-groups": [value: boolean];
  unpublish: [];
}>();

const THEME_ICON_MAP = {
  light: studioIcons.themeSun,
  dark: studioIcons.themeMoon,
} as const;

const isOpen = ref(false);
const isFullscreen = ref(false);

const { isDark, toggleTheme } = useTheme();
const { t } = useStudioI18n();

async function toggleFullscreen(): Promise<void> {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    isFullscreen.value = true;
    return;
  }

  await document.exitFullscreen();
  isFullscreen.value = false;
}

function toggleShowOutlines(): void {
  const next = !props.showOutlines;
  emit("update:show-outlines", next);
  if (!next) {
    emit("update:wireframe-mode", false);
  }
}

function toggleWireframeMode(): void {
  const next = !props.wireframeMode;
  emit("update:wireframe-mode", next);
  if (!next) {
    emit("update:show-outlines", false);
  }
}

function openLivePage(): void {
  if (!props.livePageHref) {
    return;
  }

  window.open(props.livePageHref, "_blank", "noopener,noreferrer");
}

function handleFullscreenChange(): void {
  isFullscreen.value = !!document.fullscreenElement;
}

onMounted(() => {
  if (typeof document === "undefined") {
    return;
  }

  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  if (typeof document === "undefined") {
    return;
  }

  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="shrink-0 hover:bg-transparent"
        :aria-label="t('composer.options.label')"
      >
        <span
          :class="[studioIcons.tuning, 'size-4 shrink-0']"
          aria-hidden="true"
        />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="end" class="w-60 p-0" :side-offset="5">
      <Command>
        <CommandList style="max-height: none !important;"
          class="py-1! space-y-3!"
          <!-- Canvas Display -->
          <CommandGroup :heading="t('composer.options.canvas')">
            <CommandItem
              value="show-outlines"
              class="flex cursor-pointer items-center gap-2"
              @select="toggleShowOutlines"
            >
              <span
                :class="[
                  studioIcons.widget4,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ t("composer.options.showOutlines") }}
              </span>
              <span
                v-if="props.showOutlines"
                :class="[
                  studioIcons.checkLinear,
                  'size-3.5 shrink-0 text-primary',
                ]"
              />
            </CommandItem>

            <CommandItem
              value="wireframe-mode"
              class="flex cursor-pointer items-center gap-2"
              @select="toggleWireframeMode"
            >
              <span
                :class="[
                  studioIcons.lightning,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ t("composer.options.wireframe") }}
              </span>
              <span
                v-if="props.wireframeMode"
                :class="[
                  studioIcons.checkLinear,
                  'size-3.5 shrink-0 text-primary',
                ]"
              />
            </CommandItem>
          </CommandGroup>

          <!-- Layers -->
          <CommandGroup :heading="t('composer.options.layers')">
            <CommandItem
              value="show-slot-groups"
              class="flex cursor-pointer items-center gap-2"
              @select="emit('update:show-slot-groups', !props.showSlotGroups)"
            >
              <span
                :class="[
                  studioIcons.groupLayers,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ t("composer.options.showLayoutSlots") }}
              </span>
              <span
                v-if="props.showSlotGroups"
                :class="[
                  studioIcons.checkLinear,
                  'size-3.5 shrink-0 text-primary',
                ]"
              />
            </CommandItem>
          </CommandGroup>

          <!-- Appearance -->
          <CommandGroup :heading="t('composer.options.appearance')">
            <CommandItem
              value="toggle-theme"
              class="flex cursor-pointer items-center gap-2"
              @select="toggleTheme"
            >
              <span
                :class="[
                  isDark ? THEME_ICON_MAP.light : THEME_ICON_MAP.dark,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ isDark ? t("settings.appearance.mode.light") : t("settings.appearance.mode.dark") }}
              </span>
            </CommandItem>

            <CommandItem
              value="toggle-fullscreen"
              class="flex cursor-pointer items-center gap-2"
              @select="() => void toggleFullscreen()"
            >
              <span
                :class="[
                  studioIcons.maximize,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ isFullscreen ? t("composer.options.exitFullscreen") : t("composer.options.enterFullscreen") }}
              </span>
              <CommandShortcut>
                {{ formatShiftModifierShortcut("F") }}
              </CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <!-- Publishing -->
          <CommandGroup
            v-if="props.isPublished || props.livePageHref"
            :heading="t('composer.options.publishing')"
          >
            <CommandItem
              v-if="props.isPublished"
              value="set-to-draft"
              class="flex cursor-pointer items-center gap-2"
              @select="emit('unpublish')"
            >
              <span
                :class="[
                  studioIcons.archive,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ t("pages.detail.setAsDraft") }}
              </span>
            </CommandItem>

            <CommandItem
              v-if="props.livePageHref"
              value="view-live-page"
              class="flex cursor-pointer items-center gap-2 last:border-b-0"
              @select="openLivePage"
            >
              <span
                :class="[
                  studioIcons.linkBold,
                  'size-3.5 shrink-0 text-muted-foreground',
                ]"
              />
              <span class="min-w-0 flex-1 truncate whitespace-nowrap text-xs">
                {{ t("composer.options.viewLivePage") }}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
