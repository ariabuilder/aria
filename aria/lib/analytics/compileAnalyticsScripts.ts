import type {
  AnalyticsProviderId,
  AnalyticsSettings,
} from "../storage/adapter";
import {
  ANALYTICS_PROVIDER_MAP,
  type AnalyticsProviderCspRequirements,
  type AnalyticsProviderDefinition,
} from "./providers";

export interface CompiledAnalyticsCspRequirements {
  scriptSrc: string[];
  connectSrc: string[];
  imgSrc: string[];
  frameSrc: string[];
  styleSrc: string[];
  fontSrc: string[];
  mediaSrc: string[];
  usesInlineScript: boolean;
  usesInlineStyle: boolean;
}

export interface CompiledAnalyticsScripts {
  headHTML: string;
  bodyStartHTML: string;
  bodyEndHTML: string;
  warnings: string[];
  csp: CompiledAnalyticsCspRequirements;
}

function createCompiledAnalyticsCsp(): CompiledAnalyticsCspRequirements {
  return {
    scriptSrc: [],
    connectSrc: [],
    imgSrc: [],
    frameSrc: [],
    styleSrc: [],
    fontSrc: [],
    mediaSrc: [],
    usesInlineScript: false,
    usesInlineStyle: false,
  };
}

function mergeUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

function mergeCspRequirements(
  target: CompiledAnalyticsCspRequirements,
  source: AnalyticsProviderCspRequirements,
): void {
  mergeUnique(target.scriptSrc, source.scriptSrc);
  mergeUnique(target.connectSrc, source.connectSrc);
  mergeUnique(target.imgSrc, source.imgSrc);
  mergeUnique(target.frameSrc, source.frameSrc);
  mergeUnique(target.styleSrc, source.styleSrc);
  mergeUnique(target.fontSrc, source.fontSrc);
  mergeUnique(target.mediaSrc, source.mediaSrc);
  target.usesInlineScript ||= source.usesInlineScript;
  target.usesInlineStyle ||= source.usesInlineStyle;
}

function joinScripts(items: string[]): string {
  return items.filter(Boolean).join("\n");
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidDomain(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
}

function isValidField(
  field: AnalyticsProviderDefinition["fields"][number],
  value: string,
): boolean {
  if (field.required && !value.trim()) {
    return false;
  }

  if (!value.trim()) {
    return true;
  }

  if (field.type === "url") {
    return isValidUrl(value);
  }

  if (field.key === "domain") {
    return isValidDomain(value);
  }

  if (field.pattern) {
    try {
      const pattern = new RegExp(field.pattern);
      return pattern.test(value);
    } catch {
      return false;
    }
  }

  return true;
}

function validateProviderFields(
  providerId: AnalyticsProviderId,
  fields: Record<string, string> | undefined,
): string[] {
  const provider = ANALYTICS_PROVIDER_MAP[providerId];
  if (!provider) {
    return [`Unknown analytics provider: ${providerId}`];
  }

  const warnings: string[] = [];
  const providerFields = fields ?? {};

  for (const field of provider.fields) {
    const value = providerFields[field.key] ?? "";
    const valid = isValidField(field, value);
    if (!valid) {
      warnings.push(
        `Provider "${provider.label}" has invalid field "${field.key}"`,
      );
    }
  }

  return warnings;
}

export function compileAnalyticsScripts(
  analytics: AnalyticsSettings | null | undefined,
): CompiledAnalyticsScripts {
  if (!analytics) {
    return {
      headHTML: "",
      bodyStartHTML: "",
      bodyEndHTML: "",
      warnings: [],
      csp: createCompiledAnalyticsCsp(),
    };
  }

  const warnings: string[] = [];
  const head: string[] = [];
  const bodyStart: string[] = [];
  const bodyEnd: string[] = [];
  const csp = createCompiledAnalyticsCsp();

  for (const providerId of analytics.activeProviders) {
    const provider = ANALYTICS_PROVIDER_MAP[providerId];
    if (!provider) {
      warnings.push(
        `Unknown analytics provider in activeProviders: ${providerId}`,
      );
      continue;
    }

    const fields = analytics.providers[providerId] ?? {};
    const fieldWarnings = validateProviderFields(providerId, fields);
    if (fieldWarnings.length > 0) {
      warnings.push(...fieldWarnings);
      continue;
    }

    const scripts = provider.buildScripts(fields);
    head.push(...scripts.head);
    bodyStart.push(...scripts.bodyStart);
    bodyEnd.push(...scripts.bodyEnd);
    mergeCspRequirements(csp, scripts.csp);
  }

  return {
    headHTML: joinScripts(head),
    bodyStartHTML: joinScripts(bodyStart),
    bodyEndHTML: joinScripts(bodyEnd),
    warnings,
    csp,
  };
}
