<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCapabilities } from "@/composables/useCapabilities";
import { useStudioI18n } from "@/i18n";
import { AGENT_MCP_PATH } from "../../lib/constants";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { McpScope, McpTokenListItem } from "../../lib/schemas";

const props = defineProps<{
  canEdit: boolean;
}>();
const { t } = useStudioI18n();

const { hasCapability } = useCapabilities();
const canCreateServiceToken = computed(
  () => props.canEdit && hasCapability("editAgentSettings"),
);
const canGrantDesignScope = computed(() => hasCapability("editSiteSettings"));
const canGrantWriteScope = computed(
  () => hasCapability("editPages") || hasCapability("editCms"),
);
const canGrantPublishScope = computed(() => hasCapability("publishContent"));

const tokens = ref<McpTokenListItem[]>([]);
const isLoading = ref(false);
const isRevoking = ref(false);
const error = ref<string | null>(null);
const expandedTokenId = ref<string | null>(null);
const revokingTokenId = ref<string | null>(null);
const newTokenValues = ref<Record<string, string>>({});
const copiedTokenIds = ref<Set<string>>(new Set());
const setupOpen = ref(false);

const mcpUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}${AGENT_MCP_PATH}`
    : AGENT_MCP_PATH;

const scopeLabels: Partial<Record<McpScope, string>> = {
  "mcp:read": t("settings.mcp.scope.read"),
  "mcp:write": t("settings.mcp.scope.write"),
  "mcp:design": t("settings.mcp.scope.design"),
  "mcp:publish": t("settings.mcp.scope.publish"),
};

const availableScopes = computed(() => {
  const scopes: McpScope[] = ["mcp:read"];
  if (canGrantWriteScope.value) scopes.push("mcp:write");
  if (canGrantDesignScope.value) scopes.push("mcp:design");
  if (canGrantPublishScope.value) scopes.push("mcp:publish");
  return scopes;
});

function toggleExpand(tokenId: string): void {
  expandedTokenId.value = expandedTokenId.value === tokenId ? null : tokenId;
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("settings.mcp.copied", { label }));
  } catch {
    toast.error(t("settings.mcp.copyFailed"));
  }
}

async function copyMcpUrl(): Promise<void> {
  return copyToClipboard(mcpUrl, t("settings.mcp.url"));
}

async function copyTokenValue(tokenId: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copiedTokenIds.value = new Set([...copiedTokenIds.value, tokenId]);
    toast.success(t("settings.mcp.tokenCopied"));
  } catch {
    toast.error(t("settings.mcp.copyTokenFailed"));
  }
}

async function loadTokens(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const { data, error: actionError } = await actions.agent.listMcpTokens({});
    if (actionError) {
      throw actionError;
    }
    const payload = data as {
      success: true;
      data: { tokens: McpTokenListItem[] };
    };
    tokens.value = payload.data.tokens;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : t("settings.mcp.loadFailed");
  } finally {
    isLoading.value = false;
  }
}

async function createToken(type: "personal" | "service"): Promise<void> {
  if (!props.canEdit) return;
  const scopes: McpScope[] = ["mcp:read"];

  isLoading.value = true;
  error.value = null;
  try {
    const name =
      type === "personal"
        ? t("settings.mcp.personal")
        : t("settings.mcp.service");
    const { data, error: actionError } = await actions.agent.createMcpToken({
      type,
      name,
      scopes,
    });
    if (actionError) {
      throw actionError;
    }
    const payload = data as {
      success: true;
      data: { token: string; record: McpTokenListItem };
    };
    newTokenValues.value = {
      ...newTokenValues.value,
      [payload.data.record.id]: payload.data.token,
    };
    await loadTokens();
    expandedTokenId.value = payload.data.record.id;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : t("settings.mcp.createFailed");
  } finally {
    isLoading.value = false;
  }
}

function beginRevoke(tokenId: string): void {
  revokingTokenId.value = revokingTokenId.value === tokenId ? null : tokenId;
}

async function executeRevoke(tokenId: string): Promise<void> {
  if (!props.canEdit) return;
  isRevoking.value = true;
  try {
    await actions.agent.revokeMcpToken({ tokenId });
    await loadTokens();
    revokingTokenId.value = null;
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t("settings.mcp.revokeFailed"),
    );
  } finally {
    isRevoking.value = false;
  }
}

async function toggleTokenScope(
  token: McpTokenListItem,
  scope: McpScope,
): Promise<void> {
  const hasScope = token.scopes.includes(scope);
  const newScopes = hasScope
    ? token.scopes.filter((s) => s !== scope)
    : [...token.scopes, scope];

  if (newScopes.length === 0) return;

  try {
    const { data, error: actionError } = await actions.agent.updateMcpToken({
      tokenId: token.id,
      scopes: newScopes,
    });
    if (actionError) throw actionError;
    await loadTokens();
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t("settings.mcp.scopeUpdateFailed"),
    );
  }
}

const configJson = computed(() => {
  const lines = [
    "{",
    '  "mcpServers": {',
    '    "aria-builder": {',
    `      "url": "${mcpUrl}",`,
    '      "headers": {',
    '        "Authorization": "Bearer ARIA_MCP_TOKEN"',
    "      }",
    "    }",
    "  }",
    "}",
  ];
  return lines.join("\n");
});

onMounted(() => {
  void loadTokens();
});
</script>

<template>
  <section class="space-y-4 pt-4">
    <Teleport defer to="#settings-tab-actions">
      <Select
        v-if="canEdit"
        :model-value="''"
        :disabled="isLoading"
        @update:model-value="createToken($event as 'personal' | 'service')"
      >
        <SelectTrigger
          hide-icon
          :class="
            cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'w-auto! min-w-0 shrink-0 gap-1.5 placeholder:text-primary-foreground/90 data-[state=open]:border-primary data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground',
            )
          "
        >
          <span :class="[studioIcons.plus, 'size-3.5']" aria-hidden="true" />
          <SelectValue :placeholder="t('settings.mcp.addToken')" />
        </SelectTrigger>
        <SelectContent side="left">
          <SelectItem value="personal">
            {{ t("settings.mcp.personalToken") }}
          </SelectItem>
          <SelectItem v-if="canCreateServiceToken" value="service">
            {{ t("settings.mcp.serviceToken") }}
          </SelectItem>
        </SelectContent>
      </Select>
    </Teleport>

    <!-- Setup Instructions -->
    <Collapsible v-model:open="setupOpen" class="group">
      <CollapsibleTrigger
        class="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-input px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-background duration-150 transition-colors"
      >
        <span
          :class="[studioIcons.code, 'size-4 shrink-0 text-muted-foreground']"
        />
        {{ t("settings.mcp.setup.title") }}
        <span
          :class="[
            studioIcons.chevronRight,
            'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90',
          ]"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="pt-3">
        <div
          class="space-y-4 rounded-md border border-border/50 bg-background p-4"
        >
          <!-- Step 1: URL -->
          <div class="space-y-1.5">
            <p class="text-xs font-medium text-foreground">
              {{ t("settings.mcp.setup.endpoint.title") }}
            </p>
            <p class="text-2xs text-muted-foreground">
              {{ t("settings.mcp.setup.endpoint.description") }}
            </p>
            <div class="flex items-center gap-2">
              <code
                class="flex-1 cursor-pointer truncate rounded border border-border/50 bg-input px-2 py-1 text-xs font-mono text-primary hover:text-primary/80"
                :title="t('settings.mcp.clickToCopy')"
                @click="copyMcpUrl"
                >{{ mcpUrl }}</code
              >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0 text-muted-foreground"
                :title="t('settings.mcp.copyUrl')"
                @click="copyMcpUrl"
              >
                <span :class="[studioIcons.copy, 'size-4']" />
                <span class="sr-only">{{ t("settings.mcp.copyUrl") }}</span>
              </Button>
            </div>
          </div>

          <!-- Step 2: Token -->
          <div class="space-y-1.5">
            <p class="text-xs font-medium text-foreground">
              {{ t("settings.mcp.setup.token.title") }}
            </p>
            <p class="text-2xs text-muted-foreground">
              {{ t("settings.mcp.setup.token.description") }}
            </p>
          </div>

          <!-- Step 3: Client configuration -->
          <div class="space-y-1.5">
            <p class="text-xs font-medium text-foreground">
              {{ t("settings.mcp.setup.client.title") }}
            </p>
            <p class="text-2xs text-muted-foreground">
              {{ t("settings.mcp.setup.client.description") }}
            </p>
            <div class="relative">
              <pre
                class="overflow-x-auto rounded border border-border/50 bg-input p-3 text-2xs leading-relaxed font-mono"
              ><code>{{ configJson }}</code></pre>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="absolute top-2 right-2 h-7 w-7 shrink-0 text-muted-foreground"
                :title="t('settings.mcp.copyConfig')"
                @click="
                  copyToClipboard(configJson, t('settings.mcp.configuration'))
                "
              >
                <span :class="[studioIcons.copy, 'size-4']" />
                <span class="sr-only">{{ t("settings.mcp.copyConfig") }}</span>
              </Button>
            </div>
          </div>

          <!-- Step 4: Available tools -->
          <div class="space-y-1.5">
            <p class="text-xs font-medium text-foreground">
              {{ t("settings.mcp.setup.scopes.title") }}
            </p>
            <p class="text-2xs text-muted-foreground">
              {{ t("settings.mcp.setup.scopes.description") }}
            </p>
            <div class="space-y-2 text-2xs text-muted-foreground">
              <div class="flex items-start gap-2">
                <span
                  :class="[
                    studioIcons.checkLinear,
                    'mt-0.5 size-3.5 shrink-0 text-emerald-500',
                  ]"
                />
                <div>
                  <span class="font-medium text-foreground">{{
                    t("settings.mcp.scope.read")
                  }}</span>
                  — {{ t("settings.mcp.scope.readDescription") }}
                </div>
              </div>
              <div v-if="canGrantWriteScope" class="flex items-start gap-2">
                <span
                  :class="[
                    studioIcons.checkLinear,
                    'mt-0.5 size-3.5 shrink-0 text-emerald-500',
                  ]"
                />
                <div>
                  <span class="font-medium text-foreground">{{
                    t("settings.mcp.scope.write")
                  }}</span>
                  — {{ t("settings.mcp.scope.writeDescription") }}
                </div>
              </div>
              <div v-if="canGrantDesignScope" class="flex items-start gap-2">
                <span
                  :class="[
                    studioIcons.checkLinear,
                    'mt-0.5 size-3.5 shrink-0 text-emerald-500',
                  ]"
                />
                <div>
                  <span class="font-medium text-foreground">{{
                    t("settings.mcp.scope.design")
                  }}</span>
                  — {{ t("settings.mcp.scope.designDescription") }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <div v-if="error" class="text-sm text-destructive">{{ error }}</div>

    <!-- Token list -->
    <ul v-if="tokens.length" class="space-y-1.5 p-0">
      <li
        v-for="token in tokens"
        :key="token.id"
        class="rounded-md border px-3 py-2"
        :class="
          expandedTokenId === token.id
            ? 'border-primary/30 bg-background'
            : 'border-border/50 bg-input hover:bg-background duration-150 transition-colors'
        "
      >
        <!-- Collapsed row -->
        <div
          class="flex cursor-pointer items-center justify-between gap-2"
          @click="toggleExpand(token.id)"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span
              :class="[
                studioIcons.chevronRight,
                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                expandedTokenId === token.id && 'rotate-90',
              ]"
            />
            <span class="text-sm font-medium">{{ token.name }}</span>
            <span class="text-xs text-muted-foreground truncate">
              {{ token.tokenPrefix }}…
            </span>
          </div>
          <!-- Revoke confirm / cancel -->
          <div
            v-if="canEdit && revokingTokenId === token.id"
            class="flex shrink-0 items-center gap-1"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              :title="t('common.cancel')"
              :disabled="isRevoking"
              @click.stop="beginRevoke(token.id)"
            >
              <span :class="[studioIcons.close, 'size-4 shrink-0']" />
              <span class="sr-only">{{ t("settings.mcp.cancelRevoke") }}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              :title="t('settings.mcp.confirmRevoke')"
              :disabled="isRevoking"
              @click.stop="executeRevoke(token.id)"
            >
              <span :class="[studioIcons.check, 'size-4 shrink-0']" />
              <span class="sr-only">{{ t("settings.mcp.confirmRevoke") }}</span>
            </Button>
          </div>
          <Button
            v-else-if="canEdit"
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            :title="t('settings.mcp.revokeToken')"
            @click.stop="beginRevoke(token.id)"
          >
            <span :class="[studioIcons.trash, 'size-4 shrink-0']" />
            <span class="sr-only">{{ t("settings.mcp.revokeToken") }}</span>
          </Button>
        </div>

        <!-- Expanded detail -->
        <Transition name="token-expand">
          <div v-if="expandedTokenId === token.id" class="mt-4 space-y-5">
            <!-- New token value (shown once, hidden after copy) -->
            <div
              v-if="newTokenValues[token.id] && !copiedTokenIds.has(token.id)"
              class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-medium">
                  {{ t("settings.mcp.copyTokenWarning") }}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0"
                  :title="t('settings.mcp.copyToken')"
                  @click.stop="
                    copyTokenValue(token.id, newTokenValues[token.id]!)
                  "
                >
                  <span :class="[studioIcons.copy, 'size-4 shrink-0']" />
                  <span class="sr-only">{{ t("settings.mcp.copyToken") }}</span>
                </Button>
              </div>
              <code
                class="mt-1 block cursor-pointer break-all text-sm hover:text-primary/80"
                :title="t('settings.mcp.clickToCopy')"
                @click.stop="
                  copyTokenValue(token.id, newTokenValues[token.id]!)
                "
                >{{ newTokenValues[token.id] }}</code
              >
            </div>

            <!-- Scope toggles -->
            <div class="space-y-3">
              <div
                class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-foreground">
                    {{ t("settings.mcp.scope.read") }}
                  </p>
                  <p class="text-2xs text-muted-foreground">
                    {{ t("settings.mcp.scope.readTokenDescription") }}
                  </p>
                </div>
                <Switch
                  :model-value="token.scopes.includes('mcp:read')"
                  class="shrink-0"
                  @update:model-value="toggleTokenScope(token, 'mcp:read')"
                />
              </div>
              <div
                v-if="canGrantWriteScope"
                class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-foreground">
                    {{ t("settings.mcp.scope.write") }}
                  </p>
                  <p class="text-2xs text-muted-foreground">
                    {{ t("settings.mcp.scope.writeTokenDescription") }}
                  </p>
                </div>
                <Switch
                  :model-value="token.scopes.includes('mcp:write')"
                  class="shrink-0"
                  @update:model-value="toggleTokenScope(token, 'mcp:write')"
                />
              </div>
              <div
                v-if="canGrantDesignScope"
                class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-foreground">
                    {{ t("settings.mcp.scope.design") }}
                  </p>
                  <p class="text-2xs text-muted-foreground">
                    {{ t("settings.mcp.scope.designTokenDescription") }}
                  </p>
                </div>
                <Switch
                  :model-value="token.scopes.includes('mcp:design')"
                  class="shrink-0"
                  @update:model-value="toggleTokenScope(token, 'mcp:design')"
                />
              </div>
              <div
                v-if="canGrantPublishScope"
                class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-xs font-medium text-foreground">
                    {{ t("settings.mcp.scope.publish") }}
                  </p>
                  <p class="text-2xs text-muted-foreground">
                    {{ t("settings.mcp.scope.publishTokenDescription") }}
                  </p>
                </div>
                <Switch
                  :model-value="token.scopes.includes('mcp:publish')"
                  class="shrink-0"
                  @update:model-value="toggleTokenScope(token, 'mcp:publish')"
                />
              </div>
            </div>

            <!-- Meta -->
            <div class="text-right pb-1 text-2xs text-muted-foreground">
              {{ t("settings.mcp.created") }}
              {{ new Date(token.createdAt).toLocaleDateString() }}
              <span class="mx-1">·</span>
              <span class="capitalize">{{ token.createdByUsername }}</span>
            </div>
          </div>
        </Transition>
      </li>
    </ul>

    <div
      v-else
      class="rounded-md border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {{ t("settings.mcp.empty") }}
    </div>
  </section>
</template>

<style scoped>
.token-expand-enter-active {
  transition:
    transform 250ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 250ms cubic-bezier(0.22, 1, 0.36, 1);
}
.token-expand-leave-active {
  transition:
    transform 150ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms cubic-bezier(0.22, 1, 0.36, 1);
}
.token-expand-enter-from,
.token-expand-leave-to {
  transform: scale(0.97);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .token-expand-enter-active,
  .token-expand-leave-active {
    transition: none !important;
  }
}
</style>
