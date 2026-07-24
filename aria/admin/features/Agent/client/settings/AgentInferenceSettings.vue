<script setup lang="ts">
import { computed, onMounted, ref, toRef, watch } from "vue";
import { toast } from "vue-sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioI18n } from "@/i18n";
import { inferenceBackendsAvailableOnPlatform } from "../../lib/inferenceProviders";
import { getProviderInstance } from "../../lib/inference/inferenceHelpers";
import {
  listRecommendedModelIds,
  pickRecommendedDefaultModelId,
} from "../../lib/inference/recommendedModels";
import { useInferenceCatalogs } from "../composables/useInferenceCatalogs";
import { useAgentSettings } from "../composables/useAgentSettings";
import { useAgentAvailability } from "../composables/useAgentAvailability";
import InferenceProviderCard from "./InferenceProviderCard.vue";
import type {
  AgentSettings,
  AgentPlatform,
  InferenceBackendId,
  ProviderInstance,
} from "../../lib/schemas";

const props = defineProps<{
  form: AgentSettings;
  canEdit: boolean;
  platform: AgentPlatform;
  saving?: boolean;
}>();
const { t } = useStudioI18n();

const {
  isInferenceProviderListed,
  createProviderInstance,
  disableProviderInstance,
  removeProviderInstance,
  setSiteDefaultInference,
  updateProviderInstance,
  toggleInstanceModel,
  setInstanceDefaultModel,
} = useAgentSettings();
const availability = useAgentAvailability();

const {
  catalogForBackend,
  catalogLoadingForBackend,
  catalogErrorForBackend,
  needsCredentialsForCatalog,
  refreshCatalogForBackend,
  refreshListedCatalogs,
} = useInferenceCatalogs({
  platform: toRef(props, "platform"),
  form: computed(() => props.form),
  availability: availability.availability,
  isInferenceProviderListed,
});

const selectedBackendId = ref<InferenceBackendId | "">("");
const newInstanceId = ref<string | null>(null);

const sortedBackends = computed(() =>
  inferenceBackendsAvailableOnPlatform(props.platform),
);

const listedInstances = computed(() =>
  Object.values(props.form.inference.providerInstances),
);

const listedBackendIds = computed(
  () => new Set(listedInstances.value.map((i) => i.backend)),
);

const availableBackends = computed(() =>
  sortedBackends.value.filter((b) => !listedBackendIds.value.has(b.id)),
);

const allBackendsConfigured = computed(
  () => sortedBackends.value.length > 0 && availableBackends.value.length === 0,
);

function isBackendConfigured(backendId: InferenceBackendId): boolean {
  if (backendId === "workers_ai") {
    return props.platform === "cloudflare";
  }
  return (
    availability.availability.value?.configuredBackends[backendId] === true
  );
}

onMounted(() => {
  void refreshListedCatalogs();
});

watch(
  () => props.platform,
  () => void refreshListedCatalogs(),
);

watch(
  () => availability.availability.value?.configuredBackends,
  () => void refreshListedCatalogs(true),
  { deep: true },
);

watch(listedInstances, (instances, previous) => {
  const prevIds = new Set(previous?.map((i) => i.id) ?? []);
  for (const inst of instances) {
    if (!prevIds.has(inst.id)) {
      void refreshCatalogForBackend(inst.backend, true);
    }
  }
});

async function onSelectBackend(value: unknown): Promise<void> {
  const backendId = String(value) as InferenceBackendId;
  selectedBackendId.value = "";
  try {
    const instanceId = await createProviderInstance(backendId);
    newInstanceId.value = instanceId;
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.addFailed"),
    );
  }
}

async function onActivate(instanceId: string): Promise<void> {
  try {
    const inst = getProviderInstance(props.form, instanceId);
    if (!inst) return;
    await updateProviderInstance(instanceId, { enabled: true });
    await availability.refresh();
    await refreshCatalogForBackend(inst.backend, true);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.activateFailed"),
    );
  }
}

async function onDeactivate(instanceId: string): Promise<void> {
  try {
    await disableProviderInstance(instanceId);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.deactivateFailed"),
    );
  }
}

async function onRemove(instanceId: string): Promise<void> {
  try {
    await removeProviderInstance(instanceId);
    toast.success(t("settings.agent.inference.removed"));
    await availability.refresh();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.removeFailed"),
    );
  }
}

async function onSetSiteDefault(
  instanceId: string,
  modelId: string,
): Promise<void> {
  try {
    await setSiteDefaultInference(instanceId, modelId);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.setDefaultFailed"),
    );
  }
}

async function onEnableRecommended(instanceId: string): Promise<void> {
  const inst = getProviderInstance(props.form, instanceId);
  if (!inst) return;

  const recommendedModelIds = listRecommendedModelIds({
    backendId: inst.backend,
    catalog: catalogForBackend(inst.backend),
    settings: props.form,
  });

  if (recommendedModelIds.length === 0) {
    toast.error(t("settings.agent.inference.loadCatalogFirst"));
    return;
  }

  const newlyEnabled = recommendedModelIds.filter(
    (modelId) => !inst.enabledModelIds.includes(modelId),
  );

  if (newlyEnabled.length === 0) {
    toast.message(t("settings.agent.inference.recommendedAlreadyEnabled"));
    return;
  }

  const enabledModelIds = Array.from(
    new Set([...inst.enabledModelIds, ...recommendedModelIds]),
  );
  const defaultModelId = pickRecommendedDefaultModelId({
    backendId: inst.backend,
    recommendedModelIds: enabledModelIds,
    currentDefaultModelId: inst.defaultModelId,
    settings: props.form,
  });

  try {
    await updateProviderInstance(instanceId, {
      enabledModelIds,
      defaultModelId,
    });
    toast.success(
      newlyEnabled.length === 1
        ? t("settings.agent.inference.recommendedEnabledOne")
        : t("settings.agent.inference.recommendedEnabledMany", {
            count: String(newlyEnabled.length),
          }),
    );
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.inference.updateModelsFailed"),
    );
  }
}

async function onCredentialsChanged(instanceId: string): Promise<void> {
  const inst = getProviderInstance(props.form, instanceId);
  if (!inst) return;
  // Credentials were just written, so the cached pre-save availability state
  // must not prevent the model catalog from loading.
  await availability.refresh({ force: true });
  await refreshCatalogForBackend(inst.backend, true);
}

function onExpandCard(instanceId: string): void {
  const inst = getProviderInstance(props.form, instanceId);
  if (!inst) return;
  void refreshCatalogForBackend(inst.backend, false);
}
</script>

<template>
  <section class="space-y-4 pt-4">
    <Teleport defer to="#settings-tab-actions">
      <HeaderActionTooltip
        v-if="canEdit && allBackendsConfigured"
        :label="t('settings.agent.inference.allProvidersAdded')"
        side="bottom"
        disabled
      >
        <span
          :class="
            cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'opacity-50',
            )
          "
        >
          {{ t("settings.agent.inference.addProvider") }}
        </span>
      </HeaderActionTooltip>
      <Select
        v-else-if="canEdit && availableBackends.length > 0"
        :model-value="selectedBackendId"
        :disabled="saving"
        @update:model-value="onSelectBackend"
      >
        <SelectTrigger
          hide-icon
          :class="
            cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'w-auto! min-w-0 shrink-0 placeholder:text-primary-foreground/90 data-[state=open]:border-primary data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground',
            )
          "
        >
          <SelectValue
            :placeholder="t('settings.agent.inference.addProvider')"
          />
        </SelectTrigger>
        <SelectContent side="left">
          <SelectItem
            v-for="backend in availableBackends"
            :key="backend.id"
            :value="backend.id"
          >
            {{ backend.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </Teleport>

    <div
      v-if="listedInstances.length === 0"
      class="rounded-md border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {{ t("settings.agent.inference.empty") }}
    </div>

    <div v-else class="space-y-3">
      <InferenceProviderCard
        v-for="instance in listedInstances"
        :key="instance.id"
        :instance="instance"
        :form="form"
        :catalog-models="catalogForBackend(instance.backend)"
        :catalog-loading="catalogLoadingForBackend(instance.backend)"
        :catalog-error="catalogErrorForBackend(instance.backend)"
        :needs-credentials="needsCredentialsForCatalog(instance.backend)"
        :configured="isBackendConfigured(instance.backend)"
        :can-edit="canEdit"
        :saving="saving"
        :expanded="instance.id === newInstanceId || undefined"
        @activate="onActivate(instance.id)"
        @deactivate="onDeactivate(instance.id)"
        @remove="onRemove(instance.id)"
        @expand="onExpandCard(instance.id)"
        @set-site-default="(modelId) => onSetSiteDefault(instance.id, modelId)"
        @toggle-model="
          (modelId, enabled) =>
            toggleInstanceModel(instance.id, modelId, enabled)
        "
        @set-provider-default="
          (modelId) => setInstanceDefaultModel(instance.id, modelId)
        "
        @enable-recommended="onEnableRecommended(instance.id)"
        @credentials-changed="onCredentialsChanged(instance.id)"
      />
    </div>
  </section>
</template>
