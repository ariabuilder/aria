<script setup lang="ts">
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

interface Props {
  error: PageDetailError | null;
}

interface Emits {
  dismiss: [];
  retry: [];
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    v-if="error"
    class="rounded-lg border border-destructive/50 bg-destructive/5 p-4"
    role="alert"
  >
    <div class="flex items-start gap-3">
      <span :class="[studioIcons.warning, 'size-5 text-destructive shrink-0 mt-0.5']" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-foreground">{{ error.message }}</p>
        <p v-if="error.details" class="text-xs text-muted-foreground mt-1">
          {{ error.details }}
        </p>
        <div class="flex items-center gap-2 mt-2">
          <Button
            v-if="error.retry"
            variant="outline"
            size="sm"
            class="text-xs h-7"
            @click="emit('retry')"
          >
            <span :class="[studioIcons.refresh, 'size-3 mr-1.5']" />
            Retry
          </Button>
          <span class="text-2xs text-muted-foreground">
            {{ error.severity === "critical" ? "Critical error" : "Error" }}
            · {{ error.code }}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="size-6 p-0 shrink-0"
        @click="emit('dismiss')"
      >
        <span :class="[studioIcons.close, 'size-3']" />
      </Button>
    </div>
  </div>
</template>
