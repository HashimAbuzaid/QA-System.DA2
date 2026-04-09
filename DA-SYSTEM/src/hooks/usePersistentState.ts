import { useEffect, useState } from 'react';

function getAvailableStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    if (window.localStorage) {
      const testKey = '__detroit_axle_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    }
  } catch {
    // ignore localStorage failures and fall back below
  }

  try {
    if (window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // ignore storage failures
  }

  return null;
}

function readStoredValue<T>(key: string, initialValue: T): T {
  const storage = getAvailableStorage();
  if (!storage) return initialValue;

  try {
    const localValue = window.localStorage?.getItem(key);
    if (localValue) {
      return JSON.parse(localValue) as T;
    }

    const sessionValue = window.sessionStorage?.getItem(key);
    if (sessionValue) {
      const parsed = JSON.parse(sessionValue) as T;
      try {
        window.localStorage?.setItem(key, sessionValue);
        window.sessionStorage?.removeItem(key);
      } catch {
        // ignore migration failures
      }
      return parsed;
    }

    return initialValue;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    const storage = getAvailableStorage();
    if (!storage) return;

    try {
      storage.setItem(key, JSON.stringify(value));
      if (storage === window.localStorage) {
        window.sessionStorage?.removeItem(key);
      }
    } catch {
      // ignore storage write failures
    }
  }, [key, value]);

  function clearStoredValue() {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage?.removeItem(key);
    } catch {
      // ignore localStorage remove failures
    }

    try {
      window.sessionStorage?.removeItem(key);
    } catch {
      // ignore sessionStorage remove failures
    }
  }

  return [value, setValue, clearStoredValue] as const;
}
