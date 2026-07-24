import { z } from "zod";

export const DesignSystemPathsManifest = z
  .object({
    description: z.string(),
    sections: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        readVia: z.array(z.string()),
        writableVia: z.array(z.string()),
      }),
    ),
  })
  .strict()
  .parse({
    description:
      "Design system structure for the AI agent. Each section maps to one or more tools for reading and writing.",
    sections: [
      {
        id: "colors",
        label: "Colors",
        description:
          "Primary color palette, semantic colors (success/warning/error/info), and built-in palette templates. " +
          'Read with aria_get_design_system(detail:"full") to get palettes as arrays of { name, shades } or as a record keyed by palette name. ' +
          "Modify the primary brand color with aria_set_design_system_primary_color (hex like #ef4444 or named colors like red). " +
          "Replace the full palette with aria_save_design_system_colors. " +
          "Apply a built-in template with aria_apply_design_system_template by templateId (see paletteTemplates in the read output).",
        readVia: ["aria_get_design_system"],
        writableVia: [
          "aria_set_design_system_primary_color",
          "aria_save_design_system_colors",
          "aria_apply_design_system_template",
        ],
      },
      {
        id: "typography",
        label: "Typography",
        description:
          "Font families (body, heading, mono) and the complete type scale. Scale size and lineHeight are pixel numbers; letterSpacing is an em number. " +
          "Heading levels use fixed scale tokens: h1=5xl, h2=4xl, h3=3xl, h4=2xl, h5=xl, h6=lg. " +
          "headingOverrides and bodyOverrides only assign font-family strings by scale token; they never contain weight, transform, size, or spacing objects. " +
          "Read full detail to get the save-ready typography object, preserve unchanged values, and save with aria_save_design_system_typography. " +
          "Use global styles for element weights, transforms, colors, and other CSS defaults. " +
          "Google Fonts and custom font uploads are managed separately via aria_list_fonts / aria_enable_google_font.",
        readVia: ["aria_get_design_system"],
        writableVia: ["aria_save_design_system_typography"],
      },
      {
        id: "globalStyles",
        label: "Global Styles",
        description:
          "Site-wide CSS defaults for body, heading (one shared bucket for h1-h6), subheading, paragraph, link, button, input, and section. " +
          "Body supports backgroundColor, color, fontFamily, fontSize, lineHeight, fontWeight, letterSpacing, and textWrap. " +
          "Heading supports color, fontFamily, fontWeight, lineHeight, letterSpacing, textTransform, and textWrap. " +
          "Paragraph supports color, fontFamily, fontSize, lineHeight, letterSpacing, maxWidth, and textWrap. " +
          "Link, button, and input include their state, sizing, border, and spacing fields in the full read output. " +
          "Section spacing lives at globalStyles.defaults.section (verticalPadding, horizontalPadding, contentMaxWidth, sectionGap). " +
          "Read full detail to get the save-ready globalStyles object; copy it, change only requested fields, and save the complete object with aria_save_design_system_global_styles. " +
          "CSS variables can be managed individually with aria_manage_css_variables.",
        readVia: ["aria_get_design_system"],
        writableVia: [
          "aria_save_design_system_global_styles",
          "aria_manage_css_variables",
        ],
      },
      {
        id: "breakpoints",
        label: "Breakpoints",
        description:
          "Responsive breakpoints array. Each item has id, label, minWidth, canvasWidth, enabled, isDefault, order. " +
          "Must include a base breakpoint. " +
          "Read full detail to get current breakpoints. Save changes with aria_save_design_system_breakpoints.",
        readVia: ["aria_get_design_system"],
        writableVia: ["aria_save_design_system_breakpoints"],
      },
      {
        id: "classes",
        label: "Class Manager",
        description:
          "Semantic CSS classes (custom classes) that can be applied to any block via its customClasses array or classNames breakpoint map. " +
          "List classes with aria_list_classes. " +
          "Create classes with aria_create_class (name + optional initialRules as flat CSS rules). " +
          "Add/update rules with aria_update_class_rule. Remove rules with aria_remove_class_rule. " +
          "Delete with aria_delete_class. " +
          "Rename with aria_rename_class (blocks referencing the old name still use it; suggest aria_apply_class_to_nodes to migrate). " +
          "Apply an existing class to specific node IDs with aria_apply_class_to_nodes.",
        readVia: ["aria_get_design_system", "aria_list_classes"],
        writableVia: [
          "aria_create_class",
          "aria_update_class_rule",
          "aria_remove_class_rule",
          "aria_delete_class",
          "aria_rename_class",
          "aria_duplicate_class",
          "aria_apply_class_to_nodes",
        ],
      },
      {
        id: "cssVariables",
        label: "CSS Variables",
        description:
          "CSS custom properties stored in globalStyles.variables.custom (keyed WITHOUT -- prefix). " +
          "Set or remove variables with aria_manage_css_variables. " +
          "Design tokens (colors from palettes, typography sizes) are automatically exposed as CSS variables — do not duplicate them.",
        readVia: ["aria_get_design_system"],
        writableVia: ["aria_manage_css_variables"],
      },
      {
        id: "fonts",
        label: "Fonts",
        description:
          "Google Fonts and custom uploaded fonts. " +
          "List available Google Fonts with aria_list_fonts. Get current site font config with aria_get_font_config. " +
          "Enable one with aria_enable_google_font. Disable any font with aria_disable_font. " +
          "Upload custom fonts via the client-side upload_custom_font tool (browser only). " +
          "Font family names from design system typography must match an enabled font for the CSS to work.",
        readVia: [
          "aria_get_design_system",
          "aria_list_fonts",
          "aria_get_font_config",
        ],
        writableVia: [
          "aria_enable_google_font",
          "aria_disable_font",
          "upload_custom_font",
        ],
      },
      {
        id: "regenerate",
        label: "Regenerate CSS",
        description:
          "Rebuild the global CSS bundle from current design system state. Call aria_regenerate_global_css after making multiple design changes to ensure CSS is up to date. " +
          "Returns the new styleRevision, CSS hash, and count of invalidated pages. " +
          "Optionally pass the current styleRevision for optimistic locking.",
        readVia: [],
        writableVia: ["aria_regenerate_global_css"],
      },
    ],
  });

export type DesignSystemPathsManifest = typeof DesignSystemPathsManifest;
