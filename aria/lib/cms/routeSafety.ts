import { z } from "zod";
import { AriaCollectionSchema, type AriaCollection } from "./schemas";
import {
  CmsPageReferenceSchema,
  CmsRouteWarningSchema,
  validateCollectionRouteUsage,
  type CmsRouteWarning,
} from "./pageUsage";

export const CmsRouteSafetyModeSchema = z.enum(["create", "update"]);
export type CmsRouteSafetyMode = z.infer<typeof CmsRouteSafetyModeSchema>;

export const CmsRouteSafetyInputSchema = z
  .object({
    collection: AriaCollectionSchema,
    collections: z.array(AriaCollectionSchema),
    pages: z.array(CmsPageReferenceSchema),
    mode: CmsRouteSafetyModeSchema,
  })
  .strict();
export type CmsRouteSafetyInput = z.infer<typeof CmsRouteSafetyInputSchema>;

export const CmsRouteSafetyResultSchema = z
  .object({
    blocking: z.array(CmsRouteWarningSchema),
    advisory: z.array(CmsRouteWarningSchema),
  })
  .strict();
export type CmsRouteSafetyResult = z.infer<typeof CmsRouteSafetyResultSchema>;

function advisoryWarning(input: {
  code: CmsRouteWarning["code"];
  message: string;
  relatedCollectionId?: string;
  relatedPageId?: string;
}): CmsRouteWarning {
  return CmsRouteWarningSchema.parse({
    ...input,
    severity: "advisory",
  });
}

function routeUsageSeverity(
  warning: CmsRouteWarning,
  collection: AriaCollection,
): CmsRouteWarning {
  if (
    warning.code === "invalid-url-pattern" ||
    warning.code === "missing-template-page" ||
    warning.code === "missing-list-page" ||
    warning.code === "shared-template-list-page" ||
    warning.code === "invalid-list-page-role" ||
    warning.code === "invalid-template-page-role" ||
    warning.code === "cross-collection-role-conflict"
  ) {
    return CmsRouteWarningSchema.parse({ ...warning, severity: "blocking" });
  }

  if (
    warning.code === "static-page-conflict" &&
    warning.relatedPageId === collection.templatePageId
  ) {
    return CmsRouteWarningSchema.parse({ ...warning, severity: "advisory" });
  }

  return CmsRouteWarningSchema.parse({ ...warning, severity: "advisory" });
}

export function validateCmsCollectionRouteSafety(
  input: CmsRouteSafetyInput,
): CmsRouteSafetyResult {
  const parsed = CmsRouteSafetyInputSchema.parse(input);
  const { collection, collections, pages } = parsed;
  const warnings: CmsRouteWarning[] = [
    ...validateCollectionRouteUsage({ collection, collections, pages }).map(
      (warning) => routeUsageSeverity(warning, collection),
    ),
  ];

  if (collection.urlPattern && !collection.templatePageId) {
    warnings.push(
      advisoryWarning({
        code: "route-pattern-without-template",
        message: "Choose a template page before saving a public URL pattern.",
      }),
    );
  }

  if (collection.templatePageId && !collection.urlPattern) {
    warnings.push(
      advisoryWarning({
        code: "template-without-url-pattern",
        message:
          "This collection has a template page but no public URL pattern yet.",
        relatedPageId: collection.templatePageId,
      }),
    );
  }

  const parsedWarnings = z.array(CmsRouteWarningSchema).parse(warnings);
  return CmsRouteSafetyResultSchema.parse({
    blocking: parsedWarnings.filter(
      (warning) => warning.severity === "blocking",
    ),
    advisory: parsedWarnings.filter(
      (warning) => warning.severity === "advisory",
    ),
  });
}

export function cmsRouteSafetyErrorMessage(
  result: CmsRouteSafetyResult,
): string | null {
  const parsed = CmsRouteSafetyResultSchema.parse(result);
  if (parsed.blocking.length === 0) return null;
  return parsed.blocking.map((warning) => warning.message).join(" ");
}
