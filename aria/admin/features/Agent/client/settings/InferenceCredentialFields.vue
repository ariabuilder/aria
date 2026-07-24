<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  getInferenceBackendDefinition,
  isCredentialBackend,
} from "../../lib/inferenceProviders";
import type { InferenceBackendId } from "../../lib/schemas";

const props = defineProps<{
  backendId: InferenceBackendId;
  configured?: boolean;
  canEdit?: boolean;
  disabled?: boolean;
  baseUrl?: string;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  saveBaseUrl: [baseUrl: string];
  credentialsChanged: [];
}>();

const apiKey = ref("");
const isSaving = ref(false);
const isRemoving = ref(false);
const isConfirmingRemoveKey = ref(false);

const apiKeyError = ref<string | null>(null);
const baseUrlError = ref<string | null>(null);
const saveError = ref<string | null>(null);

function validateApiKey(): void {
  const trimmed = apiKey.value.trim();
  if (!trimmed) {
    apiKeyError.value = t("settings.agent.credentials.keyRequired");
    return;
  }
  if (trimmed.length < 8) {
    apiKeyError.value = t("settings.agent.credentials.keyTooShort");
    return;
  }
  if (/\s/.test(trimmed)) {
    apiKeyError.value = t("settings.agent.credentials.keyWhitespace");
    return;
  }
  apiKeyError.value = null;
}

function validateBaseUrl(): void {
  const url = props.baseUrl?.trim();
  if (!url) {
    baseUrlError.value = t("settings.agent.credentials.baseUrlRequired");
    return;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      baseUrlError.value = t("settings.agent.credentials.baseUrlProtocol");
      return;
    }
    baseUrlError.value = null;
  } catch {
    baseUrlError.value = t("settings.agent.credentials.invalidUrl");
  }
}

// Clear errors when user starts editing
watch(apiKey, () => {
  if (apiKeyError.value) apiKeyError.value = null;
});
watch(
  () => props.baseUrl,
  () => {
    if (baseUrlError.value) baseUrlError.value = null;
  },
);

const credentialBackend = computed(() => isCredentialBackend(props.backendId));
const isCompatible = computed(() => props.backendId === "openai_compatible");

const apiKeyPlaceholder = computed(() =>
  props.configured
    ? t("settings.agent.credentials.keySavedPlaceholder")
    : t("settings.agent.credentials.key"),
);

const definition = computed(() =>
  getInferenceBackendDefinition(props.backendId),
);

const showGetKeyHint = computed(() => {
  if (props.configured || apiKey.value.trim()) {
    return false;
  }
  return !!definition.value.keyUrl;
});

const getKeyHref = computed(() => definition.value.keyUrl ?? null);

const getKeyLabel = computed(() => {
  if (!definition.value.keyUrl) return null;
  try {
    const url = new URL(definition.value.keyUrl);
    return url.hostname + url.pathname.replace(/\/$/, "");
  } catch {
    return definition.value.keyUrl;
  }
});

async function saveKey(): Promise<void> {
  validateApiKey();
  if (apiKeyError.value) return;

  if (!isCredentialBackend(props.backendId)) {
    return;
  }

  saveError.value = null;
  isSaving.value = true;
  try {
    const { error } = await actions.settings.updateAgentProvider({
      provider: props.backendId,
      apiKey: apiKey.value.trim(),
      baseUrl: props.baseUrl,
    });
    if (error) {
      throw error;
    }
    apiKey.value = "";
    toast.success(t("settings.agent.credentials.keySaved"));
    emit("credentialsChanged");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("settings.agent.credentials.saveKeyFailed");
    saveError.value = message;
    toast.error(message);
  } finally {
    isSaving.value = false;
  }
}

async function removeKey(): Promise<void> {
  if (!isCredentialBackend(props.backendId)) {
    return;
  }

  isRemoving.value = true;
  try {
    const { error } = await actions.settings.removeAgentProvider({
      provider: props.backendId,
    });
    if (error) {
      throw error;
    }
    apiKey.value = "";
    toast.success(t("settings.agent.credentials.keyRemoved"));
    emit("credentialsChanged");
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.agent.credentials.removeKeyFailed"),
    );
  } finally {
    isRemoving.value = false;
  }
}
</script>

<template>
  <div v-if="credentialBackend" class="space-y-7 px-2 py-2">
    <div class="flex items-center gap-3">
      <h4 class="text-sm m-0 font-medium">
        {{ t("settings.agent.credentials.key") }}
      </h4>
      <span
        v-if="configured"
        class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
      >
        <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        {{ t("settings.agent.credentials.saved") }}
      </span>
    </div>

    <div v-if="isCompatible" class="space-y-1">
      <Input
        :model-value="baseUrl ?? ''"
        :placeholder="t('settings.agent.credentials.baseUrl')"
        :class="['h-9.5! text-xs', baseUrlError ? 'border-destructive!' : '']"
        :disabled="!canEdit || disabled"
        @blur="validateBaseUrl"
        @update:model-value="emit('saveBaseUrl', String($event))"
      />
      <p v-if="baseUrlError" class="text-xs text-destructive">
        {{ baseUrlError }}
      </p>
    </div>

    <div v-if="canEdit" class="space-y-1.5">
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1 space-y-1">
          <Input
            v-model="apiKey"
            type="password"
            name="aria-inference-api-key"
            autocomplete="new-password"
            :placeholder="apiKeyPlaceholder"
            :class="[
              'w-full text-xs h-9.5! hover:bg-background! bg-input!',
              apiKeyError ? 'border-destructive!' : 'border-border/50',
            ]"
            :disabled="disabled || isSaving || isRemoving"
            @blur="validateApiKey"
          />
          <p v-if="apiKeyError" class="text-xs text-destructive">
            {{ apiKeyError }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <HeaderActionTooltip
            :label="t('settings.agent.credentials.saveKey')"
            side="top"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="size-7 text-muted-foreground hover:text-foreground"
              :disabled="disabled || isSaving || isRemoving || !apiKey.trim()"
              @click="saveKey"
            >
              <span :class="[studioIcons.save, 'size-3.5']" />
              <span class="sr-only">{{
                t("settings.agent.credentials.saveKey")
              }}</span>
            </Button>
          </HeaderActionTooltip>

          <!-- Remove key confirm / cancel -->
          <template v-if="configured && isConfirmingRemoveKey">
            <HeaderActionTooltip :label="t('common.cancel')" side="top">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                class="size-7 text-muted-foreground hover:text-destructive"
                :disabled="disabled"
                @click="isConfirmingRemoveKey = false"
              >
                <span :class="[studioIcons.close, 'size-3.5']" />
                <span class="sr-only">{{ t("common.cancel") }}</span>
              </Button>
            </HeaderActionTooltip>
            <HeaderActionTooltip
              :label="t('settings.agent.credentials.confirmRemove')"
              side="top"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                class="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                :disabled="disabled || isSaving || isRemoving"
                @click="
                  isConfirmingRemoveKey = false;
                  removeKey();
                "
              >
                <span :class="[studioIcons.check, 'size-3.5']" />
                <span class="sr-only">{{
                  t("settings.agent.credentials.confirmRemove")
                }}</span>
              </Button>
            </HeaderActionTooltip>
          </template>
          <HeaderActionTooltip
            v-else-if="configured"
            :label="t('settings.agent.credentials.removeKey')"
            side="top"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              :disabled="disabled || isSaving || isRemoving"
              @click="isConfirmingRemoveKey = true"
            >
              <span :class="[studioIcons.trash, 'size-3.5']" />
              <span class="sr-only">{{
                t("settings.agent.credentials.removeKey")
              }}</span>
            </Button>
          </HeaderActionTooltip>
        </div>
      </div>
      <p v-if="saveError" class="text-xs text-destructive">
        {{ saveError }}
      </p>
      <p v-if="isConfirmingRemoveKey" class="text-xs text-destructive">
        {{ t("settings.agent.credentials.removeWarning") }}
      </p>
      <p v-else-if="configured" class="text-xs text-muted-foreground">
        {{ t("settings.agent.credentials.savedHint") }}
      </p>
      <p
        v-else-if="showGetKeyHint && getKeyHref && getKeyLabel"
        class="pt-3 text-xs text-muted-foreground"
      >
        {{ t("settings.agent.credentials.getKeyAt") }}
        <a
          :href="getKeyHref"
          target="_blank"
          rel="noopener noreferrer"
          class="underline underline-offset-2"
        >
          {{ getKeyLabel }}
        </a>
      </p>
    </div>
  </div>
</template>
