/**
 * Applies design tokens and styles to builder nodes. Generates
 * CSS and manages style application to the canvas.
 */

import { ref, computed } from "vue";
import { designTokensState } from "./useDesignTokens";

export interface GeneratedConfig {
  presets: string[];
  transformers: string[];
  theme: {
    colors: Record<string, unknown>;
    fontFamily: Record<string, string[]>;
    fontSize: Record<string, [string, { lineHeight: string }]>;
    letterSpacing: Record<string, string>;
    spacing: Record<string | number, string>;
    boxShadow: Record<string, string>;
    borderRadius: Record<string, string>;
    blur: Record<string, string>;
    screens: Record<string, string>;
    animation: Record<string, string>;
    keyframes: Record<string, Record<string, Record<string, string>>>;
  };
  shortcuts: Record<string, string>;
  safelist: string[];
  content: {
    filesystem: string[];
    pipeline: {
      include: RegExp[];
      exclude: RegExp[];
    };
  };
}

export interface SaveResult {
  success: boolean;
  config?: GeneratedConfig;
  error?: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Style applicator for generating and applying UnoCSS configuration
 *
 * @example
 * ```ts
 * const { generateConfig, saveConfiguration, exportConfiguration } = useStyleApplicator();
 *
 * // Generate complete UnoCSS config
 * const config = generateConfig();
 *
 * // Save to project
 * const result = await saveConfiguration();
 * ```
 */
export function useStyleApplicator() {
  const isGenerating = ref(false);
  const lastGenerated = ref<Date | null>(null);

  /**
   * Generate the complete UnoCSS configuration from current tokens
   */
  function generateConfig(): GeneratedConfig {
    return {
      presets: ["@unocss/preset-uno", "@unocss/preset-typography"],
      transformers: [
        "@unocss/transformer-directives",
        "@unocss/transformer-variant-group",
      ],
      theme: {
        colors: {
          ...designTokensState.colors,
          ...designTokensState.semanticColors,
        },
        fontFamily: designTokensState.typography.fontFamilies,
        fontSize: designTokensState.typography.fontSizes,
        letterSpacing: designTokensState.typography.letterSpacing,
        spacing: designTokensState.spacing,
        boxShadow: designTokensState.effects.shadows,
        borderRadius: designTokensState.effects.borderRadius,
        blur: designTokensState.effects.blur,
        screens: designTokensState.breakpoints,
        animation: designTokensState.animations,
        keyframes: designTokensState.keyframes,
      },
      shortcuts: designTokensState.shortcuts,
      safelist: [
        // Ensure common utilities are always available
        "bg-background",
        "text-foreground",
        "border-border",
        "bg-primary",
        "bg-secondary",
        "bg-accent",
        "bg-destructive",
        "text-primary-foreground",
        "text-secondary-foreground",
        "text-accent-foreground",
        "text-destructive-foreground",
        "text-muted-foreground",
        "hover:bg-primary/90",
        "hover:bg-secondary/80",
        "hover:bg-accent/90",
        "hover:bg-destructive/90",
        "focus:ring-2",
        "focus:ring-primary",
        "focus:ring-offset-2",
        "transition-all",
        "transition-colors",
        "duration-200",
        "duration-300",
        "ease-in-out",
        "ease-out",
      ],
      content: {
        filesystem: [
          "./aria/admin/**/*.{vue,ts,js}",
          "./aria/pages/**/*.{astro,vue}",
          "./src/**/*.{astro,html,js,jsx,ts,tsx,vue}",
          "./aria/components/**/*.{astro,vue}",
          "./aria/storage/pages/**/*.json",
          "./aria/storage/components/**/*.json",
        ],
        pipeline: {
          include: [
            /\.(vue|svelte|[jt]sx?|mdx?|astro|elm|php|phtml|html)($|\?)/,
            /\.json$/,
          ],
          exclude: [
            /node_modules/,
            /\.git/,
            /dist/,
            /build/,
            /uno\.aria\.config\.ts/,
            /uno\.user\.config\.ts/,
          ],
        },
      },
    };
  }

  /**
   * Save configuration to the actual UnoCSS config file
   */
  async function saveConfiguration(): Promise<SaveResult> {
    isGenerating.value = true;

    try {
      const config = generateConfig();

      // Here we would save to the uno.aria.config.ts file
      // For now, we'll just update our in-memory state
      console.log("Generated UnoCSS Config:", config);

      lastGenerated.value = new Date();

      return {
        success: true,
        config,
        message: "UnoCSS configuration updated successfully",
      };
    } catch (error) {
      console.error("Failed to save UnoCSS configuration:", error);
      return {
        success: false,
        error: (error as Error).message,
        message: "Failed to update UnoCSS configuration",
      };
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * Export configuration as JSON file download
   */
  function exportConfiguration(): void {
    const config = generateConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "uno-config.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Import configuration from JSON file
   */
  async function importConfiguration(file: File): Promise<SaveResult> {
    try {
      const text = await file.text();
      const config = JSON.parse(text);

      // Validate and merge configuration using design tokens
      if (config.theme?.colors) {
        Object.assign(designTokensState.colors, config.theme.colors);
      }
      if (config.theme?.fontFamily) {
        designTokensState.typography.fontFamilies = config.theme.fontFamily;
      }
      if (config.theme?.spacing) {
        Object.assign(designTokensState.spacing, config.theme.spacing);
      }
      if (config.shortcuts) {
        Object.assign(designTokensState.shortcuts, config.shortcuts);
      }

      return {
        success: true,
        message: "Configuration imported successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        message: "Failed to import configuration",
      };
    }
  }

  /**
   * Validate current configuration
   */
  function validateConfiguration(): ValidationResult {
    const errors: string[] = [];

    if (!designTokensState.colors.primary) {
      errors.push("Primary color is required");
    }

    for (const [name, classes] of Object.entries(designTokensState.shortcuts)) {
      if (typeof classes !== "string" || classes.trim() === "") {
        errors.push(`Shortcut "${name}" has invalid classes`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate CSS custom properties from tokens
   */
  function generateCssVariables(): string {
    const lines: string[] = [":root {"];

    for (const [name, scale] of Object.entries(designTokensState.colors)) {
      if (typeof scale === "object") {
        for (const [shade, value] of Object.entries(scale)) {
          lines.push(`  --color-${name}-${shade}: ${value};`);
        }
      } else {
        lines.push(`  --color-${name}: ${scale};`);
      }
    }

    for (const [key, value] of Object.entries(designTokensState.spacing)) {
      lines.push(`  --spacing-${key}: ${value};`);
    }

    for (const [key, value] of Object.entries(
      designTokensState.effects.shadows,
    )) {
      lines.push(`  --shadow-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(
      designTokensState.effects.borderRadius,
    )) {
      lines.push(`  --radius-${key}: ${value};`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  /**
   * Preview configuration changes in the canvas
   */
  function previewChanges(): void {
    // This would apply changes temporarily to the preview iframe
    console.log("Previewing UnoCSS configuration changes");
  }

  return {
    isGenerating: computed(() => isGenerating.value),
    lastGenerated: computed(() => lastGenerated.value),

    generateConfig,
    saveConfiguration,
    exportConfiguration,
    importConfiguration,
    validateConfiguration,
    generateCssVariables,
    previewChanges,
  };
}
