<script setup lang="ts">
defineProps<{
  message?: string;
}>();
</script>

<template>
  <p class="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
    {{
      message ??
        "You can view these settings but don't have permission to edit them."
    }}
  </p>
</template>
