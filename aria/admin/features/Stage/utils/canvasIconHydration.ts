import {
  getCanonicalIconIdFromValue,
  getIconClassFromValue,
} from "../../../../lib/icons/reference";
import { getIconMediaUrl } from "../../../../lib/icons/mediaIcon";
import { resolveOneIconSvgData } from "../../../lib/iconDataClient";

async function resolveIconSvg(
  canonicalId: string,
): Promise<{ svg: string; viewBox: string; snapshotVersion: string } | null> {
  return resolveOneIconSvgData(canonicalId);
}

function applySvgToIconHost(host: HTMLElement, svgMarkup: string): void {
  const template = host.ownerDocument.createElement("template");
  template.innerHTML = svgMarkup.trim();

  const first = template.content.firstElementChild;
  if (!first || first.namespaceURI !== "http://www.w3.org/2000/svg") {
    host.textContent = "★";
    return;
  }

  first.setAttribute("width", "100%");
  first.setAttribute("height", "100%");
  first.setAttribute("aria-hidden", "true");
  (first as HTMLElement).style.display = "block";
  (first as HTMLElement).style.setProperty("color", "inherit", "important");

  host.style.setProperty("background", "none", "important");
  host.style.setProperty("background-color", "transparent", "important");
  host.style.setProperty("mask", "none", "important");
  host.style.setProperty("-webkit-mask", "none", "important");

  host.replaceChildren(first);
}

function resolveLegacyIconName(value: unknown): string {
  const className = getIconClassFromValue(value);
  if (!className) {
    return "";
  }

  return className.startsWith("i-") ? className.slice(2) : className;
}

function applyIconHostBaseProps(params: {
  host: HTMLElement;
  iconValue: unknown;
  classNameValue: unknown;
  ariaLabelValue: unknown;
}): { canonicalId: string | null; iconClass: string; iconName: string } {
  const iconClass = getIconClassFromValue(params.iconValue);
  const iconName = resolveLegacyIconName(params.iconValue);
  const canonicalId = getCanonicalIconIdFromValue(params.iconValue);

  const extraClass =
    typeof params.classNameValue === "string"
      ? params.classNameValue.trim()
      : "";

  params.host.className = [iconClass, extraClass].filter(Boolean).join(" ");
  params.host.setAttribute("data-aria-icon-host", "1");
  params.host.setAttribute("role", "img");
  params.host.style.display = "inline-flex";
  params.host.style.alignItems = "center";
  params.host.style.justifyContent = "center";
  params.host.style.lineHeight = "1";
  params.host.style.flexShrink = "0";
  params.host.style.fontStyle = "normal";

  const ariaLabel =
    typeof params.ariaLabelValue === "string"
      ? params.ariaLabelValue.trim()
      : "";

  if (ariaLabel) {
    params.host.setAttribute("aria-label", ariaLabel);
  } else {
    params.host.removeAttribute("aria-label");
  }

  return { canonicalId, iconClass, iconName };
}

export async function hydrateIconHost(params: {
  host: HTMLElement;
  iconValue: unknown;
  classNameValue: unknown;
  ariaLabelValue: unknown;
  fallbackText?: unknown;
}): Promise<void> {
  const { host, canonicalId, iconClass, iconName } = {
    host: params.host,
    ...applyIconHostBaseProps({
      host: params.host,
      iconValue: params.iconValue,
      classNameValue: params.classNameValue,
      ariaLabelValue: params.ariaLabelValue,
    }),
  };

  if (canonicalId) {
    host.setAttribute("data-icon-id", canonicalId);
    const resolved = await resolveIconSvg(canonicalId);
    if (resolved && host.getAttribute("data-icon-id") === canonicalId) {
      applySvgToIconHost(host, resolved.svg);
      return;
    }
    if (host.getAttribute("data-icon-id") !== canonicalId) {
      return;
    }
  }

  const mediaUrl = getIconMediaUrl(params.iconValue);
  if (mediaUrl) {
    const image = host.ownerDocument.createElement("img");
    image.src = mediaUrl;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "contain";
    image.style.display = "block";
    host.replaceChildren(image);
    return;
  }

  if (iconName) {
    const iconEl = host.ownerDocument.createElement("i");
    iconEl.className = [iconClass, host.className].filter(Boolean).join(" ");
    iconEl.style.setProperty("color", "inherit", "important");

    const ariaLabel = host.getAttribute("aria-label");
    if (ariaLabel) {
      iconEl.setAttribute("aria-label", ariaLabel);
    }

    host.replaceChildren(iconEl);
    return;
  }

  host.textContent = String(params.fallbackText || "★");
}
