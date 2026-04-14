import { useEffect, useState } from 'react';

function readStoredValue<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;

  try {
    const rawValue = window.sessionStorage.getItem(key);
    if (!rawValue) return initialValue;
    return JSON.parse(rawValue) as T;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage write failures
    }
  }, [key, value]);

  function clearStoredValue() {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore storage remove failures
    }
  }

  return [value, setValue, clearStoredValue] as const;
}
