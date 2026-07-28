<script setup lang="ts">
import type { ListboxGroupProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ListboxGroup, ListboxGroupLabel, useId } from "reka-ui";
import { computed, onMounted, onUnmounted } from "vue";
import { cn } from "@/lib/utils";
import { provideCommandGroupContext, useCommand } from ".";

const props = defineProps<
  ListboxGroupProps & {
    class?: HTMLAttributes["class"];
    heading?: string;
  }
>();

const delegatedProps = reactiveOmit(props, "class");

const { allGroups, filterState } = useCommand();
const id = useId();

const isRender = computed(() =>
  !filterState.search ? true : filterState.filtered.groups.has(id),
);

provideCommandGroupContext({ id });
onMounted(() => {
  if (!allGroups.value.has(id)) allGroups.value.set(id, new Set());
});
onUnmounted(() => {
  allGroups.value.delete(id);
});
</script>

<template>
  <ListboxGroup
    v-bind="delegatedProps"
    :id="id"
    data-slot="command-group"
    :class="
      cn(
        'text-foreground overflow-hidden px-0 py-0 transition-all duration-100 ease-in-out',
        props.class,
      )
    "
    :hidden="isRender ? undefined : true"
  >
    <ListboxGroupLabel
      v-if="heading"
      data-slot="command-group-heading"
      class="px-4.5 py-2 text-3xs font-medium uppercase tracking-widest text-muted-foreground/70 border-b border-border border-dashed"
    >
      {{ heading }}
    </ListboxGroupLabel>
    <slot />
  </ListboxGroup>
</template>
