<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { useFrameworkSettings } from "../composables";

const { t } = useStudioI18n();

const {
  utilityCards,
  isLoading,
  isSaving,
  setUtilityEngineEnabled,
  openWebsite,
} = useFrameworkSettings();
</script>

<template>
  <div class="page-card-enter px-5 py-5">
    <div v-if="isLoading" class="flex items-center justify-center py-16">
      <div
        :class="[studioIcons.loading, 'h-5 w-5 animate-spin text-muted-foreground']"
      />
    </div>

    <div v-else class="mx-auto max-w-5xl space-y-3">
      <div class="grid gap-3">
        <article
          v-for="card in utilityCards"
          :key="card.key"
          class="flex flex-col gap-3 rounded-md border border-dashed border-border/50 bg-card/40 p-5 transition-all duration-150"
          :class="
            card.isActive
              ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
              : 'hover:border-border hover:shadow-sm'
          "
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h3
                  class="truncate text-lg font-serif font-medium leading-none text-foreground"
                >
                  {{ card.name }}
                </h3>
                <span
                  class="shrink-0 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-2xs font-mono text-muted-foreground"
                >
                  {{ card.version }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="headerAction"
                      size="icon-header"
                      :aria-label="
                        t('design.utilities.openWebsite', { name: card.name })
                      "
                      @click="openWebsite(card.websiteUrl)"
                    >
                      <span :class="[studioIcons.externalLink, 'size-3']" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {{ t("design.utilities.openWebsite", { name: card.name }) }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Switch
                :model-value="card.isActive"
                :disabled="isSaving"
                :aria-label="
                  card.isActive
                    ? t('design.utilities.disableEngine', { name: card.name })
                    : t('design.utilities.enableEngine', { name: card.name })
                "
                @update:model-value="
                  (next) => setUtilityEngineEnabled(card.id, Boolean(next))
                "
              />
            </div>
          </div>

          <p class="text-sm leading-relaxed text-muted-foreground">
            {{ card.summary }}
          </p>

          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="tag in card.tags"
              :key="tag"
              class="rounded-sm border border-dashed border-border/50 px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              {{ tag }}
            </span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
