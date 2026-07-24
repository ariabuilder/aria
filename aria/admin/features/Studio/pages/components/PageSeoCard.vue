<script setup lang="ts">
import { computed } from "vue"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { studioIcons } from "@/lib/icons"

interface SeoIssue {
  id: string
  type: "critical" | "warning"
  title: string
  description: string
}

interface Props {
  score: number
  issues: SeoIssue[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  edit: []
}>()

const scoreColor = computed(() => {
  if (props.score >= 80) return "text-emerald-500"
  if (props.score >= 50) return "text-amber-500"
  return "text-destructive"
})

const scoreRingColor = computed(() => {
  if (props.score >= 80) return "stroke-emerald-500"
  if (props.score >= 50) return "stroke-amber-500"
  return "stroke-destructive"
})

const scoreLabel = computed(() => {
  if (props.score >= 80) return "Good"
  if (props.score >= 50) return "Needs work"
  return "Poor"
})

const circumference = 2 * Math.PI * 36
const offset = computed(() => circumference - (props.score / 100) * circumference)
</script>

<template>
  <Card>
    <CardHeader class="pb-3 flex flex-row items-center justify-between">
      <CardTitle class="text-sm font-medium">SEO</CardTitle>
      <Button variant="ghost" size="icon-sm" class="size-7" @click="emit('edit')">
        <span :class="[studioIcons.edit, 'size-3.5']" />
      </Button>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center gap-4">
        <div class="relative size-20 shrink-0">
          <svg class="size-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r="36"
              fill="none"
              stroke="oklch(0.87 0 0)"
              stroke-width="4"
            />
            <circle
              cx="40" cy="40" r="36"
              fill="none"
              :class="scoreRingColor"
              stroke-width="4"
              stroke-linecap="round"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="offset"
              class="transition-all duration-500"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span :class="['text-lg font-semibold', scoreColor]">{{ score }}</span>
            <span class="text-2xs text-muted-foreground">{{ scoreLabel }}</span>
          </div>
        </div>
        <div class="space-y-1">
          <p class="text-xs font-medium">SEO Score</p>
          <p class="text-2xs text-muted-foreground">
            {{ issues.length }} {{ issues.length === 1 ? 'issue' : 'issues' }} found
          </p>
        </div>
      </div>

      <div v-if="issues.length > 0" class="space-y-1.5">
        <div
          v-for="issue in issues.slice(0, 3)"
          :key="issue.id"
          class="flex items-start gap-2 rounded-md bg-muted/50 p-2"
        >
          <span
            :class="[
              'mt-0.5 size-3.5 shrink-0',
              issue.type === 'critical' ? 'text-destructive i-hugeicons:alert-01' : 'text-amber-500 i-hugeicons:alert-01',
            ]"
          />
          <div class="min-w-0">
            <p class="text-xs font-medium">{{ issue.title }}</p>
            <p class="text-2xs text-muted-foreground truncate">{{ issue.description }}</p>
          </div>
        </div>
        <Button
          v-if="issues.length > 3"
          variant="ghost"
          size="sm"
          class="w-full text-xs"
          @click="emit('edit')"
        >
          View all {{ issues.length }} issues
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
