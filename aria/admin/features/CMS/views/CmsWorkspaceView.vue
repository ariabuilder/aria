<script setup lang="ts">
import { RouterView } from "vue-router";
import { StudioPanelShell } from "@/features/Studio/core/components";

defineOptions({ name: "CmsWorkspaceView" });
</script>

<template>
  <StudioPanelShell variant="rail" content-class="page-card-enter">
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="['CollectionsView', 'CollectionDetailView']">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </StudioPanelShell>
</template>
