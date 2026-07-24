import { COMPONENT_PREVIEW_ROOT_ATTR } from "../schemas/componentPreview";

export const COMPONENT_ISOLATE_STYLES = `
  html.component-isolate-preview,
  html.component-isolate-preview body.component-isolate-preview {
    margin: 0;
    padding: 0;
    overflow: visible;
    background: transparent;
    pointer-events: none;
    user-select: none;
  }

  body.component-isolate-preview {
    display: block;
    box-sizing: border-box;
  }

  body.component-isolate-preview [${COMPONENT_PREVIEW_ROOT_ATTR}] {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  body.component-isolate-preview img {
    max-width: 100%;
    height: auto;
  }
`;

export function buildComponentIsolateBodyStyle(frameWidth: number): string {
  const width = Math.max(1, Math.round(frameWidth));
  return `width:${width}px;min-width:${width}px;max-width:${width}px;`;
}
