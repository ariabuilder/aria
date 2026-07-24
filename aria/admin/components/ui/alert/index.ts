import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Alert } from "./Alert.vue";
export { default as AlertDescription } from "./AlertDescription.vue";
export { default as AlertTitle } from "./AlertTitle.vue";

export const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid grid-cols-[0_1fr] gap-y-0.5 items-start has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 has-[>span[aria-hidden=true]]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>span[aria-hidden=true]]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current [&>span[aria-hidden=true]]:inline-flex [&>span[aria-hidden=true]]:size-4 [&>span[aria-hidden=true]]:shrink-0 [&>span[aria-hidden=true]]:translate-y-0.5 [&>span[aria-hidden=true]]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        destructive:
          "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type AlertVariants = VariantProps<typeof alertVariants>;
