<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { studioIcons } from "@/lib/icons";
import { useSettingsDialog } from "@/features/Studio/settings";
import { getInferenceBackendDefinition } from "../../lib/inferenceProviders";
import { getProviderState } from "../../lib/inference/inferenceHelpers";
import { listAvailableChatInferenceModes } from "../../lib/chatInference";
import type {
  AgentAvailability,
  AgentSettings,
  InferenceBackendId,
} from "../../lib/schemas";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  availability: AgentAvailability;
  siteSettings: AgentSettings;
  activeProvider: InferenceBackendId;
  activeModelId?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  selectModel: [provider: InferenceBackendId, modelId: string];
}>();

const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();
const isOpen = ref(false);

const readyBackends = computed(() =>
  listAvailableChatInferenceModes({
    platform: props.availability.platform,
    siteSettings: props.siteSettings,
    workersAiAvailable: props.availability.workersAiAvailable,
    configuredBackends: props.availability.configuredBackends,
    sessionProvider: props.activeProvider,
    sessionModelId: props.activeModelId,
  }),
);

const groupedModels = computed(() =>
  readyBackends.value
    .map((backendId) => {
      const state = getProviderState(props.siteSettings, backendId);
      const label = getInferenceBackendDefinition(backendId).label;
      const enabledModelIds = state?.enabledModelIds ?? [];
      const models = enabledModelIds.map((modelId) => ({
        id: modelId,
        label: modelId,
      }));

      return { backendId, label, models };
    })
    .filter((group) => group.models.length > 0),
);

const providerLabel = computed(() => {
  const inst = Object.values(
    props.siteSettings.inference.providerInstances,
  ).find((i) => i.id === props.activeProvider);
  if (inst) return inst.label;
  try {
    return getInferenceBackendDefinition(props.activeProvider).label;
  } catch {
    return props.activeProvider;
  }
});

const selectedModelLabel = computed(() => {
  const id = props.activeModelId;
  if (!id) {
    return t("agent.model.select");
  }

  for (const group of groupedModels.value) {
    const match = group.models.find((model) => model.id === id);
    if (match) {
      return match.label;
    }
  }

  return id;
});

function handleSelectModel(
  provider: InferenceBackendId,
  modelId: string,
): void {
  emit("selectModel", provider, modelId);
  isOpen.value = false;
}

function openSettings(): void {
  isOpen.value = false;
  settingsDialog.open("agent");
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        class="h-7 min-w-0 max-w-[240px] justify-start gap-0 px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
        :disabled="disabled || groupedModels.length === 0"
      >
        <span class="truncate text-left ml-2">{{ selectedModelLabel }}</span>
        <span
          :class="[
            studioIcons.chevronDown,
            'ml-auto size-3 shrink-0 opacity-60',
          ]"
        />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-74 p-0 ml-1 -mb-1 rounded-sm! overflow-hidden! border-border! border-0.5" align="start" :side-offset="6">
      <Command>
        <div class="flex items-center gap-0.5 pl-2.5 pr-2.5 pt-1 pb-1 border-b border-border border-dashed">
          <CommandInput
            :placeholder="t('agent.model.search')"
            wrapper-class="min-w-0 flex-1 h-8! min-h-8! gap-0 border-0 bg-transparent pl-1 pr-0  [&>span]:hidden"
            class="h-8! min-h-8! px-2 py-0 text-xs! caret-foreground group-hover:text-foreground placeholder:text-muted-foreground/50"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            :aria-label="t('agent.model.settings')"
            @click="openSettings"
          >
            <span :class="[studioIcons.settings, 'size-3.5']" />
          </Button>
        </div>
        <CommandList>
          <CommandEmpty>{{ t("agent.model.none") }}</CommandEmpty>

          <CommandGroup
            v-for="group in groupedModels"
            :key="group.backendId"
            :heading="group.label"
          >
            <CommandItem
              v-for="model in group.models"
              :key="`${group.backendId}:${model.id}`"
              :value="`${group.label} ${model.label} ${model.id}`"
              @select="handleSelectModel(group.backendId, model.id)"
            >
              <span class="truncate ml-2.5 mr-2">{{ model.label }}</span>
              <span
                v-if="
                  activeProvider === group.backendId &&
                  activeModelId === model.id
                "
                :class="[
                  studioIcons.lightning,
                  'ml-auto mr-2.5 size-3.5 shrink-0 text-primary',
                ]"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
