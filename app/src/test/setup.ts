import '@testing-library/jest-dom/vitest';

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
