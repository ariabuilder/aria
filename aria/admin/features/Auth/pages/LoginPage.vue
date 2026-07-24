<script setup lang="ts">
/**
 * LoginPage Component
 *
 * @component
 */

import AuthLayout from "../components/AuthLayout.vue";
import LoginForm from "../components/LoginForm.vue";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
const heading = t("auth.login.heading");
const tagline = t("auth.login.tagline");
const formTitle = t("auth.login.title");
const formDescription = t("auth.login.description");
</script>

<template>
  <AuthLayout
    :heading="heading"
    :tagline="tagline"
    :form-title="formTitle"
    :form-description="formDescription"
    :form-component="LoginForm"
    animated
  />
</template>
