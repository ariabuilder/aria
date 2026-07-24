<script setup lang="ts">
import { computed } from "vue";
import type { PageInventoryAuthorship } from "../../../../../lib/authorship/schemas";
import { formatActorDisplayName } from "../../../../../lib/authorship/reads";
import { formatRelativeTime } from "@/features/Core/utils/formatting";

interface Props {
  authorship?: PageInventoryAuthorship;
}

const props = defineProps<Props>();

function actorName(
  actor: PageInventoryAuthorship["createdBy"],
): string | null {
  if (!actor) return null;
  return formatActorDisplayName(actor);
}

const createdLine = computed(() => {
  const a = props.authorship;
  if (!a?.createdBy && !a?.createdAt) return null;
  const name = actorName(a.createdBy);
  const time = a.createdAt ? formatRelativeTime(a.createdAt) : "";
  if (name && time) return `${name} · ${time}`;
  return name ?? (time ? time : null);
});

const updatedLine = computed(() => {
  const a = props.authorship;
  if (!a?.updatedBy && !a?.updatedAt && !a?.lastEditorName) return null;
  const name =
    a.lastEditorName ??
    (a.updatedBy ? formatActorDisplayName(a.updatedBy) : null);
  const time = a.updatedAt ? formatRelativeTime(a.updatedAt) : "";
  if (name && time) return `${name} · ${time}`;
  return name ?? (time ? time : null);
});

const hasContent = computed(
  () => createdLine.value !== null || updatedLine.value !== null,
);
</script>

<template>
  <div
    v-if="hasContent"
    class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
  >
    <span v-if="createdLine" class="text-muted-foreground">
      Created <span class="text-foreground">{{ createdLine }}</span>
    </span>
    <span v-if="updatedLine" class="text-muted-foreground">
      Updated <span class="text-foreground">{{ updatedLine }}</span>
    </span>
  </div>
</template>
