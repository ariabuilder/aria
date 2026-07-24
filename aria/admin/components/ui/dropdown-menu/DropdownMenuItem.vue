<script setup lang="ts">
import type { DropdownMenuItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DropdownMenuItem, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<
    DropdownMenuItemProps & {
      class?: HTMLAttributes["class"];
      inset?: boolean;
      variant?: "default" | "destructive";
    }
  >(),
  {
    variant: "default",
  },
);

const delegatedProps = reactiveOmit(props, "inset", "variant", "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuItem
    data-slot="dropdown-menu-item"
    :data-inset="inset ? '' : undefined"
    :data-variant="variant"
    v-bind="forwardedProps"
    :class="
      cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 border-0 border-b border-border border-dashed px-3 py-2 text-xs text-muted-foreground outline-none last:border-b-0',
        'hover:bg-sidebar/40 hover:text-accent-foreground',
        'active:bg-sidebar active:text-accent-foreground',
        'focus-visible:border-0 focus-visible:border-b focus-visible:border-border focus:bg-accent focus:text-accent-foreground',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'data-inset:pl-8',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 [&_svg:not([class*=\'text-\'])]:text-current',
        'data-[variant=destructive]:text-destructive',
        'data-[variant=destructive]:hover:bg-destructive/10 data-[variant=destructive]:hover:text-destructive',
        'data-[variant=destructive]:data-[highlighted]:bg-destructive/10 data-[variant=destructive]:data-[highlighted]:text-destructive',
        'data-[variant=destructive]:focus-visible:bg-destructive/10 data-[variant=destructive]:focus-visible:text-destructive',
        'data-[variant=destructive]:active:bg-destructive/10 data-[variant=destructive]:active:text-destructive',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
