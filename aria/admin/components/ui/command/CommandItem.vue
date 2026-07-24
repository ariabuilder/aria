<script setup lang="ts">
import type {
  AcceptableValue,
  ListboxItemEmits,
  ListboxItemProps,
  ListboxItemSelectEvent,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit, useCurrentElement } from "@vueuse/core";
import { ListboxItem, useForwardPropsEmits, useId } from "reka-ui";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { cn } from "@/lib/utils";
import { useCommand, useCommandGroup } from ".";

const props = defineProps<
  ListboxItemProps & {
    class?: HTMLAttributes["class"];
    forceVisible?: boolean;
  }
>();
const emits = defineEmits<ListboxItemEmits>();

const delegatedProps = reactiveOmit(props, "class", "forceVisible");

const forwarded = useForwardPropsEmits(delegatedProps, emits);

const filterItemId = useId();
const { filterState, allItems, allGroups } = useCommand();
const groupContext = useCommandGroup();

const isRender = computed(() => {
  if (props.forceVisible) {
    return true;
  }
  if (!filterState.search) {
    return true;
  } else {
    const filteredCurrentItem = filterState.filtered.items.get(filterItemId);
    // If the filtered items is undefined means not in the all times map yet
    // Do the first render to add into the map
    if (filteredCurrentItem === undefined) {
      return true;
    }

    // Check with filter
    return filteredCurrentItem > 0;
  }
});

const itemRef = ref();
const currentElement = useCurrentElement(itemRef);

function registerForcedMatch(): void {
  if (!props.forceVisible || !filterState.search) return;
  const wasMatched = filterState.filtered.items.get(filterItemId) === 1;
  filterState.filtered.items.set(filterItemId, 1);
  const groupId = groupContext?.id;
  if (groupId) filterState.filtered.groups.add(groupId);
  if (!wasMatched) filterState.filtered.count += 1;
}

onMounted(() => {
  if (!(currentElement.value instanceof HTMLElement)) return;

  // textValue to perform filter
  allItems.value.set(
    filterItemId,
    currentElement.value.textContent ?? props.value?.toString() ?? "",
  );

  const groupId = groupContext?.id;
  if (groupId) {
    if (!allGroups.value.has(groupId)) {
      allGroups.value.set(groupId, new Set([filterItemId]));
    } else {
      allGroups.value.get(groupId)?.add(filterItemId);
    }
  }

  registerForcedMatch();
});
watch(
  () => filterState.search,
  () => registerForcedMatch(),
);
onUnmounted(() => {
  if (
    props.forceVisible &&
    filterState.filtered.items.get(filterItemId) === 1
  ) {
    filterState.filtered.count = Math.max(0, filterState.filtered.count - 1);
  }
  allItems.value.delete(filterItemId);
});

function onSelect(event: ListboxItemSelectEvent<AcceptableValue>): void {
  filterState.search = "";
  emits("select", event);
}
</script>

<template>
  <ListboxItem
    v-if="isRender"
    v-bind="forwarded"
    ref="itemRef"
    data-slot="command-item"
    :class="
      cn(
        'relative flex w-full cursor-default select-none items-center border-b border-border border-dashed px-3 py-2 text-xs text-muted-foreground outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-sidebar! data-highlighted:text-foreground! hover:bg-sidebar/50! hover:text-foreground active:bg-sidebar active:text-foreground disabled:!opacity-50 [&_svg:not([class*=\'text-\'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
        props.class,
      )
    "
    @select="onSelect"
  >
    <slot />
  </ListboxItem>
</template>
