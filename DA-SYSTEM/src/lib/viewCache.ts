const STORAGE_PREFIX = 'detroit-axle-view-cache:';

type CacheEnvelope<T> = {
  value: T;
  expiresAt: number;
};

type CacheOptions = {
  ttlMs?: number;
  force?: boolean;
  persist?: boolean;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

function getStorageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStoredEnvelope<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.sessionStorage.getItem(getStorageKey(key));
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number') return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredEnvelope<T>(key: string, envelope: CacheEnvelope<T>) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(getStorageKey(key), JSON.stringify(envelope));
  } catch {
    // ignore storage failures
  }
}

function removeStoredEnvelope(key: string) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch {
    // ignore storage failures
  }
}

export function peekCachedValue<T>(key: string): T | null {
  const now = Date.now();
  const memoryValue = memoryCache.get(key) as CacheEnvelope<T> | undefined;

  if (memoryValue) {
    if (memoryValue.expiresAt > now) {
      return memoryValue.value;
    }

    memoryCache.delete(key);
  }

  const storedValue = readStoredEnvelope<T>(key);
  if (!storedValue) return null;

  if (storedValue.expiresAt <= now) {
    removeStoredEnvelope(key);
    return null;
  }

  memoryCache.set(key, storedValue as CacheEnvelope<unknown>);
  return storedValue.value;
}

export function setCachedValue<T>(
  key: string,
  value: T,
  ttlMs = 1000 * 60 * 3,
  persist = true
) {
  const envelope: CacheEnvelope<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  memoryCache.set(key, envelope as CacheEnvelope<unknown>);

  if (persist) {
    writeStoredEnvelope(key, envelope);
  }
}

export async function getCachedValue<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions
) {
  const ttlMs = options?.ttlMs ?? 1000 * 60 * 3;
  const force = options?.force ?? false;
  const persist = options?.persist ?? true;

  if (!force) {
    const cached = peekCachedValue<T>(key);
    if (cached !== null) {
      return cached;
    }
  }

  const existingRequest = pendingRequests.get(key);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const request = fetcher()
    .then((value) => {
      setCachedValue(key, value, ttlMs, persist);
      return value;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request as Promise<unknown>);
  return request;
}

export function clearCachedValue(key?: string) {
  if (key) {
    memoryCache.delete(key);
    pendingRequests.delete(key);
    removeStoredEnvelope(key);
    return;
  }

  memoryCache.clear();
  pendingRequests.clear();

  if (typeof window === 'undefined') return;

  try {
    const keysToDelete: string[] = [];

    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const storageKey = window.sessionStorage.key(index);
      if (storageKey && storageKey.startsWith(STORAGE_PREFIX)) {
        keysToDelete.push(storageKey);
      }
    }

    keysToDelete.forEach((storageKey) => {
      window.sessionStorage.removeItem(storageKey);
    });
  } catch {
    // ignore storage failures
  }
}
