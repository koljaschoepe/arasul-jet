/**
 * copyText (Plan 017 Schritt 8) — robustes Kopieren mit execCommand-Fallback,
 * wenn navigator.clipboard fehlt (nicht vertrautes Zertifikat / kein secure
 * context).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../clipboard';

describe('copyText', () => {
  const origClipboard = navigator.clipboard;
  const origSecure = window.isSecureContext;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: origClipboard, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: origSecure, configurable: true });
    vi.restoreAllMocks();
  });

  it('nutzt navigator.clipboard im secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    expect(await copyText('https://example/oauth')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example/oauth');
  });

  it('fällt auf execCommand zurück, wenn clipboard fehlt', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    // jsdom kennt execCommand nicht — als Attrappe setzen.
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    expect(await copyText('code#state')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('gibt false zurück, wenn beide Wege scheitern', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => {
      throw new Error('nope');
    };

    expect(await copyText('x')).toBe(false);
  });
});
