import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'arasul:chunk-reload-attempted';

function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || '';
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    /Loading chunk \d+ failed/i.test(message)
  );
}

/**
 * Wraps `React.lazy` with a one-shot hard-reload on stale chunk errors.
 * After a deploy, an open tab still references old chunk hashes that
 * no longer exist on disk — reloading fetches the fresh index.html
 * (served with no-cache) and the new chunk graph.
 */
// Matches React.lazy's signature (ComponentType<any>) so components with
// typed props (e.g. Settings) flow through without losing their prop types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      if (isStaleChunkError(error) && !window.sessionStorage.getItem(RELOAD_FLAG)) {
        window.sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
