import { zodSchemaToJsonSchema } from "./zodToJsonSchema";
import {
  CMS_ERROR_CODES,
  CMS_OPENAPI_OPERATIONS,
  type CmsOpenApiOperation,
} from "./cmsActions";

function pathForOperation(operationId: string): string {
  return `/actions/${operationId}`;
}

function collectComponentSchemas(
  operations: readonly CmsOpenApiOperation[],
): Record<string, unknown> {
  const components: Record<string, unknown> = {
    CmsErrorCode: {
      type: "string",
      enum: [...CMS_ERROR_CODES],
    },
  };

  for (const operation of operations) {
    const inputName = `${operation.operationId.replaceAll(".", "_")}_input`;
    const outputName = `${operation.operationId.replaceAll(".", "_")}_output`;
    components[inputName] = zodSchemaToJsonSchema(operation.input);
    components[outputName] = zodSchemaToJsonSchema(operation.output);
  }

  return components;
}

export function generateCmsOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const operation of CMS_OPENAPI_OPERATIONS) {
    const inputRef = `#/components/schemas/${operation.operationId.replaceAll(".", "_")}_input`;
    const outputRef = `#/components/schemas/${operation.operationId.replaceAll(".", "_")}_output`;

    paths[pathForOperation(operation.operationId)] = {
      post: {
        operationId: operation.operationId,
        summary: operation.summary,
        tags: [operation.operationId.split(".")[1] ?? "cms"],
        "x-aria-transport": "astro-actions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: inputRef },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful Astro Action response",
            content: {
              "application/json": {
                schema: { $ref: outputRef },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Aria CMS Actions",
      version: "1.0.0",
      description:
        "Astro Actions contracts for Aria CMS. These paths document action payloads, not public HTTP routes.",
    },
    paths,
    components: {
      schemas: collectComponentSchemas(CMS_OPENAPI_OPERATIONS),
    },
  };
}

export function generateCmsOpenApiJson(): string {
  return `${JSON.stringify(generateCmsOpenApiDocument(), null, 2)}\n`;
}
