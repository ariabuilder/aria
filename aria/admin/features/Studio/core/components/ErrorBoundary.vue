<script setup lang="ts">
import { ref, onErrorCaptured } from "vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

defineProps<{
  fallback?: string
}>()

const error = ref<Error | null>(null)

onErrorCaptured((err: Error) => {
  error.value = err
  return false
})

function handleReset() {
  error.value = null
}
</script>

<template>
  <Card v-if="error" class="m-4 border-destructive">
    <CardHeader>
      <CardTitle class="text-destructive">Something went wrong</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="text-sm text-muted-foreground mb-4">{{ error.message }}</p>
      <Button variant="outline" @click="handleReset">
        Try again
      </Button>
    </CardContent>
  </Card>
  <slot v-else />
</template>
