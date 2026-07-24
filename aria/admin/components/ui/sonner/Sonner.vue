<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner";
import { Toaster as Sonner } from "vue-sonner";
import { studioIcons } from "@/lib/icons";
import "vue-sonner/style.css";
import "../../../styles/sonner.css";

const props = defineProps<ToasterProps>();
</script>

<template>
  <Sonner :position="props.position || 'bottom-center'" v-bind="props">
    <template #success-icon>
      <span
        :class="[studioIcons.checkCircleLinear, 'size-4 text-emerald-400/90']"
      />
    </template>
    <template #info-icon>
      <span :class="[studioIcons.infoCircle, 'size-4 text-sky-400/90']" />
    </template>
    <template #warning-icon>
      <span
        :class="[studioIcons.warning, 'size-4 text-amber-400/90']"
      />
    </template>
    <template #error-icon>
      <span :class="[studioIcons.closeCircleBold, 'size-4 text-rose-400/90']" />
    </template>
    <template #loading-icon>
      <span
        :class="[studioIcons.refresh, 'size-4 animate-spin text-primary/70']"
      />
    </template>
  </Sonner>
</template>
