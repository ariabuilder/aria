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

interface EditUserForm {
  id: string;
  email: string;
  role: UserRole;
}

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string | null;
  form: EditUserForm;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:form": [value: EditUserForm];
  submit: [];
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
const { t } = useStudioI18n();

function updateForm(patch: Partial<EditUserForm>): void {
  emit("update:form", { ...props.form, ...patch });
}
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span class="i-hugeicons:pen-01 size-[18px]" />
          {{ t("users.editTitle") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("users.editDescription") }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="emit('submit')" class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="edit-email">{{ t("auth.email") }}</Label>
          <Input
            id="edit-email"
            :model-value="form.email"
            type="email"
            placeholder="john@example.com"
            @update:model-value="updateForm({ email: String($event) })"
          />
        </div>

        <div class="space-y-2">
          <Label for="edit-role">{{ t("users.role") }}</Label>
          <Select
            :model-value="form.role"
            @update:model-value="
              updateForm({ role: String($event) as UserRole })
            "
          >
            <SelectTrigger id="edit-role">
              <SelectValue :placeholder="t('users.selectRole')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="administrator">{{ t("users.administrator") }}</SelectItem>
              <SelectItem value="content-editor">{{ t("users.contentEditor") }}</SelectItem>
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
          {{ t("common.saveChanges") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
