<script setup lang="ts">
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { computed } from "vue";

const props = defineProps<{
  content: string;
}>();

marked.setOptions({
  gfm: true,
  breaks: true,
});

const sanitizedHtml = computed(() => {
  const html = marked.parse(props.content, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
});
</script>

<template>
  <div
    class="agent-markdown prose dark:prose-invert text-xs text-balance max-w-none"
    v-html="sanitizedHtml"
  />
</template>
