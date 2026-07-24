<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface Props {
  slug: string
  parent?: string | null
  layout?: string
  updatedAt?: string | null
}

defineProps<Props>()
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium">Details</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Slug</span>
        <span class="text-xs font-mono">/{{ slug }}</span>
      </div>
      <Separator />
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Parent</span>
        <span class="text-xs">{{ parent ? `/${parent}` : "—" }}</span>
      </div>
      <Separator />
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Layout</span>
        <span class="text-xs">{{ layout || "—" }}</span>
      </div>
      <Separator v-if="updatedAt" />
      <div v-if="updatedAt" class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Updated</span>
        <span class="text-xs">{{ new Date(updatedAt).toLocaleDateString() }}</span>
      </div>
    </CardContent>
  </Card>
</template>
