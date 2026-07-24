import { mergeAttributes, Node } from "@tiptap/core";
import { z } from "zod";

export const STRUCTURED_IMAGE_NODE_NAME = "ariaStructuredImage";
export const STRUCTURED_EMBED_NODE_NAME = "ariaStructuredEmbed";

export const StructuredImageNodeAttrsSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    alt: z.string().optional().default(""),
    caption: z.string().optional().default(""),
  })
  .strict();

export const StructuredEmbedNodeAttrsSchema = z
  .object({
    provider: z.string().trim().min(1),
    url: z.string().trim().min(1),
  })
  .strict();

export type StructuredImageNodeAttrs = z.infer<
  typeof StructuredImageNodeAttrsSchema
>;
export type StructuredEmbedNodeAttrs = z.infer<
  typeof StructuredEmbedNodeAttrsSchema
>;

export function inferEmbedProvider(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      return "youtube";
    }
    if (hostname.includes("vimeo.com")) {
      return "vimeo";
    }
    if (hostname.includes("soundcloud.com")) {
      return "soundcloud";
    }
    if (hostname.includes("spotify.com")) {
      return "spotify";
    }
    if (hostname.includes("codepen.io")) {
      return "codepen";
    }
    return hostname || "embed";
  } catch {
    return "embed";
  }
}

export const AriaStructuredImage = Node.create({
  name: STRUCTURED_IMAGE_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-media-id") ?? "",
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-alt") ?? "",
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-aria-structured-image]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = StructuredImageNodeAttrsSchema.safeParse({
      mediaId: HTMLAttributes.mediaId,
      alt: HTMLAttributes.alt,
      caption: HTMLAttributes.caption,
    });
    const parsed = attrs.success
      ? attrs.data
      : { mediaId: "", alt: "", caption: "" };

    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-aria-structured-image": "true",
        "data-media-id": parsed.mediaId,
        "data-alt": parsed.alt,
        "data-caption": parsed.caption,
      }),
    ];
  },
});

export const AriaStructuredEmbed = Node.create({
  name: STRUCTURED_EMBED_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: "embed",
        parseHTML: (element) => element.getAttribute("data-provider") ?? "embed",
      },
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-url") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-aria-structured-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = StructuredEmbedNodeAttrsSchema.safeParse({
      provider: HTMLAttributes.provider,
      url: HTMLAttributes.url,
    });
    const parsed = attrs.success
      ? attrs.data
      : { provider: "embed", url: "" };

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-aria-structured-embed": "true",
        "data-provider": parsed.provider,
        "data-url": parsed.url,
      }),
    ];
  },
});
