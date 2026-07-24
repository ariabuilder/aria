<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rememberDaysOptions } from "../../composables/usePageAccessState";
import type { PageAccessMode } from "../../composables/usePageForm";
import { useStudioI18n } from "@/i18n";

defineProps<{
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
  isDirty?: boolean;
  isLockedToPublic?: boolean;
}>();

const emit = defineEmits<{
  save: [];
}>();

const accessMode = defineModel<PageAccessMode>("accessMode", { required: true });
const password = defineModel<string>("password", { required: true });
const promptTitle = defineModel<string>("promptTitle", { required: true });
const promptDescription = defineModel<string>("promptDescription", {
  required: true,
});
const rememberDays = defineModel<number | null>("rememberDays", {
  required: true,
});
const { t } = useStudioI18n();

function rememberDaysLabel(days: number | null): string {
  if (days === null) return t("pages.access.sessionOnly");
  if (days === 1) return t("pages.access.oneDay");
  return t("pages.access.days", { days });
}

const rowClass = "flex flex-col items-start gap-1.5";
const labelClass = "text-sm! text-muted-foreground";
const inputClass =
  "h-9 w-full text-foreground placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-0";
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div v-if="isLoading" class="text-xs text-muted-foreground">
      {{ t("pages.access.loading") }}
    </div>

    <template v-else>
      <section class="space-y-5">
        <Label class="text-sm! text-muted-foreground">
          {{ t("pages.detail.tabs.access") }}
        </Label>

        <div :class="rowClass">
          <Label :class="labelClass">{{ t("pages.access.mode") }}</Label>
          <Select v-model="accessMode" :disabled="isLockedToPublic || isSaving">
            <SelectTrigger class="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{{ t("pages.access.public") }}</SelectItem>
              <SelectItem value="password">{{ t("pages.access.passwordProtected") }}</SelectItem>
              <SelectItem value="private">{{ t("pages.access.private") }}</SelectItem>
              <SelectItem value="unlisted">{{ t("pages.access.unlisted") }}</SelectItem>
            </SelectContent>
          </Select>
          <p
            v-if="isLockedToPublic"
            class="text-xs text-muted-foreground"
          >
            {{ t("pages.access.alwaysPublic") }}
          </p>
        </div>

        <template v-if="accessMode === 'password'">
          <div :class="rowClass">
            <Label :class="labelClass">{{ t("pages.access.password") }}</Label>
            <Input
              v-model="password"
              type="text"
              :placeholder="t('pages.access.passwordPlaceholder')"
              :class="inputClass"
              :disabled="isSaving"
            />
          </div>

          <div :class="rowClass">
            <Label :class="labelClass">{{ t("pages.access.prompt") }}</Label>
            <Input
              v-model="promptTitle"
              :placeholder="t('pages.access.promptPlaceholder')"
              :class="inputClass"
              :disabled="isSaving"
            />
          </div>

          <div :class="rowClass">
            <Label :class="labelClass">{{ t("pages.access.hint") }}</Label>
            <Textarea
              v-model="promptDescription"
              :placeholder="t('pages.access.hintPlaceholder')"
              rows="2"
              class="min-h-20 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm w-full placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-0"
              :disabled="isSaving"
            />
          </div>

          <div :class="rowClass">
            <Label :class="labelClass">{{ t("pages.access.remember") }}</Label>
            <Select
              :model-value="String(rememberDays)"
              :disabled="isSaving"
              @update:model-value="
                rememberDays = $event === 'null' ? null : Number($event)
              "
            >
              <SelectTrigger class="h-9 text-sm">
                <SelectValue :placeholder="t('pages.access.sessionOnly')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in rememberDaysOptions"
                  :key="String(opt.value)"
                  :value="String(opt.value)"
                >
                  {{ rememberDaysLabel(opt.value) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </template>
      </section>

      <div v-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>

      <div class="flex items-center gap-3 pt-2">
        <span v-if="isDirty" class="text-xs text-muted-foreground">
          {{ t("pages.access.unsavedChanges") }}
        </span>
        <Button
          size="sm"
          class="h-9"
          :disabled="isSaving || !isDirty"
          @click="emit('save')"
        >
          {{ isSaving ? t("pages.detail.saving") : t("common.save") }}
        </Button>
      </div>
    </template>
  </div>
</template>
