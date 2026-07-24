<script setup lang="ts">
/**
 * ResetPasswordPage Component
 *
 * @component
 */

import { defineComponent, h, markRaw } from "vue";
import AuthLayout from "../components/AuthLayout.vue";
import ResetPasswordForm from "../components/ResetPasswordForm.vue";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  token: string;
}>();

const { t } = useStudioI18n();
const heading = t("auth.reset.heading");
const tagline = t("auth.reset.tagline");
const formTitle = t("auth.reset.title");
const formDescription = t("auth.reset.description");

const formComponent = markRaw(
  defineComponent({
    name: "ResetPasswordFormHost",
    setup() {
      return () => h(ResetPasswordForm, { token: props.token });
    },
  }),
);
</script>

<template>
  <AuthLayout
    :heading="heading"
    :tagline="tagline"
    :form-title="formTitle"
    :form-description="formDescription"
    :form-component="formComponent"
  />
</template>
