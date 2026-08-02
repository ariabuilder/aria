import type {
  BrowserParityRuntime,
  BrowserParityViewport,
  EditorDomExceptionRegistry,
} from "../../lib/rendering/canonical";

export type BrowserSnapshotCollectorInput = Readonly<{
  runtime: BrowserParityRuntime;
  surface: "public" | "stage";
  fixtureId: string;
  viewport: BrowserParityViewport;
  exceptions: EditorDomExceptionRegistry;
  parityIds: readonly string[];
}>;

/**
 * This function is intentionally self-contained because Playwright serializes
 * it into the public page or Stage iframe as a cross-realm boundary.
 */
export async function collectBrowserSurfaceSnapshot(
  input: BrowserSnapshotCollectorInput,
): Promise<unknown> {
  const computedStyleProperties = [
    "display",
    "position",
    "left",
    "top",
    "right",
    "bottom",
    "box-sizing",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "background-color",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "object-fit",
    "object-position",
    "transform",
    "opacity",
    "overflow",
    "flex-direction",
    "flex-wrap",
    "justify-content",
    "align-items",
    "gap",
    "grid-template-columns",
    "grid-template-rows",
  ] as const;

  const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");

  const sha256 = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return bytesToHex(new Uint8Array(digest));
  };

  const canonicalNode = (node: Node): unknown => {
    if (node.nodeType === Node.TEXT_NODE) {
      return { kind: "text", value: node.textContent ?? "" };
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    return {
      kind: "element",
      namespace: element.namespaceURI ?? "",
      tagName: element.tagName.toLowerCase(),
      attributes: Array.from(element.attributes)
        .map(({ name, value }) => [name, value] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
      children: Array.from(element.childNodes)
        .map((child) => canonicalNode(child))
        .filter((child) => child !== null),
    };
  };

  const normalizeAuthoredClone = (root: Element): Element => {
    const clone = root.cloneNode(true);
    if (!(clone instanceof Element)) {
      throw new Error("Parity authored root did not clone to an Element");
    }

    for (const attribute of input.exceptions.removeSubtreeAttributes) {
      clone
        .querySelectorAll(`[${CSS.escape(attribute)}]`)
        .forEach((element) => element.remove());
    }
    for (const element of [
      clone,
      ...Array.from(clone.querySelectorAll("*")),
    ]) {
      for (const attribute of input.exceptions.removeAttributes) {
        element.removeAttribute(attribute);
      }
      for (const className of input.exceptions.removeClasses) {
        element.classList.remove(className);
      }
      if (element.classList.length === 0) {
        element.removeAttribute("class");
      }
    }
    return clone;
  };

  const collectNativeState = (element: Element) => {
    const tagName = element.tagName.toLowerCase();
    const canDisable = [
      "button",
      "fieldset",
      "input",
      "optgroup",
      "option",
      "select",
      "textarea",
    ].includes(tagName);
    const canCheck = tagName === "input";
    const canSelect = tagName === "option";
    const canOpen = tagName === "details" || tagName === "dialog";
    const ariaExpanded = element.getAttribute("aria-expanded");

    return {
      disabled: canDisable ? element.matches(":disabled") : null,
      checked: canCheck ? element.matches(":checked") : null,
      selected: canSelect ? element.matches(":checked") : null,
      open: canOpen ? element.hasAttribute("open") : null,
      ariaExpanded:
        ariaExpanded === "true" || ariaExpanded === "false"
          ? ariaExpanded
          : null,
    };
  };

  const rootSelector =
    input.surface === "public"
      ? "#parity-public-host"
      : "[data-aria-stage-content-root]";
  const root = document.querySelector(rootSelector);
  if (!root) {
    throw new Error(`Missing parity root: ${rootSelector}`);
  }

  const normalizedRoot = normalizeAuthoredClone(root);
  const canonicalChildren = Array.from(normalizedRoot.childNodes)
    .map((child) => canonicalNode(child))
    .filter((child) => child !== null);
  const authoredDom = JSON.stringify(canonicalChildren);
  const inlineStyleSource = input.parityIds
    .map((parityId) => {
      const element = root.querySelector(
        `[data-parity-id="${CSS.escape(parityId)}"]`,
      );
      return `${parityId}:${element?.getAttribute("style") ?? ""}`;
    })
    .join("\n");

  const nodes = input.parityIds.map((parityId) => {
    const element = root.querySelector(
      `[data-parity-id="${CSS.escape(parityId)}"]`,
    );
    if (!element) {
      throw new Error(`Missing parity node: ${parityId}`);
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const computedStyles = Object.fromEntries(
      computedStyleProperties.map((property) => [
        property,
        style.getPropertyValue(property),
      ]),
    );

    return {
      parityId,
      namespace: element.namespaceURI ?? "",
      tagName: element.tagName.toLowerCase(),
      attributes: Object.fromEntries(
        Array.from(element.attributes)
          .filter(
            ({ name }) => !input.exceptions.removeAttributes.includes(name),
          )
          .map(({ name, value }) => [name, value]),
      ),
      classes: Array.from(element.classList).filter(
        (className) => !input.exceptions.removeClasses.includes(className),
      ),
      text: element.textContent ?? "",
      computedStyles,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      nativeState: collectNativeState(element),
    };
  });

  return {
    contractVersion: 1,
    runtime: input.runtime,
    surface: input.surface,
    fixtureId: input.fixtureId,
    viewport: input.viewport,
    authoredDom,
    authoredDomHash: await sha256(authoredDom),
    authoredInlineStyleHash: await sha256(inlineStyleSource),
    nodes,
  };
}
