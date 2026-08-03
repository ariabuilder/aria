import type { RenderDocumentV1, UnhashedRenderDocumentV1 } from "./contract";
import { hashCanonicalJson } from "./hash";
import { stableSerializeJson } from "./stableJson";

export function serializeRenderDocumentHtml(
  document: RenderDocumentV1,
): string {
  return document.html;
}

export function getUnhashedRenderDocument(
  document: RenderDocumentV1,
): UnhashedRenderDocumentV1 {
  const { documentHash: _documentHash, ...unhashed } = document;
  return unhashed;
}

export function stableSerializeRenderDocument(
  document: RenderDocumentV1,
): string {
  return stableSerializeJson(getUnhashedRenderDocument(document));
}

export async function hasValidRenderDocumentHash(
  document: RenderDocumentV1,
): Promise<boolean> {
  return (
    (await hashCanonicalJson(getUnhashedRenderDocument(document))) ===
    document.documentHash
  );
}
