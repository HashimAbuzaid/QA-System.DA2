import { useEffect, useState } from 'react';

function readStoredValue<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return initialValue;
    return JSON.parse(rawValue) as T;
  } catch {
    return initialValue;
  } 
    @@ -16,10 +57,14 @@ export function usePersistentState<T>(key: string, initialValue: T) {
  
}
export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage write failures
    }
    @@ -29,9 +74,15 @@ export function usePersistentState<T>(key: string, initialValue: T) {
  
  }, [key, value]);
  function clearStoredValue() {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage remove failures
    }
  }
  return [value, setValue, clearStoredValue] as const;
}
