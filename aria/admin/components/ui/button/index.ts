import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Button } from "./Button.vue";

const navFocusClasses =
  "focus-visible:ring-0 focus-visible:border-0 focus-visible:border-b focus-visible:border-b-dashed focus-visible:border-b-border focus-visible:border-l-3 focus-visible:border-l-primary focus-visible:border-solid focus-visible:text-sidebar-foreground";

const tabIndicatorClasses =
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-150 after:ease-out after:content-['']";

const tabBaseClasses = `relative h-12! min-h-12! overflow-hidden rounded-none px-5! text-xs! font-regular! uppercase transition-colors bg-transparent! shadow-none hover:bg-transparent! items-center! justify-center! ${tabIndicatorClasses}`;

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium! transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-border focus-visible:ring-border/50 focus-visible:ring-[2px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer shadow-none ",
  {
    variants: {
      variant: {
        default:
          "h-9! bg-primary/90 border rounded-sm! border-border border-solid text-primary-foreground/90 hover:border-primary hover:bg-primary/90 hover:text-primary-foreground active:bg-sidebar active:text-sidebar-foreground active:border-primary active:border-solid duration-150 focus-visible:border-dashed disabled:!opacity-50 tracking-tight inset-0 px-4! font-bold! hover:border-dashed",
          composer:
          "h-9! bg-input/30 border rounded-sm! border-border border-solid text-muted-foreground/70 hover:border-border hover:bg-primary/60 hover:text-foreground active:bg-sidebar active:text-primary-foreground active:border-primary! active:border-solid duration-150 focus-visible:border-solid disabled:!opacity-50 tracking-tight inset-0 px-4! font-bold! hover:border-dashed",

          destructive:
          "h-9! bg-input/30 border rounded-sm! border-border border-solid text-muted-foreground/70 hover:border-border hover:bg-destructive/60 hover:text-foreground active:bg-sidebar active:text-primary-foreground active:border-destructive active:border-solid duration-150 focus-visible:border-dashed disabled:!opacity-50 tracking-tight inset-0 px-4! font-bold! hover:border-dashed",
        outline:
          "h-9! border rounded-sm! border-dashed bg-transparent! text-muted-foreground hover:bg-transparent! hover:text-foreground hover:border-primary focus:border-primary border-border focus-active:border-solid active:bg-transparent! active:text-foreground! active:border-primary data-[state=active]:bg-transparent! data-[state=active]:text-foreground! data-[state=active]:border-primary",
        secondary:
          "h-9! border border-border/50 border-solid bg-sidebar/40 px-4 py-1 text-sm placeholder:text-muted-foreground shadow-none transition-[color,box-shadow] outline-none focus:outline-none focus:ring-0 hover:bg-sidebar/80 hover:border-border/50 hover:border-solid focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar data-[state=open]:border-border data-[state=open]:bg-sidebar/80 data-[state=open]:ring-border/50 data-[state=open]:ring-[1px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start rounded-sm cursor-pointer",
        ghost:
          "h-9! bg-transparent font-medium! text-muted-foreground hover:bg-none hover:text-foreground transition-all duration-100 overflow-hidden rounded-none",
          "ghost-outline":
          "h-9! border rounded-sm border-transparent hover:border-dashed bg-transparent! hover:bg-background hover:text-primary-foreground hover:border-primary focus-visible:border-solid focus-visible:ring-0 focus-visible:ring-border/50 focus-visible:ring-[2px]",
          "sidebar-action":
          "inline-flex items-center justify-center bg-background/80 text-muted-foreground/80 transition-all duration-150 rounded-sm border border-transparent border-dashed hover:border-border hover:bg-background hover:text-foreground active:bg-sidebar active:text-primary-foreground active:border-border active:border-solid active:duration-150 data-[state=open]:bg-sidebar data-[state=open]:border-primary data-[state=open]:border-dashed data-[state=open]:text-foreground focus-visible:border-solid disabled:!opacity-50 focus-visible:ring-0 focus-visible:ring-border/50 focus-visible:ring-[2px] focus-visible:border-solid",
        "color-swatch":
          "border border-border/50 bg-transparent p-0 shadow-sm hover:bg-transparent hover:brightness-110 hover:text-inherit hover:border-dashed rounded-xs!",
        "card-action-primary":
          "h-9! border rounded-sm border-transparent bg-input text-foreground/80 shadow-none transition duration-100 ease-out hover:border-primary/70 hover:bg-primary/40 hover:text-foreground active:scale-95 disabled:cursor-wait disabled:opacity-60",
        "card-action-secondary":
          "h-9! rounded-sm bg-card text-muted-foreground shadow-none transition duration-150 ease-out hover:bg-primary hover:text-foreground hover:shadow-sm active:scale-95 disabled:cursor-wait disabled:opacity-60",
        nav: `bg-transparent rounded-none border-0 font-medium! text-foreground/70 transition-[color,box-shadow,font-weight] duration-100 nav-border-inactive hover:nav-border-hover hover:text-sidebar-foreground hover:font-medium! outline-none ${navFocusClasses}`,
        "nav-active":
          `bg-transparent rounded-none border-0 nav-border-active text-foreground font-medium! transition-[color,box-shadow,font-weight] duration-100 ${navFocusClasses}`,
        link: "text-primary underline-offset-4 hover:underline",
        headerAction:
          "p-0! inline-flex items-center justify-center text-muted-foreground/80 transition-all duration-100 rounded-sm border border-transparent border-dashed hover:border-border/50 hover:bg-sidebar/50 hover:text-foreground active:bg-sidebar active:text-primary-foreground active:border-border active:border-solid active:duration-150 data-[state=open]:bg-sidebar data-[state=open]:border-primary data-[state=open]:border-dashed data-[state=open]:text-foreground focus-visible:border-solid disabled:!opacity-50",
        tab: `${tabBaseClasses} text-muted-foreground hover:text-foreground`,
        "tab-active": `${tabBaseClasses} text-foreground after:scale-x-100`,
        bread:
        "h-7! bg-transparent font-medium! text-muted-foreground hover:bg-sidebar/80 dark:hover:bg-sidebar hover:text-foreground transition-all duration-150 overflow-hidden rounded-sm border border-transparent hover:border-border/80 border-solid",

      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-2",
        xs: "h-7! gap-1! px-2.5! has-[>svg]:px-2! text-xs",
        tab: "h-12! min-h-12! gap-0! p-0!",
        sm: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3",
        md: "h-8.5 gap-1 px-3 has-[>svg]:px-2 text-sm capitalize",
        lg: "h-10 px-4 has-[>svg]:px-4 ",
        icon: "size-9",
        "icon-xs":
          "inline-flex size-4 rounded-lg! items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
        "icon-sm": "size-7 hover:text-primary",
        "icon-lg": "size-9",
        "icon-header": "h-7! w-10! shrink-0 [&_[class*='size-']]:size-3.5!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;
