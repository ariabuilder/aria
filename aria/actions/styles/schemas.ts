import { z } from "astro/zod";

const CustomClassSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  properties: z.record(z.string(), z.string()),
  css: z.string().optional(),
});

/**
 * CSS variable schema
 */
const CSSVariableSchema = z.object({
  name: z.string(),
  value: z.string(),
  category: z.string().optional(),
});

const TokensSchema = z.object({
  colors: z.record(z.string(), z.string()).optional(),
  gradients: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.string()).optional(),
  fonts: z.record(z.string(), z.string()).optional(),
  fontSizes: z.record(z.string(), z.string()).optional(),
  fontWeights: z.record(z.string(), z.string()).optional(),
  lineHeights: z.record(z.string(), z.string()).optional(),
  letterSpacing: z.record(z.string(), z.string()).optional(),
  borderWidths: z.record(z.string(), z.string()).optional(),
  borderColors: z.record(z.string(), z.string()).optional(),
  borderRadius: z.record(z.string(), z.string()).optional(),
  boxShadows: z.record(z.string(), z.string()).optional(),
  opacity: z.record(z.string(), z.string()).optional(),
  zIndex: z.record(z.string(), z.number()).optional(),
  transitions: z.record(z.string(), z.string()).optional(),
  breakpoints: z.record(z.string(), z.string()).optional(),
});

const CustomFontSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  source: z.enum(["google", "upload", "system"]),
  weights: z.array(z.number()).optional(),
  styles: z.array(z.enum(["normal", "italic"])).optional(),
  url: z.string().optional(),
  fallback: z.string().optional(),
});

export const StylesUpdateSchema = z.object({
  tokens: TokensSchema.optional(),
  customClasses: z.record(z.string(), CustomClassSchema).optional(),
  customFonts: z
    .object({
      fonts: z.array(CustomFontSchema),
      defaultFont: z.string().optional(),
    })
    .optional(),
  cssVariables: z.array(CSSVariableSchema).optional(),
});
