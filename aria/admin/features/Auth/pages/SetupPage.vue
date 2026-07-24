<script setup lang="ts">
/**
 * SetupPage Component
 *
 * @component
 */

import AuthLayout from "../components/AuthLayout.vue";
import SetupForm from "../components/SetupForm.vue";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();
const heading = t("auth.setup.heading");
const tagline = t("auth.setup.tagline");
const formTitle = t("auth.setup.title");
const formDescription = t("auth.setup.description");
</script>

<template>
  <AuthLayout
    :heading="heading"
    :tagline="tagline"
    :form-title="formTitle"
    :form-description="formDescription"
    :form-component="SetupForm"
    animated
  />
</template>
