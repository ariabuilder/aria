<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCapabilities } from "@/composables/useCapabilities";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { DeleteConfirmDialog } from "@/features/Studio/core/components";
import SettingsReadOnlyNotice from "@/features/Studio/settings/components/SettingsReadOnlyNotice.vue";
import AgentInferenceSettings from "./AgentInferenceSettings.vue";

import { useAgentSettings } from "../composables/useAgentSettings";
import { useAgentAvailability } from "../composables/useAgentAvailability";
import { useRuntimePlatform } from "../composables/useRuntimePlatform";
import { useSettingsDialog } from "@/features/Studio/settings";
import type { AgentSettings, AgentSkill } from "../../lib/schemas";

type AgentSettingsTab = "agent" | "skills";

const { hasCapability } = useCapabilities();
const { t } = useStudioI18n();
const draggable = defineAsyncComponent(() => import("vuedraggable"));
const canEdit = computed(() => hasCapability("editAgentSettings"));
const { agentSettings, updateAgentSettings, loadSettings, isSaving } =
  useAgentSettings();
const availability = useAgentAvailability();
const runtimePlatform = useRuntimePlatform();
const settingsDialog = useSettingsDialog();

const form = ref<AgentSettings>({ ...agentSettings.value });

const platform = computed(
  () =>
    availability.availability.value?.platform ??
    runtimePlatform.platform.value ??
    "local",
);
const hasProviders = computed(
  () => Object.keys(form.value.inference.providerInstances).length > 0,
);
const openSkillId = ref<string | null>(null);
const skillPendingRemoval = ref<AgentSkill | null>(null);
const activeSettingsTab = ref<AgentSettingsTab>("agent");
const maxSkillsReached = computed(() => form.value.skills.length >= 8);

function syncFormFromStore(): void {
  form.value = { ...agentSettings.value };
}

async function refreshAgentSettings(force = false): Promise<void> {
  if (isSaving.value) {
    return;
  }
  await loadSettings({ force });
  syncFormFromStore();
}

let unregisterFlush: (() => void) | undefined;

onMounted(async () => {
  unregisterFlush = settingsDialog.registerFlushCallback(async () => {
    if (!isSaving.value) {
      return;
    }
    await new Promise<void>((resolve) => {
      const stop = watch(isSaving, (saving) => {
        if (!saving) {
          stop();
          resolve();
        }
      });
    });
  });

  await Promise.all([
    refreshAgentSettings(true),
    availability.refresh(),
    runtimePlatform.refresh(),
  ]);
});

onUnmounted(() => {
  unregisterFlush?.();
});

watch(
  () => [settingsDialog.isOpen.value, settingsDialog.activeTab.value] as const,
  ([open, tab]) => {
    if (open && tab === "agent") {
      void refreshAgentSettings(true);
    }
  },
);

watch(agentSettings, () => {
  if (!isSaving.value) {
    syncFormFromStore();
  }
});

async function saveAgent(patch: Partial<AgentSettings>): Promise<void> {
  const previousValues = Object.fromEntries(
    (Object.keys(patch) as Array<keyof AgentSettings>).map((key) => [
      key,
      form.value[key],
    ]),
  ) as Partial<AgentSettings>;

  form.value = { ...form.value, ...patch };
  try {
    await updateAgentSettings(patch);
    syncFormFromStore();
    toast.success(t("settings.agent.saved"));
    await availability.refresh();
  } catch (err) {
    form.value = { ...form.value, ...previousValues };
    toast.error(
      err instanceof Error ? err.message : t("settings.agent.saveFailed"),
    );
  }
}

async function saveSiteInstructions(): Promise<void> {
  const next = form.value.siteInstructions?.trim() ?? "";
  const current = agentSettings.value.siteInstructions?.trim() ?? "";
  if (next === current) {
    return;
  }
  await saveAgent({ siteInstructions: next || undefined });
}

function skillName(skill: AgentSkill, index: number): string {
  return (
    skill.name.trim() ||
    t("settings.agent.skills.untitled", { number: index + 1 })
  );
}

function normalizeSkills(skills: AgentSkill[]): AgentSkill[] {
  return skills
    .map((skill, index) => ({
      id: skill.id,
      name:
        skill.name.trim() ||
        t("settings.agent.skills.untitled", { number: index + 1 }),
      instructions: skill.instructions.trim(),
    }))
    .filter((skill) => skill.instructions.length > 0);
}

async function saveSkills(): Promise<void> {
  const next = normalizeSkills(form.value.skills);
  const current = agentSettings.value.skills;
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return;
  }
  await saveAgent({ skills: next });
}

function addSkill(): void {
  const skill: AgentSkill = {
    id: crypto.randomUUID(),
    name: "",
    instructions: "",
  };
  form.value.skills = [...form.value.skills, skill];
  openSkillId.value = skill.id;
}

async function duplicateSkill(index: number): Promise<void> {
  const skill = form.value.skills[index];
  if (!skill || maxSkillsReached.value) return;
  const copy: AgentSkill = {
    ...skill,
    id: crypto.randomUUID(),
    name: `${skillName(skill, index)} ${t("settings.agent.skills.copySuffix")}`.slice(
      0,
      80,
    ),
  };
  form.value.skills = [
    ...form.value.skills.slice(0, index + 1),
    copy,
    ...form.value.skills.slice(index + 1),
  ];
  openSkillId.value = copy.id;
  await saveSkills();
}

async function removeSkill(index: number): Promise<void> {
  const removed = form.value.skills[index];
  form.value.skills = form.value.skills.filter(
    (_, skillIndex) => skillIndex !== index,
  );
  if (openSkillId.value === removed?.id) openSkillId.value = null;
  await saveSkills();
}

function requestSkillRemoval(skill: AgentSkill): void {
  skillPendingRemoval.value = skill;
}

async function confirmSkillRemoval(): Promise<void> {
  const skill = skillPendingRemoval.value;
  if (!skill) return;
  const index = form.value.skills.findIndex((item) => item.id === skill.id);
  if (index < 0) {
    skillPendingRemoval.value = null;
    return;
  }
  await removeSkill(index);
  skillPendingRemoval.value = null;
}

async function moveSkill(index: number, direction: -1 | 1): Promise<void> {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= form.value.skills.length) return;
  const next = [...form.value.skills];
  const [skill] = next.splice(index, 1);
  if (!skill) return;
  next.splice(targetIndex, 0, skill);
  form.value.skills = next;
  await saveSkills();
}
</script>

<template>
  <Teleport defer to="#settings-tab-actions">
    <Button
      v-if="activeSettingsTab === 'skills'"
      type="button"
      variant="secondary"
      size="sm"
      :disabled="!canEdit || maxSkillsReached"
      @click="addSkill"
    >
      <span :class="[studioIcons.plus, 'size-3.5']" />
      {{ t("settings.agent.skills.add") }}
    </Button>
  </Teleport>

  <div class="min-w-0 space-y-0 bg-background page-card-enter">
    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
      role="tablist"
      :aria-label="t('settings.meta.agent.title')"
    >
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeSettingsTab === 'agent'"
        :variant="activeSettingsTab === 'agent' ? 'tab-active' : 'tab'"
        @click="activeSettingsTab = 'agent'"
      >
        {{ t("settings.meta.agent.title") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeSettingsTab === 'skills'"
        :variant="activeSettingsTab === 'skills' ? 'tab-active' : 'tab'"
        @click="activeSettingsTab = 'skills'"
      >
        {{ t("settings.agent.tabs.skills") }}
      </Button>
    </div>

    <div class="px-10 py-7">
      <div class="mx-auto max-w-3xl space-y-7 pb-8">
    <SettingsReadOnlyNotice v-if="!canEdit" />

    <AgentInferenceSettings
      v-if="activeSettingsTab === 'agent'"
      :form="form"
      :can-edit="canEdit"
      :platform="platform"
      :saving="isSaving"
    />

      <section
        v-if="activeSettingsTab === 'agent' && hasProviders"
        class="space-y-3 pt-4"
      >
        <div>
          <h4 class="text-sm font-medium m-0">
            {{ t("settings.agent.instructions.title") }}
          </h4>
          <p class="text-xs text-muted-foreground">
            {{ t("settings.agent.instructions.description") }}
          </p>
        </div>
        <Textarea
          v-model="form.siteInstructions"
          rows="6"
          class="resize-y hover:bg-background! bg-input! border-border/50"
          :disabled="!canEdit"
          :placeholder="t('settings.agent.instructions.placeholder')"
          @blur="saveSiteInstructions"
        />
      </section>

      <section v-if="activeSettingsTab === 'skills'" class="space-y-3">
        <div>
          <div>
            <h4 class="text-sm font-medium m-0">
              {{ t("settings.agent.skills.title") }}
            </h4>
            <p class="text-xs leading-relaxed text-muted-foreground max-w-sm text-balance">
              {{ t("settings.agent.skills.description") }}
            </p>
          </div>
        </div>

        <div class="grid gap-2 rounded-sm border border-border bg-card/30 p-2">
          <p
            v-if="form.skills.length === 0"
            class="px-1 py-2 text-xs text-muted-foreground"
          >
            {{ t("settings.agent.skills.empty") }}
          </p>

          <draggable
            v-else
            v-model="form.skills"
            item-key="id"
            :animation="150"
            handle=".agent-skill-drag-handle"
            :disabled="!canEdit"
            class="grid gap-2"
            @end="saveSkills"
          >
            <template #item="{ element: skill, index }">
              <Collapsible
                :open="openSkillId === skill.id"
                class="grid gap-0 rounded-sm border border-border/50 bg-card/30"
                @update:open="openSkillId = $event ? skill.id : null"
              >
                <div
                  class="flex min-w-0 items-center justify-between gap-2 px-2 py-1.5"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <Button
                      type="button"
                      variant="headerAction"
                      size="icon-xs"
                      class="agent-skill-drag-handle"
                      :class="
                        canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                      "
                      :disabled="!canEdit"
                      :aria-label="t('settings.agent.skills.reorder')"
                    >
                      <span :class="[studioIcons.dragHandle, 'size-3.5']" />
                    </Button>
                    <CollapsibleTrigger as-child>
                      <button type="button" class="min-w-0 flex-1 text-left">
                        <span class="block truncate text-xs text-foreground">
                          {{ skillName(skill, index) }}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="sidebar-action"
                      size="icon-sm"
                      :disabled="!canEdit || index === 0"
                      :title="t('settings.agent.skills.moveUp')"
                      :aria-label="t('settings.agent.skills.moveUp')"
                      @click="moveSkill(index, -1)"
                    >
                      <span :class="[studioIcons.chevronUp, 'size-3.5']" />
                    </Button>
                    <Button
                      type="button"
                      variant="sidebar-action"
                      size="icon-sm"
                      :disabled="!canEdit || index === form.skills.length - 1"
                      :title="t('settings.agent.skills.moveDown')"
                      :aria-label="t('settings.agent.skills.moveDown')"
                      @click="moveSkill(index, 1)"
                    >
                      <span :class="[studioIcons.chevronDown, 'size-3.5']" />
                    </Button>
                    <Button
                      type="button"
                      variant="sidebar-action"
                      size="icon-sm"
                      :disabled="!canEdit || maxSkillsReached"
                      :title="t('settings.agent.skills.duplicate')"
                      :aria-label="t('settings.agent.skills.duplicate')"
                      @click="duplicateSkill(index)"
                    >
                      <span :class="[studioIcons.duplicate, 'size-3.5']" />
                    </Button>
                    <Button
                      type="button"
                      variant="sidebar-action"
                      size="icon-sm"
                      class="hover:text-destructive"
                      :disabled="!canEdit"
                      :title="t('settings.agent.skills.remove')"
                      :aria-label="t('settings.agent.skills.remove')"
                      @click="requestSkillRemoval(skill)"
                    >
                      <span :class="[studioIcons.trash, 'size-3.5']" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent
                  class="border-t border-dashed border-border/50 p-3"
                >
                  <div class="grid gap-3">
                    <Input
                      v-model="skill.name"
                      :disabled="!canEdit"
                      :placeholder="t('settings.agent.skills.namePlaceholder')"
                      @blur="saveSkills"
                    />
                    <Textarea
                      v-model="skill.instructions"
                      rows="6"
                      class="resize-y hover:bg-background! bg-input! border-border/50"
                      :disabled="!canEdit"
                      :placeholder="
                        t('settings.agent.skills.instructionsPlaceholder')
                      "
                      @blur="saveSkills"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </template>
          </draggable>
        </div>
      </section>
      </div>
    </div>

    <DeleteConfirmDialog
      :open="skillPendingRemoval !== null"
      :title="t('settings.agent.skills.removeConfirmTitle')"
      :description="t('settings.agent.skills.removeConfirmDescription')"
      :item-name="skillPendingRemoval ? skillName(skillPendingRemoval, form.skills.indexOf(skillPendingRemoval)) : ''"
      :confirm-label="t('settings.agent.skills.remove')"
      :is-loading="isSaving"
      @update:open="(open) => { if (!open) skillPendingRemoval = null; }"
      @confirm="confirmSkillRemoval"
    />
  </div>
</template>
