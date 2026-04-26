import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface UnsavedChangesContextValue {
  /** Currently any sub-component reporting unsaved changes? */
  isDirty: boolean;
  /** Sub-components mark themselves dirty/clean via this setter. */
  setDirty: (dirty: boolean) => void;
  /**
   * Returns true if user wants to discard their changes (or there are none),
   * false if they want to stay. Use before destructive navigation.
   */
  confirmDiscard: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

interface UnsavedChangesProviderProps {
  children: ReactNode;
  /** Confirm-message shown to user. */
  message?: string;
}

const DEFAULT_MESSAGE = 'Sie haben ungespeicherte Änderungen. Möchten Sie diese verwerfen?';

/**
 * UnsavedChangesProvider — Lightweight registry that lets any descendant
 * mark itself "dirty" (e.g. a form with unsaved edits) and any ancestor
 * gate destructive navigation (tab switch, route change) on a confirm.
 *
 * Pairs with `useUnsavedChangesGuard()` which sub-components call to
 * report dirty state.
 *
 * The browser-level beforeunload handler is also installed so closing the
 * tab / refreshing prompts the native browser confirm.
 */
export function UnsavedChangesProvider({
  children,
  message = DEFAULT_MESSAGE,
}: UnsavedChangesProviderProps) {
  const [dirtyCount, setDirtyCount] = useState(0);
  const isDirty = dirtyCount > 0;

  // Single shared toggle: each child increments/decrements its own contribution
  const setDirty = useCallback((dirty: boolean) => {
    setDirtyCount(prev => (dirty ? prev + 1 : Math.max(0, prev - 1)));
  }, []);

  const confirmDiscard = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm(message);
  }, [isDirty, message]);

  // Browser-level: prevent tab close/refresh while dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most browsers ignore the message string and show their own
      e.returnValue = message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setDirty, confirmDiscard }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

/**
 * useUnsavedChangesGuard — Sub-component side: report dirty/clean state.
 * The provider tracks how many sub-components are dirty and exposes
 * `isDirty` + `confirmDiscard` to ancestors.
 *
 * Usage:
 *   useUnsavedChangesGuard(formIsDirty);
 *
 * No-op outside an UnsavedChangesProvider so it's safe to use anywhere.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const ctx = useContext(UnsavedChangesContext);
  useEffect(() => {
    if (!ctx) return;
    if (dirty) {
      ctx.setDirty(true);
      return () => ctx.setDirty(false);
    }
  }, [ctx, dirty]);
}

/**
 * useUnsavedChangesGate — Ancestor side: get a confirmDiscard function to
 * gate destructive navigation. Returns a no-op confirm (always true) if
 * not under an UnsavedChangesProvider.
 */
export function useUnsavedChangesGate(): () => boolean {
  const ctx = useContext(UnsavedChangesContext);
  return ctx?.confirmDiscard ?? (() => true);
}
