<script setup lang="ts">
/**
 * ForgotPasswordPage Component
 *
 * @component
 */

import AuthLayout from "../components/AuthLayout.vue";
import ForgotPasswordForm from "../components/ForgotPasswordForm.vue";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
const heading = t("auth.forgot.heading");
const tagline = t("auth.forgot.tagline");
const formTitle = t("auth.forgot.title");
const formDescription = t("auth.forgot.description");
</script>

<template>
  <AuthLayout
    :heading="heading"
    :tagline="tagline"
    :form-title="formTitle"
    :form-description="formDescription"
    :form-component="ForgotPasswordForm"
  />
</template>
