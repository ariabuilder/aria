<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  accessMode: string
  password?: string
  hasPassword?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  "update:accessMode": [value: string]
  "update:password": [value: string]
}>()

const accessOptions = [
  { value: "public", label: "Public", description: "Anyone can view" },
  { value: "password", label: "Password Protected", description: "Requires a password" },
  { value: "private", label: "Private", description: "Only editors can view" },
  { value: "unlisted", label: "Unlisted", description: "Hidden from navigation" },
] as const
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm font-medium">Access</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="space-y-2">
        <Label for="page-access">Access Mode</Label>
        <Select
          :model-value="accessMode"
          @update:model-value="emit('update:accessMode', $event as string)"
        >
          <SelectTrigger id="page-access">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in accessOptions"
              :key="opt.value"
              :value="opt.value"
            >
              <div>
                <div class="font-medium">{{ opt.label }}</div>
                <div class="text-xs text-muted-foreground">{{ opt.description }}</div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div v-if="accessMode === 'password' || hasPassword" class="space-y-2">
        <Label for="page-password">Password</Label>
        <Input
          id="page-password"
          type="text"
          :value="password ?? ''"
          placeholder="Enter page password"
          @update:model-value="emit('update:password', $event as string)"
        />
      </div>
    </CardContent>
  </Card>
</template>
