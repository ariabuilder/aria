<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { studioIcons } from "@/lib/icons"

interface Revision {
  id: string
  timestamp: string
  label: string
  author?: string
}

interface Props {
  revisions: Revision[]
}

withDefaults(defineProps<Props>(), {
  revisions: () => [],
})

const emit = defineEmits<{
  restore: [revisionId: string]
  view: [revisionId: string]
}>()

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium">Revision History</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="revisions.length === 0" class="py-6 text-center">
        <span :class="[studioIcons.history, 'mx-auto mb-2 size-6 text-muted-foreground']" />
        <p class="text-xs text-muted-foreground">No revisions yet</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="revision in revisions"
          :key="revision.id"
          class="flex items-center justify-between rounded-md border p-2.5"
        >
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium truncate">{{ revision.label }}</p>
            <p class="text-2xs text-muted-foreground">
              {{ formatDate(revision.timestamp) }}
              <template v-if="revision.author"> by {{ revision.author }}</template>
            </p>
          </div>
          <div class="flex gap-1 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-7"
              title="View revision"
              @click="emit('view', revision.id)"
            >
              <span :class="[studioIcons.eye, 'size-3.5']" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-7"
              title="Restore revision"
              @click="emit('restore', revision.id)"
            >
              <span :class="[studioIcons.refresh, 'size-3.5']" />
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
