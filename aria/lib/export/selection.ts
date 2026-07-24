import {
  CmsExportOptionsSchema,
  SITE_EXPORT_SECTIONS,
  SiteExportSelectionSchema,
  type CmsExportOptions,
  type ResolvedSiteExportSections,
  type SiteExportPreset,
  type SiteExportSection,
  type SiteExportSelection,
  type SiteExportSelectionInput,
} from "./cmsTypes";

const PRESET_SECTIONS: Record<
  Exclude<SiteExportPreset, "custom">,
  ResolvedSiteExportSections
> = {
  full: {
    pages: true,
    layouts: true,
    components: true,
    designSystem: true,
    siteSettings: true,
    media: true,
    cms: true,
    redirects: true,
    discovery: true,
    contentState: true,
    pageMetadata: true,
  },
  dataOnly: {
    pages: false,
    layouts: false,
    components: false,
    designSystem: false,
    siteSettings: true,
    media: false,
    cms: true,
    redirects: true,
    discovery: false,
    contentState: true,
    pageMetadata: false,
  },
  codeOnly: {
    pages: true,
    layouts: true,
    components: true,
    designSystem: true,
    siteSettings: true,
    media: false,
    cms: false,
    redirects: true,
    discovery: true,
    contentState: false,
    pageMetadata: true,
  },
  mediaOnly: {
    pages: false,
    layouts: false,
    components: false,
    designSystem: false,
    siteSettings: true,
    media: true,
    cms: false,
    redirects: false,
    discovery: false,
    contentState: false,
    pageMetadata: false,
  },
};

function createDefaultSections(): ResolvedSiteExportSections {
  return { ...PRESET_SECTIONS.full };
}

export function resolveCmsExportOptionsFromSelection(
  selection: SiteExportSelectionInput | undefined,
): CmsExportOptions {
  const parsedSelection = SiteExportSelectionSchema.parse(selection ?? {});
  return CmsExportOptionsSchema.parse(parsedSelection.cms ?? {});
}

export function resolveExportSelection(
  selection: SiteExportSelectionInput | undefined,
): {
  sections: ResolvedSiteExportSections;
  mediaMode: SiteExportSelection["mediaMode"];
  cms: CmsExportOptions;
  preset: SiteExportPreset;
} {
  const parsed = SiteExportSelectionSchema.parse(selection ?? {});
  const baseSections =
    parsed.preset === "custom"
      ? createDefaultSections()
      : { ...PRESET_SECTIONS[parsed.preset] };

  if (parsed.sections) {
    for (const section of SITE_EXPORT_SECTIONS) {
      const override = parsed.sections[section];
      if (override !== undefined) {
        baseSections[section] = override;
      }
    }
  }

  if (!Object.values(baseSections).some(Boolean)) {
    throw new Error("At least one export section must be enabled");
  }

  const mediaMode = baseSections.media === false ? "omit" : parsed.mediaMode;

  return {
    sections: baseSections,
    mediaMode,
    cms: CmsExportOptionsSchema.parse(parsed.cms ?? {}),
    preset: parsed.preset,
  };
}

const SECTION_LABELS: Record<SiteExportSection, string> = {
  pages: "Pages",
  layouts: "Layouts",
  components: "Components",
  designSystem: "Design system",
  siteSettings: "Site settings",
  media: "Media files",
  cms: "CMS collections",
  redirects: "Redirects",
  discovery: "Discovery (robots, sitemap)",
  contentState: "Content state & ordering",
  pageMetadata: "Page metadata",
};

export function getSiteExportSectionLabel(section: SiteExportSection): string {
  return SECTION_LABELS[section];
}

export const SITE_EXPORT_PRESETS: ReadonlyArray<{
  id: Exclude<SiteExportPreset, "custom">;
  label: string;
  description: string;
}> = [
  {
    id: "full",
    label: "Full site",
    description: "Complete portable archive with code, CMS, and media",
  },
  {
    id: "dataOnly",
    label: "Data only",
    description: "CMS collections and settings without pages or media",
  },
  {
    id: "codeOnly",
    label: "Code only",
    description: "Pages, layouts, and design system without CMS or media",
  },
  {
    id: "mediaOnly",
    label: "Media only",
    description: "Uploaded media files and site settings",
  },
];

export function createDefaultSiteExportSelection(): SiteExportSelection {
  return SiteExportSelectionSchema.parse({
    preset: "full",
    mediaMode: "bundle",
  });
}
