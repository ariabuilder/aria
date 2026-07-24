<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/lib/auth/types";
import { useStudioI18n } from "@/i18n";

interface CreateUserForm {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string | null;
  form: CreateUserForm;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:form": [value: CreateUserForm];
  submit: [];
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
const { t } = useStudioI18n();

function updateForm(patch: Partial<CreateUserForm>): void {
  emit("update:form", { ...props.form, ...patch });
}
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="sm:max-w-md">
      <DialogHeader class="px-2">
        <DialogTitle class="flex items-center gap-2">
          <span class="i-hugeicons:user-add-02 size-5" />
          {{ t("users.createTitle") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("users.createDescription") }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="emit('submit')" class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="create-name">{{ t("users.detail.name") }}</Label>
          <Input
            id="create-name"
            :model-value="form.name"
            placeholder="Alex Morgan"
            required
            @update:model-value="updateForm({ name: String($event) })"
          />
        </div>

        <div class="space-y-2">
          <Label for="create-username">{{ t("auth.username") }}</Label>
          <Input
            id="create-username"
            :model-value="form.username"
            placeholder="aria"
            required
            @update:model-value="updateForm({ username: String($event) })"
          />
        </div>

        <div class="space-y-2">
          <Label for="create-email">{{ t("auth.email") }}</Label>
          <Input
            id="create-email"
            :model-value="form.email"
            type="email"
            placeholder="john@example.com"
            required
            @update:model-value="updateForm({ email: String($event) })"
          />
        </div>

        <div class="space-y-2">
          <Label for="create-password">{{ t("auth.password") }}</Label>
          <Input
            id="create-password"
            :model-value="form.password"
            type="password"
            placeholder="••••••••"
            required
            @update:model-value="updateForm({ password: String($event) })"
          />
          <p class="text-xs text-muted-foreground">{{ t("users.minimumPassword") }}</p>
        </div>

        <div class="space-y-2">
          <Label for="create-role">{{ t("users.role") }}</Label>
          <Select
            :model-value="form.role"
            @update:model-value="
              updateForm({ role: String($event) as UserRole })
            "
          >
            <SelectTrigger id="create-role">
              <SelectValue :placeholder="t('users.selectRole')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="administrator">{{ t("users.administrator") }}</SelectItem>
              <SelectItem value="manager">{{ t("users.manager") }}</SelectItem>
              <SelectItem value="content-editor">{{ t("users.contentEditor") }}</SelectItem>
              <SelectItem value="contributor">{{ t("users.contributor") }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          v-if="error"
          class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span class="i-hugeicons:alert-01 size-3.5" />
          {{ error }}
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" @click="openModel = false">{{ t("common.cancel") }}</Button>
        <Button @click="emit('submit')" :disabled="loading" class="gap-2">
          <span
            v-if="loading"
            class="i-hugeicons:refresh size-3.5 animate-spin"
          />
          {{ t("users.create") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
