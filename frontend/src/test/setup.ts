import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom lacks these browser APIs; Radix and the theme provider rely on them.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(window, "ResizeObserver", { writable: true, value: ResizeObserverStub });

// The router's scroll restoration scrolls the window after each navigation.
Object.defineProperty(window, "scrollTo", { writable: true, value: () => undefined });

Element.prototype.scrollIntoView = () => undefined;
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => undefined;
