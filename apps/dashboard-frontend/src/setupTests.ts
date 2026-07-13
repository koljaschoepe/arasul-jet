/**
 * Vitest Setup File for Arasul Dashboard Frontend
 * This file is automatically loaded before each test file
 */

// Import jest-dom matchers for better assertions
import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for JSDOM.
// Wichtig: 'node:util' erzwingen — das nackte 'util' löst im Vite-Resolver auf
// das gleichnamige npm-Paket auf, das KEINEN TextEncoder exportiert; der
// Polyfill setzte dann undefined und jeder react-router-v7-Import crashte.
import { TextEncoder, TextDecoder } from 'node:util';
(globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
(globalThis as Record<string, unknown>).TextDecoder = TextDecoder;

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string): string | null {
    return this.store[key] || null;
  },
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  },
  removeItem(key: string): void {
    delete this.store[key];
  },
  clear(): void {
    this.store = {};
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.matchMedia
window.matchMedia =
  window.matchMedia ||
  function (query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  };

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

// Mock Element.scrollIntoView (not supported in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null = null;
  // Echte close-Events tragen immer ein Event-Objekt (u. a. .code) — der Mock
  // reicht eines mit, damit Handler-Code wie `event.code === 1000` nicht nur
  // per Short-Circuit zufällig funktioniert.
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = 1;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  send(_data: string): void {}
  close(): void {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, wasClean: true });
  }
}
window.WebSocket = MockWebSocket as unknown as typeof WebSocket;

// Mock fetch
(globalThis as Record<string, unknown>).fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Suppress noisy React/testing warnings in test output
const originalError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && (args[0] as string).includes('Warning: An update to')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clear localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
