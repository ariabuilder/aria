<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  getInferenceBackendDefinition,
  isCredentialBackend,
} from "../../lib/inferenceProviders";
import { isSiteDefaultInference } from "../../lib/inference/inferenceHelpers";
import InferenceCredentialFields from "./InferenceCredentialFields.vue";
import InferenceModelCatalog from "./InferenceModelCatalog.vue";
import type {
  AgentSettings,
  CatalogModel,
  ProviderInstance,
} from "../../lib/schemas";

const props = defineProps<{
  instance: ProviderInstance;
  form: AgentSettings;
  catalogModels: CatalogModel[];
  catalogLoading?: boolean;
  catalogError?: string | null;
  needsCredentials?: boolean;
  configured?: boolean;
  canEdit?: boolean;
  saving?: boolean;
  expanded?: boolean;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  activate: [];
  deactivate: [];
  remove: [];
  expand: [];
  setSiteDefault: [modelId: string];
  toggleModel: [modelId: string, enabled: boolean];
  setProviderDefault: [modelId: string];
  enableRecommended: [];
  credentialsChanged: [];
}>();

const isExpanded = ref(props.expanded ?? false);
const isConfirmingRemove = ref(false);

watch(
  () => props.expanded,
  (val) => {
    if (val !== undefined) isExpanded.value = val;
  },
);

watch(isExpanded, (expanded) => {
  if (expanded) {
    emit("expand");
  }
});

const definition = computed(() =>
  getInferenceBackendDefinition(props.instance.backend),
);

const isActive = computed(() => props.instance.enabled === true);

const siteDefaultModelId = computed(() =>
  props.form.inference.default?.instanceId === props.instance.id
    ? props.form.inference.default.modelId
    : undefined,
);

const isSiteDefaultProvider = computed(() =>
  isSiteDefaultInference(props.form, props.instance.id),
);

const requiresCredentialSetup = computed(() =>
  isCredentialBackend(props.instance.backend),
);

const canBrowseModels = computed(
  () => !requiresCredentialSetup.value || props.configured === true,
);

function providerDescription(): string {
  const descriptions = {
    workers_ai: t("settings.agent.inference.provider.workers_ai"),
    opencode: t("settings.agent.inference.provider.opencode"),
    openai: t("settings.agent.inference.provider.openai"),
    anthropic: t("settings.agent.inference.provider.anthropic"),
    google: t("settings.agent.inference.provider.google"),
    openrouter: t("settings.agent.inference.provider.openrouter"),
    openai_compatible: t("settings.agent.inference.provider.openai_compatible"),
  };

  return descriptions[props.instance.backend] ?? definition.value.description;
}
</script>

<template>
  <div
    :class="[
      'overflow-hidden rounded-md border bg-input shadow-sm transition-colors',
      isSiteDefaultProvider
        ? 'border-primary/30 ring-1 ring-primary/20'
        : 'border-border/50 hover:border-border/50! hover:bg-background! hover:text-primary-foreground!',
    ]"
  >
    <div class="flex items-start gap-1 px-2 py-2 sm:px-3 sm:py-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-1.5 py-1 text-left cursor-pointer"
        @click="isExpanded = !isExpanded"
      >
        <span
          :class="[
            studioIcons.chevronDown,
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            isExpanded ? 'rotate-0' : '-rotate-90',
          ]"
        />

        <span class="min-w-0 flex-1 space-y-2">
          <span class="flex flex-wrap items-center gap-2">
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :class="isActive ? 'bg-primary' : 'bg-destructive'"
            />
            <span class="text-sm font-medium leading-none">
              {{ definition.label }}
            </span>
            <span
              v-if="isSiteDefaultProvider"
              class="rounded-md bg-primary/30 ml-1 px-1.5 py-1 text-4xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {{ t("settings.agent.inference.default") }}
            </span>
          </span>
          <span class="block text-xs leading-relaxed text-muted-foreground">
            {{ providerDescription() }}
          </span>
        </span>
      </button>

      <div v-if="canEdit" class="flex shrink-0 items-center gap-0.5 pt-0.5">
        <HeaderActionTooltip
          v-if="isActive"
          :label="t('settings.agent.inference.deactivate')"
          side="top"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-7 text-muted-foreground hover:text-foreground"
            :disabled="saving"
            @click.stop="emit('deactivate')"
          >
            <span :class="[studioIcons.unpublish, 'size-3.5']" />
            <span class="sr-only">{{
              t("settings.agent.inference.deactivate")
            }}</span>
          </Button>
        </HeaderActionTooltip>

        <HeaderActionTooltip
          v-else
          :label="t('settings.agent.inference.activate')"
          side="top"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-7 text-muted-foreground hover:text-foreground"
            :disabled="saving"
            @click.stop="emit('activate')"
          >
            <span :class="[studioIcons.publish, 'size-3.5']" />
            <span class="sr-only">{{
              t("settings.agent.inference.activate")
            }}</span>
          </Button>
        </HeaderActionTooltip>

        <!-- Remove confirm / cancel -->
        <template v-if="isConfirmingRemove">
          <HeaderActionTooltip :label="t('common.cancel')" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="size-7 text-muted-foreground hover:text-destructive"
              :disabled="saving"
              @click.stop="isConfirmingRemove = false"
            >
              <span :class="[studioIcons.close, 'size-3.5']" />
              <span class="sr-only">{{ t("common.cancel") }}</span>
            </Button>
          </HeaderActionTooltip>
          <HeaderActionTooltip
            :label="t('settings.agent.inference.confirmRemove')"
            side="top"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              :disabled="saving"
              @click.stop="
                isConfirmingRemove = false;
                emit('remove');
              "
            >
              <span :class="[studioIcons.check, 'size-3.5']" />
              <span class="sr-only">{{
                t("settings.agent.inference.confirmRemove")
              }}</span>
            </Button>
          </HeaderActionTooltip>
        </template>
        <HeaderActionTooltip
          v-else
          :label="t('settings.agent.inference.removeProvider')"
          side="top"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            :disabled="saving"
            @click.stop="isConfirmingRemove = true"
          >
            <span :class="[studioIcons.trash, 'size-3.5']" />
            <span class="sr-only">{{
              t("settings.agent.inference.removeProvider")
            }}</span>
          </Button>
        </HeaderActionTooltip>
      </div>
    </div>

    <div
      v-if="isExpanded"
      class="space-y-4 border-t border-border/50 border-dashed bg-background px-4 py-4 sm:px-5"
      :class="{ 'opacity-50': !isActive }"
    >
      <InferenceCredentialFields
        v-if="isCredentialBackend(instance.backend)"
        :backend-id="instance.backend"
        :configured="configured"
        :can-edit="canEdit"
        :disabled="!isActive || saving"
        :base-url="instance.baseUrl"
        @credentials-changed="emit('credentialsChanged')"
      />

      <InferenceModelCatalog
        v-if="canBrowseModels"
        :models="catalogModels"
        :enabled-model-ids="instance.enabledModelIds"
        :default-model-id="instance.defaultModelId"
        :site-default-model-id="siteDefaultModelId"
        :can-edit="canEdit"
        :disabled="!isActive || saving"
        :loading="catalogLoading"
        :error="catalogError"
        :needs-credentials="needsCredentials"
        @toggle-model="
          (modelId, enabled) => emit('toggleModel', modelId, enabled)
        "
        @set-default="emit('setProviderDefault', $event)"
        @enable-recommended="emit('enableRecommended')"
      />

      <Button
        v-if="canEdit && isActive && instance.defaultModelId && canBrowseModels"
        variant="outline"
        size="xs"
        class="h-9.5! ml-2"
        :disabled="saving || isSiteDefaultProvider"
        @click="emit('setSiteDefault', instance.defaultModelId!)"
      >
        {{ t("settings.agent.inference.setSiteDefault") }}
      </Button>
    </div>
  </div>
</template>
