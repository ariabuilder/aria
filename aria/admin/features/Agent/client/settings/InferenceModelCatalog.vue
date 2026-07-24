<script setup lang="ts">
import { computed, ref } from "vue";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { CatalogModel } from "../../lib/schemas";

const props = defineProps<{
  models: CatalogModel[];
  enabledModelIds: string[];
  defaultModelId?: string;
  siteDefaultModelId?: string;
  canEdit?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  needsCredentials?: boolean;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  toggleModel: [modelId: string, enabled: boolean];
  setDefault: [modelId: string];
  enableRecommended: [];
}>();

const query = ref("");

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[-_/]+/g, " ");
}

const filteredModels = computed(() => {
  const q = normalizeSearchText(query.value.trim());
  if (!q) {
    return props.models;
  }

  return props.models.filter((model) => {
    const haystack = normalizeSearchText(`${model.name} ${model.id}`);
    return haystack.includes(q);
  });
});

function isEnabled(modelId: string): boolean {
  return props.enabledModelIds.includes(modelId);
}

const emptyMessage = computed(() => {
  if (props.loading) {
    return "";
  }
  if (props.needsCredentials) {
    return t("settings.agent.models.noKey");
  }
  if (props.error) {
    return props.error;
  }
  if (query.value.trim()) {
    return t("settings.agent.models.noMatch");
  }
  return t("settings.agent.models.empty");
});
</script>

<template>
  <div class="space-y-3 px-2">
    <div class="flex items-center gap-2">
      <Input
        v-model="query"
        name="aria-model-catalog-search"
        autocomplete="off"
        :placeholder="t('settings.agent.models.search')"
        class="text-xs h-9.5! hover:bg-background! bg-input! border-border/50"
        :disabled="disabled || loading"
      />
      <Button
        v-if="canEdit"
        type="button"
        variant="outline"
        size="sm"
        class="shrink-0 h-9.5!"
        :disabled="disabled || loading"
        @click="emit('enableRecommended')"
      >
        {{ t("settings.agent.models.enableRecommended") }}
      </Button>
    </div>

    <!-- Skeleton loading -->
    <ul
      v-if="loading"
      class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border/50 p-1"
    >
      <li
        v-for="n in 5"
        :key="n"
        class="flex items-center gap-2 rounded-sm px-2 py-1.5"
      >
        <Skeleton class="size-3.5 shrink-0 rounded-full" />
        <span class="min-w-0 flex-1 space-y-1">
          <Skeleton class="h-3 w-2/3" />
          <Skeleton class="h-2.5 w-1/2" />
        </span>
        <Skeleton class="h-5 w-8 shrink-0 rounded-full" />
      </li>
    </ul>

    <div
      v-else-if="filteredModels.length === 0"
      class="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-xs"
      :class="error ? 'text-destructive' : 'text-muted-foreground'"
    >
      {{ emptyMessage }}
    </div>

    <ul
      v-else
      class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border/50 p-1"
    >
      <li
        v-for="model in filteredModels"
        :key="model.id"
        class="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-muted/40"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center py-1 gap-4 text-left"
          :disabled="!canEdit || disabled || !isEnabled(model.id)"
          @click="emit('setDefault', model.id)"
        >
          <span
            :class="[
              studioIcons.star,
              'size-4 shrink-0',
              defaultModelId === model.id
                ? 'text-primary'
                : 'text-muted-foreground/30',
            ]"
          />
          <span class="min-w-0 space-y-2">
            <span class="block truncate text-xs font-medium">{{
              model.name
            }}</span>
            <span class="block truncate text-[10px] text-muted-foreground">
              {{ model.id }}
            </span>
          </span>
          <span
            v-if="siteDefaultModelId === model.id"
            class="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t("settings.agent.models.siteDefault") }}
          </span>
        </button>

        <Switch
          :model-value="isEnabled(model.id)"
          :disabled="!canEdit || disabled"
          @update:model-value="emit('toggleModel', model.id, $event)"
        />
      </li>
    </ul>
  </div>
</template>
