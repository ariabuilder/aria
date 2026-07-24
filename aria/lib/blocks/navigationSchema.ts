import { z } from "zod";

export const NavigationSourceModeSchema = z.enum(["static", "cms", "mixed"]);
export const NavigationDirectionSchema = z.enum(["horizontal", "vertical"]);
export const NavigationAlignSchema = z.enum(["start", "center", "end", "between"]);
export const NavigationSubmenuTriggerSchema = z.enum(["hover", "click", "both"]);
export const NavigationMobileModeSchema = z.enum([
  "drawer",
  "overlay",
  "inline",
  "none",
]);
export const NavigationMobileDrawerSideSchema = z.enum(["left", "right"]);
export const NavigationActiveMatchSchema = z.enum(["exact", "prefix", "none"]);
export const NavigationLoopModeSchema = z.enum(["collection", "field"]);
export const NavItemSubmenuTypeSchema = z.enum(["none", "dropdown", "mega"]);
export const NavItemVisibilitySchema = z.enum(["all", "desktop", "mobile"]);

export const NavigationPropsSchema = z
  .object({
    ariaLabel: z.string().trim().min(1).max(200).default("Main navigation"),
    sourceMode: NavigationSourceModeSchema.default("static"),
    direction: NavigationDirectionSchema.default("horizontal"),
    align: NavigationAlignSchema.default("start"),
    submenuTrigger: NavigationSubmenuTriggerSchema.default("hover"),
    submenuOpenDelay: z.int().min(0).max(2000).default(0),
    submenuCloseDelay: z.int().min(0).max(2000).default(150),
    mobileEnabled: z.boolean().default(true),
    mobileBreakpoint: z.string().trim().min(1).max(32).default("md"),
    mobileMode: NavigationMobileModeSchema.default("drawer"),
    mobileDrawerSide: NavigationMobileDrawerSideSchema.default("left"),
    activeMatch: NavigationActiveMatchSchema.default("prefix"),
    builderKeepOpen: z.boolean().default(false),
    loopMode: NavigationLoopModeSchema.default("collection"),
    fieldPath: z.string().trim().max(120).optional(),
  })
  .strict();

export const NavItemPropsSchema = z
  .object({
    submenuType: NavItemSubmenuTypeSchema.default("none"),
    visibility: NavItemVisibilitySchema.default("all"),
  })
  .strict();

export type NavigationProps = z.infer<typeof NavigationPropsSchema>;
export type NavItemProps = z.infer<typeof NavItemPropsSchema>;

export const DEFAULT_NAVIGATION_PROPS = NavigationPropsSchema.parse({});

export function parseNavigationProps(
  value: unknown,
): NavigationProps {
  return NavigationPropsSchema.parse({
    ...DEFAULT_NAVIGATION_PROPS,
    ...(typeof value === "object" && value !== null ? value : {}),
  });
}

export function parseNavItemProps(value: unknown): NavItemProps {
  return NavItemPropsSchema.parse({
    submenuType: "none",
    visibility: "all",
    ...(typeof value === "object" && value !== null ? value : {}),
  });
}
