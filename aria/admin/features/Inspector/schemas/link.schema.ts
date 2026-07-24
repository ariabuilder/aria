/**
 * Link Schema
 *
 * Zod validation for link/anchor values.
 */

import { z } from "zod";
import { ListItemLinkScopeSchema } from "../../../../lib/blocks/listItemLinks";

/**
 * Link target options
 */
export const LinkTargetSchema = z.enum(["_self", "_blank", "_parent", "_top"]);

/**
 * List item link scope options
 */
export const LinkScopeSchema = ListItemLinkScopeSchema;

export const LinkValueSchema = z.object({
  href: z.string().default(""),
  target: LinkTargetSchema.default("_self"),
  rel: z.string().optional(),
  title: z.string().optional(),
  download: z.union([z.boolean(), z.string()]).optional(),
  linkScope: LinkScopeSchema.optional(),
});

export type LinkValue = z.infer<typeof LinkValueSchema>;
export type LinkTarget = z.infer<typeof LinkTargetSchema>;
export type LinkScope = z.infer<typeof LinkScopeSchema>;

export const DEFAULT_LINK: LinkValue = {
  href: "",
  target: "_self",
};

export const LINK_TARGET_LABELS: Record<LinkTarget, string> = {
  _self: "Same Window",
  _blank: "New Tab",
  _parent: "Parent Frame",
  _top: "Top Frame",
};

/**
 * Common rel attribute values
 */
export const LINK_REL_OPTIONS = [
  { label: "None", value: "" },
  { label: "No Opener", value: "noopener" },
  { label: "No Referrer", value: "noreferrer" },
  { label: "No Follow", value: "nofollow" },
  { label: "External", value: "noopener noreferrer" },
];

export function isExternalUrl(href: string): boolean {
  if (!href) return false;
  return href.startsWith("http://") || href.startsWith("https://");
}

export function isAnchorLink(href: string): boolean {
  return href.startsWith("#");
}

export function isMailtoLink(href: string): boolean {
  return href.startsWith("mailto:");
}

export function isTelLink(href: string): boolean {
  return href.startsWith("tel:");
}

/**
 * Get appropriate rel for external links
 */
export function getSecureRel(href: string, target: LinkTarget): string {
  if (target === "_blank" && isExternalUrl(href)) {
    return "noopener noreferrer";
  }
  return "";
}
