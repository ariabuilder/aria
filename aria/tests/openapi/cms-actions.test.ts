import { describe, expect, it } from "vitest";

import {
  CMS_OPENAPI_OPERATIONS,
  CMS_ERROR_CODES,
} from "../../lib/openapi/cmsActions";
import { generateCmsOpenApiDocument } from "../../lib/openapi/generate";

describe("CMS OpenAPI generation", () => {
  it("includes every registered CMS Astro Action operation", () => {
    const document = generateCmsOpenApiDocument();
    const paths = Object.keys(document.paths as Record<string, unknown>);
    const operationIds = paths.map((path) => path.replace("/actions/", ""));

    for (const operation of CMS_OPENAPI_OPERATIONS) {
      expect(operationIds).toContain(operation.operationId);
    }
    expect(operationIds).toHaveLength(CMS_OPENAPI_OPERATIONS.length);
  });

  it("documents collections.create with a fields array", () => {
    const document = generateCmsOpenApiDocument();
    const schemas = document.components as {
      schemas: Record<string, Record<string, unknown>>;
    };
    const createInput = schemas.schemas.cms_collections_create_input;
    const properties = createInput.properties as Record<string, unknown>;
    const fields = properties.fields as Record<string, unknown>;

    expect(fields.type).toBe("array");
  });

  it("marks operations as astro-actions transport", () => {
    const document = generateCmsOpenApiDocument();
    const paths = document.paths as Record<
      string,
      { post: Record<string, unknown> }
    >;
    const first = paths["/actions/cms.collections.list"]?.post;
    expect(first?.["x-aria-transport"]).toBe("astro-actions");
  });

  it("includes shared CMS error codes", () => {
    const document = generateCmsOpenApiDocument();
    const schemas = document.components as {
      schemas: Record<string, { enum?: string[] }>;
    };
    expect(schemas.schemas.CmsErrorCode.enum).toEqual([...CMS_ERROR_CODES]);
  });

  it("matches the committed cms-actions.json snapshot", () => {
    const document = generateCmsOpenApiDocument();
    expect(document).toMatchSnapshot();
  });
});
