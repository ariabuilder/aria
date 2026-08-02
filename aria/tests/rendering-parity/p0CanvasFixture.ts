import { z } from "zod";

import { BuilderNodeSchema } from "../../lib/schemas/nodes";

const CanvasParityNodeListSchema = z.array(BuilderNodeSchema).min(1);

export const P0_CANVAS_PARITY_NODES = CanvasParityNodeListSchema.parse([
  {
    id: "parity-root",
    type: "Section",
    props: {
      "data-parity-id": "root",
    },
    styles: {
      boxSizing: { base: "content-box" },
      display: { base: "flex" },
      flexDirection: { base: "column" },
      gap: { base: "12px" },
      width: { base: "320px" },
      padding: { base: "16px" },
      backgroundColor: { base: "rgb(250 250 250)" },
    },
    children: [
      {
        id: "parity-button",
        type: "Button",
        props: {
          "data-parity-id": "disabled-button",
          label: "Disabled action",
          disabled: true,
        },
        styles: {
          boxSizing: { base: "content-box" },
          width: { base: "180px" },
          height: { base: "44px" },
          padding: { base: "0" },
          margin: { base: "0" },
          fontFamily: { base: "Arial, sans-serif" },
          fontSize: { base: "16px" },
          fontWeight: { base: "400" },
          lineHeight: { base: "normal" },
          color: { base: "rgb(255 255 255)" },
          backgroundColor: { base: "rgb(37 99 235)" },
          border: { base: "2px solid rgb(30 64 175)" },
          borderRadius: { base: "8px" },
        },
        children: [],
      },
      {
        id: "parity-media",
        type: "Image",
        props: {
          "data-parity-id": "authored-image",
          src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
          alt: "Parity fixture",
        },
        styles: {
          boxSizing: { base: "content-box" },
          display: { base: "inline-block" },
          width: { base: "96px" },
          height: { base: "64px" },
          objectFit: { base: "contain" },
          objectPosition: { base: "25% 75%" },
        },
        children: [],
      },
      {
        id: "parity-positioning",
        type: "Container",
        props: {
          "data-parity-id": "positioning-parent",
        },
        styles: {
          boxSizing: { base: "content-box" },
          position: { base: "relative" },
          width: { base: "280px" },
          height: { base: "120px" },
          border: { base: "1px solid rgb(148 163 184)" },
        },
        children: [
          {
            id: "parity-absolute",
            type: "Text",
            props: {
              "data-parity-id": "absolute-child",
              content: "Absolute",
            },
            styles: {
              boxSizing: { base: "content-box" },
              position: { base: "absolute" },
              left: { base: "17px" },
              top: { base: "23px" },
              width: { base: "90px" },
              margin: { base: "0" },
              fontFamily: { base: "Arial, sans-serif" },
              fontSize: { base: "16px" },
              fontWeight: { base: "400" },
              lineHeight: { base: "20px" },
            },
            children: [],
          },
        ],
      },
      {
        id: "parity-empty",
        type: "Container",
        props: {
          "data-parity-id": "empty-container",
        },
        styles: {
          boxSizing: { base: "content-box" },
        },
        children: [],
      },
    ],
  },
  {
    id: "parity-managed-utility-image",
    type: "Image",
    props: {
      "data-parity-id": "managed-utility-image",
      src: "/media/source/current/rendering-parity.svg",
      alt: "Managed utility fixture",
    },
    classNames: { base: ["h-8"] },
    styles: {},
    children: [],
    metadata: {
      responsiveImage: {
        sizes: "100vw",
        default: {
          url: "/media/source/current/rendering-parity.svg",
          reference: { mediaId: "rendering-parity", variantId: null },
          width: 727,
          height: 621,
          allowDerivatives: true,
        },
        sources: {},
      },
    },
  },
]);

export const P0_CANVAS_PARITY_NODE_IDS = [
  "root",
  "disabled-button",
  "authored-image",
  "positioning-parent",
  "absolute-child",
  "empty-container",
] as const;
