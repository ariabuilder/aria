<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
import { computed } from "vue"

interface Props {
  status: "published" | "draft" | "archived"
}

const props = defineProps<Props>()

const variant = computed(() => {
  switch (props.status) {
    case "published":
      return "default"
    case "archived":
      return "secondary"
    default:
      return "outline"
  }
})

const dotColor = computed(() => {
  switch (props.status) {
    case "published":
      return "bg-emerald-500"
    case "archived":
      return "bg-muted-foreground"
    default:
      return "bg-amber-500"
  }
})

const label = computed(() => {
  switch (props.status) {
    case "published":
      return "Published"
    case "archived":
      return "Archived"
    default:
      return "Draft"
  }
})
</script>

<template>
  <Badge
    :variant="variant"
    class="text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 py-0.5 gap-1.5"
    :class="{ 'line-through': status === 'archived' }"
  >
    <span :class="[dotColor, 'h-1.5 w-1.5 rounded-full']" />
    {{ label }}
  </Badge>
</template>
