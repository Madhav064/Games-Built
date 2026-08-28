export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export function getStorage(): StorageLike {
  // If we are running in the browser and the CrazyGames SDK Data Module is available,
  // we use it to seamlessly sync saves to the cloud and bypass iframe restrictions.
  if (typeof window !== "undefined" && (window as any).CrazyGames?.SDK?.data) {
    return (window as any).CrazyGames.SDK.data;
  }

  // Fallback to normal browser localStorage (for local development or if SDK fails to load).
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  // Fallback for SSR or if storage is completely blocked (e.g., highly restrictive browsers).
  let dummyStore: Record<string, string> = {};
  return {
    getItem: (key: string) => dummyStore[key] || null,
    setItem: (key: string, value: string) => { dummyStore[key] = value; },
    removeItem: (key: string) => { delete dummyStore[key]; },
    clear: () => { dummyStore = {}; }
  };
}
