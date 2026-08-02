/**
 * Vitest Test Setup
 *
 * Global test configuration and setup for Aria Composer tests
 */

import { beforeEach, afterEach, vi } from "vitest";

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock crypto.randomUUID for consistent IDs in tests
if (!globalThis.crypto) {
  globalThis.crypto = {} as Crypto;
}
if (!globalThis.crypto.randomUUID) {
  let counter = 0;
  globalThis.crypto.randomUUID = () => {
    counter++;
    const suffix = counter.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  };
}

global.IntersectionObserver = class MockIntersectionObserver
  implements IntersectionObserver
{
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  constructor() {}
  disconnect() {}
  observe(_target: Element) {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(_target: Element) {}
};

global.ResizeObserver = class MockResizeObserver implements ResizeObserver {
  constructor() {}
  disconnect() {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
};

// jsdom does not implement scrollIntoView; reka-ui Listbox and Command
// components call it when highlighting options.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}

// jsdom renders <path> as generic SVGElement (SVGPathElement / SVGGeometryElement
// are undefined). Components like AnimatedFingerprintIcon measure stroke length
// via getTotalLength on mount.
if (typeof SVGElement !== "undefined") {
  const svgPrototype = SVGElement.prototype as SVGGeometryElement & {
    getTotalLength?: () => number;
  };
  if (!svgPrototype.getTotalLength) {
    svgPrototype.getTotalLength = function getTotalLength() {
      return 100;
    };
  }
}

// Add TextEncoder/TextDecoder for esbuild compatibility
if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Add Blob.arrayBuffer() polyfill for Node.js environment
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function () {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
