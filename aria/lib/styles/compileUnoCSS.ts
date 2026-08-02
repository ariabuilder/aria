/**
 * Compiles all utility CSS from DSL content at publish time so client
 * pages ship a single static CSS file with zero framework JavaScript.
 */

import { createHash } from "node:crypto";
import { log } from "../utils/logger";
import { createUserUnoConfig } from "../../../uno.user.config";
import {
  parseUserUnoConfigOverrides,
  type UserUnoConfigOverrides,
} from "./userUnoConfig";
import type { ResolvedUserTheme } from "./resolvedUserTheme";
import type { UserConfig } from "@unocss/core";

/**
 * Generate compiled CSS: UnoCSS utilities + custom fonts + custom classes.
 *
 * Scans the provided HTML content (generated from all DSL pages, layouts,
 * and components) and produces the exact set of utility rules used,
 * combined with custom fonts and custom classes.
 *
 * @param htmlContent - Combined HTML from scanAllDSLForHTML()
 * @param customFontsCSS - @font-face rules for custom fonts
 * @param customClassesCSS - User's custom CSS classes
 * @param darkMode - Dark mode strategy
 * @param unocssConfig - Optional user theme/shortcuts/safelist overrides
 * @param utilityClasses - Exact database-provided utility tokens to safelist
 * @returns Complete CSS string ready to serve from /styles/global.css
 */
export async function compileUnoCSS(
  htmlContent: string,
  customFontsCSS: string,
  customClassesCSS: string,
  darkMode: "media" | "class" | "disabled",
  unocssConfig?: UserUnoConfigOverrides,
  resolvedTheme?: ResolvedUserTheme,
  utilityClasses: readonly string[] = [],
): Promise<string> {
  let utilityCss = "";

  try {
    // Import the Worker-safe compiler core directly. The broad `unocss`
    // package also exports Node-oriented transformers; bundling that entry
    // pulls css-tree's createRequire()-based JSON loader into workerd.
    const { createGenerator } = await import("@unocss/core");
    const parsedOverrides = parseUserUnoConfigOverrides(unocssConfig);
    const userConfig = createUserUnoConfig(
      parsedOverrides,
      darkMode,
      resolvedTheme,
    );

    const generator = await createGenerator(
      userConfig as unknown as UserConfig,
    );

    const extractedResult = await generator.generate(htmlContent);
    const exactTokens = new Set(extractedResult.matched);
    for (const className of utilityClasses) {
      if (className) exactTokens.add(className);
    }

    const result =
      exactTokens.size === extractedResult.matched.size
        ? extractedResult
        : await generator.generate(exactTokens);
    utilityCss = result.css.trim();

    log("info", "UnoCSS utility generation complete", {
      inputSize: `${(htmlContent.length / 1024).toFixed(1)}KB`,
      exactClassCount: utilityClasses.length,
      outputSize: `${(utilityCss.length / 1024).toFixed(1)}KB`,
    });
  } catch (error) {
    log("error", "UnoCSS generation failed, falling back to custom CSS only", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const sections: string[] = [];
  if (utilityCss) sections.push(utilityCss);
  if (customFontsCSS.trim())
    sections.push(`/* Custom Fonts */\n${customFontsCSS}`);
  if (customClassesCSS.trim())
    sections.push(`/* Custom Classes */\n${customClassesCSS}`);

  return sections.join("\n\n");
}

/**
 * Generate a hash for CSS content (for cache busting)
 * @param css - CSS content to hash
 * @returns SHA-256 hash of the CSS
 */
export function generateCSSHash(css: string): string {
  return createHash("sha256").update(css).digest("hex").slice(0, 12);
}
