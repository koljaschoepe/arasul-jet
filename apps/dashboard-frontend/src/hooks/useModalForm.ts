/**
 * useModalForm - Reusable hook for modal form state management
 *
 * Replaces the common pattern of:
 *   const [name, setName] = useState('');
 *   const [description, setDescription] = useState('');
 *   const [error, setError] = useState<string | null>(null);
 *   const [saving, setSaving] = useState(false);
 *   useEffect(() => { if (isOpen) { reset or populate fields; setError(null); } }, [isOpen, ...]);
 *   const handleSubmit = async (e) => { e.preventDefault(); setSaving(true); try { await fn(); } catch { setError(...); } finally { setSaving(false); } };
 *
 * Usage:
 *   const { values, setValue, error, saving, handleSubmit } = useModalForm(isOpen, {
 *     initialValues: { name: '', description: '' },
 *     onOpen: (item) => item ? { name: item.name, description: item.description } : undefined,
 *   });
 *
 *   <form onSubmit={handleSubmit(async () => { await api.post(...); })}>
 *     <input value={values.name} onChange={e => setValue('name', e.target.value)} />
 *   </form>
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseModalFormOptions<T> {
  initialValues: T;
  /** Called when modal opens. Return form values to populate (e.g. for edit mode), or undefined to use initialValues. */
  onOpen?: () => T | undefined;
}

interface UseModalFormReturn<T> {
  values: T;
  setValues: React.Dispatch<React.SetStateAction<T>>;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  saving: boolean;
  handleSubmit: (submitFn: () => Promise<void>) => (e: React.FormEvent) => void;
  reset: () => void;
}

export function useModalForm<T extends Record<string, any>>(
  isOpen: boolean,
  options: UseModalFormOptions<T>
): UseModalFormReturn<T> {
  const { initialValues, onOpen } = options;

  const [values, setValues] = useState<T>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep refs to avoid stale closures and unnecessary effect re-runs
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const openValues = onOpenRef.current?.();
      setValues(openValues ?? initialValuesRef.current);
      setError(null);
    }
  }, [isOpen]);

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setValues(initialValuesRef.current);
    setError(null);
  }, []);

  const handleSubmit = useCallback((submitFn: () => Promise<void>) => {
    return async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        await submitFn();
      } catch (err: any) {
        setError(err.data?.error || err.message || 'Fehler');
      } finally {
        setSaving(false);
      }
    };
  }, []);

  return { values, setValues, setValue, error, setError, saving, handleSubmit, reset };
}

export default useModalForm;
