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
import { useStudioI18n } from "@/i18n";

interface ResetPasswordForm {
  userId: string;
  newPassword: string;
}

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string | null;
  success: boolean;
  form: ResetPasswordForm;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:form": [value: ResetPasswordForm];
  submit: [];
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
const { t } = useStudioI18n();

function updateForm(patch: Partial<ResetPasswordForm>): void {
  emit("update:form", { ...props.form, ...patch });
}
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span class="i-hugeicons:key-01 size-[18px]" />
          {{ t("auth.resetPassword") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("users.resetDescription") }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="success" class="flex flex-col items-center gap-3 py-8">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 animate-in zoom-in duration-200"
        >
          <span class="i-hugeicons:checkmark-circle-02 size-6 text-success" />
        </div>
        <p class="text-sm font-medium text-foreground">{{ t("auth.passwordUpdated") }}</p>
      </div>

      <form v-else @submit.prevent="emit('submit')" class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="reset-password">{{ t("auth.newPassword") }}</Label>
          <Input
            id="reset-password"
            :model-value="form.newPassword"
            type="password"
            placeholder="••••••••"
            required
            @update:model-value="updateForm({ newPassword: String($event) })"
          />
          <p class="text-xs text-muted-foreground">{{ t("users.minimumPassword") }}</p>
        </div>

        <div
          v-if="error"
          class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span class="i-hugeicons:alert-01 size-3.5" />
          {{ error }}
        </div>
      </form>

      <DialogFooter v-if="!success">
        <Button variant="outline" @click="openModel = false">{{ t("common.cancel") }}</Button>
        <Button @click="emit('submit')" :disabled="loading" class="gap-2">
          <span
            v-if="loading"
            class="i-hugeicons:refresh size-3.5 animate-spin"
          />
          {{ t("auth.resetPassword") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
