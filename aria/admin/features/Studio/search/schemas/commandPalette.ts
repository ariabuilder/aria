import { z } from "zod";
import { ENTRY_STATUSES } from "../../../../../lib/cms/constants";

/** Page row shown in the site-wide command palette. */
export const CommandPalettePageItemSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
});

/** Layout row — routing uses layout id as the URL segment. */
export const CommandPaletteLayoutItemSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
});

/** Component row — routing uses component id as the URL segment. */
export const CommandPaletteComponentItemSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

/** CMS entry row shown in the site-wide command palette. */
export const CommandPaletteCmsEntryItemSchema = z.object({
  id: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  collectionName: z.string().trim().min(1),
  collectionLabel: z.string().trim().min(1),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  locale: z.string().trim().min(1),
  status: z.enum(ENTRY_STATUSES),
  updatedAt: z.string().trim().min(1),
});

export const CommandPaletteCmsCollectionItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export const CommandPalettePropsSchema = z.object({
  pages: z.array(CommandPalettePageItemSchema),
  layouts: z.array(CommandPaletteLayoutItemSchema),
  components: z.array(CommandPaletteComponentItemSchema),
  cmsEntries: z.array(CommandPaletteCmsEntryItemSchema).optional(),
  cmsCollections: z.array(CommandPaletteCmsCollectionItemSchema).optional(),
});

export type CommandPalettePageItem = z.infer<
  typeof CommandPalettePageItemSchema
>;
export type CommandPaletteLayoutItem = z.infer<
  typeof CommandPaletteLayoutItemSchema
>;
export type CommandPaletteComponentItem = z.infer<
  typeof CommandPaletteComponentItemSchema
>;
export type CommandPaletteCmsEntryItem = z.infer<
  typeof CommandPaletteCmsEntryItemSchema
>;
export type CommandPaletteCmsCollectionItem = z.infer<
  typeof CommandPaletteCmsCollectionItemSchema
>;

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon: string;
  keywords: string;
  serverMatched?: boolean;
  action: () => void | Promise<void>;
}

interface BuilderPageSource {
  slug: string;
  title: string;
}

interface BuilderLayoutSource {
  id: string;
  name: string;
  title?: string;
  description?: string;
}

interface BuilderComponentSource {
  id: string;
  name: string;
  description?: string;
}

export function mapPagesToPaletteItems(
  pages: readonly BuilderPageSource[],
): CommandPalettePageItem[] {
  const items: CommandPalettePageItem[] = [];
  for (const page of pages) {
    const parsed = CommandPalettePageItemSchema.safeParse({
      slug: page.slug,
      title: page.title,
    });
    if (parsed.success) {
      items.push(parsed.data);
    }
  }
  return items;
}

export function mapLayoutsToPaletteItems(
  layouts: readonly BuilderLayoutSource[],
): CommandPaletteLayoutItem[] {
  const items: CommandPaletteLayoutItem[] = [];
  for (const layout of layouts) {
    const parsed = CommandPaletteLayoutItemSchema.safeParse({
      slug: layout.id,
      name: layout.name,
      title: layout.title,
      description: layout.description,
    });
    if (parsed.success) {
      items.push(parsed.data);
    }
  }
  return items;
}

export function mapComponentsToPaletteItems(
  components: readonly BuilderComponentSource[],
): CommandPaletteComponentItem[] {
  const items: CommandPaletteComponentItem[] = [];
  for (const component of components) {
    const parsed = CommandPaletteComponentItemSchema.safeParse({
      slug: component.id,
      name: component.name,
      description: component.description,
    });
    if (parsed.success) {
      items.push(parsed.data);
    }
  }
  return items;
}

export function parseCommandPaletteProps(input: {
  pages: unknown;
  layouts: unknown;
  components: unknown;
  cmsEntries?: unknown;
}): z.infer<typeof CommandPalettePropsSchema> {
  return CommandPalettePropsSchema.parse(input);
}
