/**
 * Utility helpers for interacting with the Stage iframe and block tree.
 */

import type { Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { NodeInfo, NodeLocationInfo } from "../types";

const TEXT_CONTENT_ELEMENTS = new Set([
  "SPAN",
  "P",
  "A",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);

export function useCanvasUtils(iframeRef: Ref<HTMLIFrameElement | null>) {
  /** Gets the iframe's window object. */
  const getWindow = (): Window => iframeRef.value?.contentWindow as Window;

  /** Gets the iframe's document object. */
  const getDoc = (): Document => iframeRef.value?.contentDocument as Document;

  /** Gets the iframe's body element. */
  const getBody = (): HTMLBodyElement => getDoc()?.body as HTMLBodyElement;

  /** Gets the iframe's head element. */
  const getHead = (): HTMLHeadElement => getDoc()?.head as HTMLHeadElement;

  /**
   * Recursively finds a node and its parent in the block tree.
   */
  const findNodeWithParent = (
    blocks: BuilderNode[],
    id: string,
    parent: BuilderNode | null = null,
  ): NodeInfo | null => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].id === id) {
        return { node: blocks[i], parentId: parent?.id ?? null, index: i };
      }
      if (blocks[i].children) {
        const found = findNodeWithParent(blocks[i].children, id, blocks[i]);
        if (found) return found;
      }
    }
    return null;
  };

  const findNodeLocation = (
    blocks: BuilderNode[],
    id: string,
    parent: BuilderNode | null = null,
  ): NodeLocationInfo | null => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].id === id) {
        return { nodeId: blocks[i].id, parentId: parent?.id ?? null, index: i };
      }
      if (blocks[i].children) {
        const found = findNodeLocation(blocks[i].children, id, blocks[i]);
        if (found) return found;
      }
    }
    return null;
  };

  /** Recursively finds a node by ID in the block tree. */
  const findNode = (blocks: BuilderNode[], id: string): BuilderNode | null => {
    for (const block of blocks) {
      if (block.id === id) return block;
      if (block.children) {
        const found = findNode(block.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  /** Checks if an element represents text content. */
  const isTextContent = (element: Element): boolean => {
    return (
      element.nodeType === Node.TEXT_NODE ||
      TEXT_CONTENT_ELEMENTS.has(element.tagName)
    );
  };

  return {
    getWindow,
    getDoc,
    getBody,
    getHead,
    findNodeLocation,
    findNodeWithParent,
    findNode,
    isTextContent,
  };
}
