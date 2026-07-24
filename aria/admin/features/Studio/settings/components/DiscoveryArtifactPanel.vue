<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import DiscoveryArtifactEditor from "./DiscoveryArtifactEditor.vue";

const { t } = useStudioI18n();

const props = defineProps<{
  mode: "auto" | "custom" | "off";
  customValue: string;
  preview: string;
  liveUrl?: string;
  canEdit: boolean;
  allowDisable?: boolean;
  isEditing?: boolean;
  isLoading?: boolean;
  language?: "plain" | "xml";
  disabledMessage?: string;
  unavailableReason?: string | null;
}>();

const emit = defineEmits<{
  customize: [];
  revert: [];
  disable: [];
  enable: [];
  done: [];
  "update:customValue": [value: string];
}>();

const showDisabledState = computed(() => props.mode === "off");

const editorValue = computed(() => {
  if (props.isEditing) {
    return props.customValue;
  }
  if (props.mode === "custom") {
    return props.customValue || props.preview;
  }
  return props.preview;
});

const hasContent = computed(() => editorValue.value.trim().length > 0);

const statusLabel = computed(() => {
  if (props.mode === "off") return t("settings.discovery.artifact.status.disabled");
  if (props.mode === "custom") return t("settings.discovery.artifact.status.custom");
  if (!hasContent.value) return t("settings.discovery.artifact.status.suppressed");
  return t("settings.discovery.artifact.status.generated");
});

const statusVariant = computed(() => {
  if (props.mode === "off") return "outline" as const;
  if (props.mode === "custom") return "default" as const;
  if (!hasContent.value) return "outline" as const;
  return "secondary" as const;
});

const showUnavailableState = computed(
  () =>
    !showDisabledState.value &&
    !hasContent.value &&
    !props.isEditing &&
    Boolean(props.unavailableReason),
);

const showEditor = computed(
  () =>
    props.mode !== "off" &&
    (props.isEditing || hasContent.value) &&
    !showUnavailableState.value,
);
</script>

<template>
  <div class="flex h-full flex-col space-y-3 px-4 py-4">
    <div
      v-if="showDisabledState"
      class="rounded-sm border border-dashed border-border/50 bg-muted/20 px-4 py-8 text-center"
    >
      <span
        :class="[studioIcons.fileText, 'mx-auto mb-2 block size-5 text-muted-foreground/60']"
      />
      <p class="text-sm text-muted-foreground">
        {{ disabledMessage ?? t("settings.discovery.artifact.notPublished") }}
      </p>
      <Button
        v-if="canEdit"
        variant="outline"
        size="sm"
        class="discovery-toolbar-btn mt-4"
        :disabled="isLoading"
        @click="emit('enable')"
      >
        {{ t("settings.discovery.artifact.enable") }}
      </Button>
    </div>

    <template v-else>
      <div
        v-if="showUnavailableState"
        class="rounded-sm border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center"
      >
        <span
          :class="[studioIcons.warning, 'mx-auto mb-2 block size-5 text-amber-500/80']"
        />
        <p class="text-sm text-muted-foreground">
          {{ unavailableReason }}
        </p>
      </div>

      <DiscoveryArtifactEditor
        v-if="showEditor"
        :model-value="editorValue"
        :language="language ?? 'plain'"
        :readonly="!isEditing"
        :disabled="!canEdit || isLoading"
        @update:model-value="emit('update:customValue', $event)"
      />

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="isEditing">
          <Button
            variant="outline"
            size="sm"
            class="discovery-toolbar-btn"
            :disabled="!canEdit || isLoading"
            @click="emit('done')"
          >
            {{ t("settings.discovery.artifact.done") }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="!canEdit || isLoading"
            @click="emit('revert')"
          >
            {{ t("settings.discovery.artifact.revert") }}
          </Button>
        </template>

        <template v-else-if="mode === 'auto'">
          <Button
            variant="outline"
            size="sm"
            class="discovery-toolbar-btn"
            :disabled="!canEdit || isLoading"
            @click="emit('customize')"
          >
            {{ t("settings.discovery.artifact.customize") }}
          </Button>
          <Button
            v-if="allowDisable"
            variant="ghost"
            size="sm"
            class="discovery-toolbar-btn"
            :disabled="!canEdit || isLoading"
            @click="emit('disable')"
          >
            {{ t("settings.discovery.artifact.disable") }}
          </Button>
        </template>

        <template v-else-if="mode === 'custom'">
          <Button
            variant="outline"
            size="sm"
            class="discovery-toolbar-btn"
            :disabled="!canEdit || isLoading"
            @click="emit('customize')"
          >
            {{ t("settings.discovery.artifact.editOverride") }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="!canEdit || isLoading"
            @click="emit('revert')"
          >
            {{ t("settings.discovery.artifact.revert") }}
          </Button>
          <Button
            v-if="allowDisable"
            variant="ghost"
            size="sm"
            class="discovery-toolbar-btn"
            :disabled="!canEdit || isLoading"
            @click="emit('disable')"
          >
            {{ t("settings.discovery.artifact.disable") }}
          </Button>
        </template>

        <Badge :variant="statusVariant" class="ml-auto text-2xs font-medium">
          {{ statusLabel }}
        </Badge>

        <Button
          v-if="liveUrl"
          variant="ghost"
          size="sm"
          class="discovery-toolbar-btn text-xs"
          as="a"
          :href="liveUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t("settings.discovery.artifact.openLive") }}
          <span :class="[studioIcons.externalLink, 'size-3 ml-1']" />
        </Button>
      </div>
    </template>
  </div>
</template>
