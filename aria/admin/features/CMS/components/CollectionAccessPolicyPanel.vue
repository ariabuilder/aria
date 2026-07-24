<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/features/Auth/composables/useUser";
import type { AriaCollection } from "../../../../lib/cms/schemas";
import {
  AriaCollectionPolicySchema,
  CollectionPolicyRuleSchema,
  type CollectionPolicyRule,
} from "../../../../lib/cms/schemas";
import { COLLECTION_PERMISSION_ACTIONS } from "../../../../lib/cms/constants";

const props = defineProps<{ collection: AriaCollection }>();
const { user: currentUser, fetchUser } = useUser();

const UserOptionSchema = z
  .object({ id: z.string(), username: z.string(), role: z.string() })
  .strict();

const users = ref<Array<z.infer<typeof UserOptionSchema>>>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const loadError = ref<string | null>(null);
const mode = ref<"inherit" | "restricted">("inherit");
const rules = ref<CollectionPolicyRule[]>([]);

const fieldKeys = computed(() => [
  "title",
  "slug",
  ...(props.collection.supports.includes("body") ? ["body"] : []),
  ...props.collection.schema.fields.map((field) => field.key),
]);

function reset(policy: z.infer<typeof AriaCollectionPolicySchema>): void {
  mode.value = policy.mode;
  rules.value = policy.rules.map((rule) =>
    CollectionPolicyRuleSchema.parse(rule),
  );
}

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    await fetchUser();
    const [policyResult, usersResult] = await Promise.all([
      actions.cms.collections.getPolicy({ collectionId: props.collection.id }),
      actions.cms.collections.listPolicyPrincipals({
        collectionId: props.collection.id,
      }),
    ]);
    if (policyResult.error) throw policyResult.error;
    if (usersResult.error) throw usersResult.error;
    const policy = AriaCollectionPolicySchema.parse(policyResult.data?.policy);
    const parsedUsers = z
      .object({ users: z.array(UserOptionSchema) })
      .strict()
      .parse(usersResult.data);
    const usersById = new Map(
      parsedUsers.users.map((candidate) => [candidate.id, candidate]),
    );
    if (currentUser.value) {
      usersById.set(
        currentUser.value.id,
        UserOptionSchema.parse({
          id: currentUser.value.id,
          username: currentUser.value.username,
          role: currentUser.value.role,
        }),
      );
    }
    users.value = [...usersById.values()].sort((left, right) =>
      left.username.localeCompare(right.username),
    );
    reset(policy);
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : "Unable to load access policy";
  } finally {
    isLoading.value = false;
  }
}

function addRule(): void {
  const principalId = users.value[0]?.id;
  if (!principalId) {
    toast.error("No users are available for an access rule");
    return;
  }
  rules.value.push(
    CollectionPolicyRuleSchema.parse({
      principalId,
      actions: ["read"],
      documentScope: "all",
      locales: [],
    }),
  );
}

function removeRule(index: number): void {
  rules.value.splice(index, 1);
}

function updateActions(
  rule: CollectionPolicyRule,
  action: (typeof COLLECTION_PERMISSION_ACTIONS)[number],
  checked: boolean,
): void {
  const actions = new Set(rule.actions);
  if (checked) actions.add(action);
  else actions.delete(action);
  if (actions.size === 0) return;
  rule.actions = [...actions];
}

function updateLocales(rule: CollectionPolicyRule, value: string): void {
  rule.locales = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function fieldIsEnabled(fields: string[] | undefined, field: string): boolean {
  return fields === undefined || fields.includes(field);
}

function updateFieldSet(
  rule: CollectionPolicyRule,
  key: "visibleFields" | "editableFields",
  field: string,
  checked: boolean,
): void {
  const current = rule[key];
  const base = current === undefined ? [...fieldKeys.value] : [...current];
  const next = checked
    ? [...new Set([...base, field])]
    : base.filter((item) => item !== field);
  rule[key] = next;
}

function setAllFields(
  rule: CollectionPolicyRule,
  key: "visibleFields" | "editableFields",
  unrestricted: boolean,
): void {
  rule[key] = unrestricted ? undefined : [];
}

async function save(): Promise<boolean> {
  isSaving.value = true;
  try {
    const parsedRules = z.array(CollectionPolicyRuleSchema).parse(rules.value);
    const result = await actions.cms.collections.setPolicy({
      collectionId: props.collection.id,
      mode: mode.value,
      rules: parsedRules,
    });
    if (result.error) throw result.error;
    reset(AriaCollectionPolicySchema.parse(result.data?.policy));
    toast.success("Collection access policy saved");
    return true;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to save access policy",
    );
    return false;
  } finally {
    isSaving.value = false;
  }
}

async function handleModeChange(restricted: boolean): Promise<void> {
  if (restricted) {
    mode.value = "restricted";
    return;
  }

  const previousMode = mode.value;
  mode.value = "inherit";
  if (!(await save())) mode.value = previousMode;
}

watch(
  () => props.collection.id,
  () => void load(),
);

onMounted(() => void load());
</script>

<template>
  <section>
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-foreground">Access policy</h3>
        <p class="text-xs leading-5 text-muted-foreground">
          Restrict this collection to explicit user rules. Site capabilities
          remain required.
        </p>
      </div>
      <Switch
        :model-value="mode === 'restricted'"
        :disabled="isLoading || isSaving"
        aria-label="Restrict collection access"
        @update:model-value="handleModeChange"
      />
    </div>

    <p v-if="loadError" class="mt-4 text-xs text-destructive">
      {{ loadError }}
    </p>

    <div v-else-if="mode === 'restricted'" class="mt-6 space-y-5">
      <div
        v-for="(rule, index) in rules"
        :key="`${rule.principalId}-${index}`"
        class="border border-border/60 p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <Select v-model="rule.principalId" :disabled="isSaving">
            <SelectTrigger class="h-8 max-w-xs text-xs">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="user in users" :key="user.id" :value="user.id">
                {{ user.username }} ({{ user.role }})
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="isSaving"
            @click="removeRule(index)"
          >
            Remove
          </Button>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label class="text-xs">Document scope</Label>
            <Select v-model="rule.documentScope" :disabled="isSaving">
              <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entries</SelectItem>
                <SelectItem value="own">Own entries only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label class="text-xs">Locales</Label>
            <Input
              :model-value="rule.locales.join(', ')"
              class="h-8 text-xs"
              placeholder="All locales"
              :disabled="isSaving"
              @update:model-value="updateLocales(rule, String($event))"
            />
          </div>
        </div>

        <div class="mt-4">
          <Label class="text-xs">Allowed actions</Label>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            <label
              v-for="action in COLLECTION_PERMISSION_ACTIONS"
              :key="action"
              class="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                :model-value="rule.actions.includes(action)"
                :disabled="
                  isSaving ||
                  (rule.actions.length === 1 && rule.actions[0] === action)
                "
                @update:model-value="
                  updateActions(rule, action, Boolean($event))
                "
              />
              {{ action.replace("_", " ") }}
            </label>
          </div>
        </div>

        <div class="mt-5 grid gap-5 lg:grid-cols-2">
          <div class="space-y-3">
            <label
              class="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                :model-value="rule.visibleFields === undefined"
                :disabled="isSaving"
                @update:model-value="
                  setAllFields(rule, 'visibleFields', Boolean($event))
                "
              />
              All fields visible
            </label>
            <div
              v-if="rule.visibleFields !== undefined"
              class="grid grid-cols-2 gap-2"
            >
              <label
                v-for="field in fieldKeys"
                :key="field"
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Checkbox
                  :model-value="fieldIsEnabled(rule.visibleFields, field)"
                  :disabled="isSaving"
                  @update:model-value="
                    updateFieldSet(
                      rule,
                      'visibleFields',
                      field,
                      Boolean($event),
                    )
                  "
                />
                {{ field }}
              </label>
            </div>
          </div>
          <div class="space-y-3">
            <label
              class="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                :model-value="rule.editableFields === undefined"
                :disabled="isSaving"
                @update:model-value="
                  setAllFields(rule, 'editableFields', Boolean($event))
                "
              />
              All fields editable
            </label>
            <div
              v-if="rule.editableFields !== undefined"
              class="grid grid-cols-2 gap-2"
            >
              <label
                v-for="field in fieldKeys"
                :key="field"
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Checkbox
                  :model-value="fieldIsEnabled(rule.editableFields, field)"
                  :disabled="isSaving"
                  @update:model-value="
                    updateFieldSet(
                      rule,
                      'editableFields',
                      field,
                      Boolean($event),
                    )
                  "
                />
                {{ field }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        :disabled="isSaving || isLoading"
        @click="addRule"
      >
        Add user rule
      </Button>
    </div>

    <div v-if="mode === 'restricted'" class="mt-5 flex justify-end">
      <Button size="sm" :disabled="isSaving || isLoading" @click="save">
        {{ isSaving ? "Saving..." : "Save access policy" }}
      </Button>
    </div>
  </section>
</template>
