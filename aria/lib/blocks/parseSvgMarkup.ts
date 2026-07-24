import { z } from "zod";

const SVG_MIME_TYPE = "image/svg+xml";

export const SvgNodePropsSchema = z
  .object({
    viewBox: z.string().trim().min(1),
    width: z.string().trim().min(1),
    height: z.string().trim().min(1),
    fill: z.string().trim().min(1),
    stroke: z.string().trim().min(1),
    "stroke-width": z.string().trim().min(1),
    "stroke-linecap": z.string().trim().min(1),
    "stroke-linejoin": z.string().trim().min(1),
    content: z.string(),
  })
  .strict();

export type SvgNodeProps = z.infer<typeof SvgNodePropsSchema>;

function stripUnsafeSvg(svgElement: Element): void {
  svgElement.querySelectorAll("script").forEach((scriptElement) => {
    scriptElement.remove();
  });

  const elements = [
    svgElement,
    ...Array.from(svgElement.querySelectorAll("*")),
  ];

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (attribute.name === "href" || attribute.name === "xlink:href") &&
        /^javascript:/i.test(attribute.value.trim())
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

export function parseSvgMarkup(markup: string): SvgNodeProps | null {
  const trimmed = markup.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new DOMParser().parseFromString(trimmed, SVG_MIME_TYPE);
  const parserError = parsed.querySelector("parsererror");
  const svgElement = parsed.querySelector("svg");

  if (parserError || !svgElement) {
    return null;
  }

  stripUnsafeSvg(svgElement);

  const candidate = {
    viewBox: svgElement.getAttribute("viewBox")?.trim() || "0 0 24 24",
    width: svgElement.getAttribute("width")?.trim() || "24",
    height: svgElement.getAttribute("height")?.trim() || "24",
    fill: svgElement.getAttribute("fill")?.trim() || "none",
    stroke: svgElement.getAttribute("stroke")?.trim() || "currentColor",
    "stroke-width": svgElement.getAttribute("stroke-width")?.trim() || "1.5",
    "stroke-linecap":
      svgElement.getAttribute("stroke-linecap")?.trim() || "round",
    "stroke-linejoin":
      svgElement.getAttribute("stroke-linejoin")?.trim() || "round",
    content: svgElement.innerHTML.trim(),
  };

  const validated = SvgNodePropsSchema.safeParse(candidate);
  return validated.success ? validated.data : null;
}

export function buildSvgMarkupFromIconData(params: {
  svg: string;
  viewBox: string;
}): string | null {
  const trimmedSvg = params.svg.trim();
  if (!trimmedSvg) {
    return null;
  }

  if (trimmedSvg.includes("<svg")) {
    return trimmedSvg;
  }

  const viewBox = params.viewBox.trim() || "0 0 24 24";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${trimmedSvg}</svg>`;
}
