// ============================================================
// Rush Wall — CrazyGames SDK Integration
// ============================================================

/**
 * Check if CrazyGames SDK is available.
 */
function getSDK(): any | null {
  if (typeof window !== 'undefined' && (window as any).CrazyGames?.SDK) {
    return (window as any).CrazyGames.SDK;
  }
  return null;
}

/**
 * Initialize the CrazyGames SDK.
 * Should be called during game loading.
 */
export async function initSDK(): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk) {
    console.log('[CrazyGames] SDK not available (local development mode)');
    return false;
  }

  try {
    await sdk.init();
    console.log('[CrazyGames] SDK initialized successfully');
    return true;
  } catch (e) {
    console.warn('[CrazyGames] SDK init failed:', e);
    return false;
  }
}

// ============================================================
// Data Module — Save/Load Player Progress
// ============================================================

/**
 * Save data to CrazyGames Data Module (falls back to localStorage).
 */
export function saveData(key: string, value: string): void {
  const sdk = getSDK();
  if (sdk?.data) {
    try {
      sdk.data.setItem(key, value);
      return;
    } catch (e) {
      console.warn('[CrazyGames] Data save failed, falling back to localStorage:', e);
    }
  }
  // Fallback to localStorage
  try {
    localStorage.setItem(`rushwall_${key}`, value);
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

/**
 * Load data from CrazyGames Data Module (falls back to localStorage).
 */
export function loadData(key: string): string | null {
  const sdk = getSDK();
  if (sdk?.data) {
    try {
      return sdk.data.getItem(key);
    } catch (e) {
      console.warn('[CrazyGames] Data load failed, falling back to localStorage:', e);
    }
  }
  // Fallback
  try {
    return localStorage.getItem(`rushwall_${key}`);
  } catch (e) {
    console.warn('localStorage load failed:', e);
    return null;
  }
}

/**
 * Remove data.
 */
export function removeData(key: string): void {
  const sdk = getSDK();
  if (sdk?.data) {
    try {
      sdk.data.removeItem(key);
      return;
    } catch (e) {
      console.warn('[CrazyGames] Data remove failed:', e);
    }
  }
  try {
    localStorage.removeItem(`rushwall_${key}`);
  } catch (e) {
    console.warn('localStorage remove failed:', e);
  }
}

// ============================================================
// Game Events — Lifecycle
// ============================================================

/**
 * Signal that gameplay has started.
 */
export function gameplayStart(): void {
  const sdk = getSDK();
  if (sdk?.game) {
    try {
      sdk.game.gameplayStart();
    } catch (e) {
      console.warn('[CrazyGames] gameplayStart failed:', e);
    }
  }
}

/**
 * Signal that gameplay has stopped (menu, pause, game over).
 */
export function gameplayStop(): void {
  const sdk = getSDK();
  if (sdk?.game) {
    try {
      sdk.game.gameplayStop();
    } catch (e) {
      console.warn('[CrazyGames] gameplayStop failed:', e);
    }
  }
}

/**
 * Signal game loading started.
 */
export function loadingStart(): void {
  const sdk = getSDK();
  if (sdk?.game) {
    try {
      sdk.game.loadingStart();
    } catch (e) {
      console.warn('[CrazyGames] loadingStart failed:', e);
    }
  }
}

/**
 * Signal game loading finished.
 */
export function loadingStop(): void {
  const sdk = getSDK();
  if (sdk?.game) {
    try {
      sdk.game.loadingStop();
    } catch (e) {
      console.warn('[CrazyGames] loadingStop failed:', e);
    }
  }
}

/**
 * Trigger "happy time" effect (e.g., on win).
 */
export function happyTime(): void {
  const sdk = getSDK();
  if (sdk?.game) {
    try {
      sdk.game.happytime();
    } catch (e) {
      console.warn('[CrazyGames] happytime failed:', e);
    }
  }
}

// ============================================================
// Ad Breaks
// ============================================================

/**
 * Request a midgame ad break (between rounds, game over, etc.).
 * The SDK handles pacing automatically.
 */
export function requestAdBreak(): Promise<void> {
  return new Promise((resolve) => {
    const sdk = getSDK();
    if (!sdk?.ad) {
      resolve();
      return;
    }

    try {
      sdk.ad.requestAd('midgame', {
        adFinished: () => resolve(),
        adError: () => resolve(),
        adStarted: () => { /* pause game audio */ },
      });
    } catch (e) {
      console.warn('[CrazyGames] ad request failed:', e);
      resolve();
    }
  });
}

/**
 * Request a rewarded ad (for bonus coins, unlocks, etc.).
 * Returns true if ad was watched, false if skipped/failed.
 */
export function requestRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const sdk = getSDK();
    if (!sdk?.ad) {
      resolve(false);
      return;
    }

    try {
      sdk.ad.requestAd('rewarded', {
        adFinished: () => resolve(true),
        adError: () => resolve(false),
        adStarted: () => { /* pause game audio */ },
      });
    } catch (e) {
      console.warn('[CrazyGames] rewarded ad request failed:', e);
      resolve(false);
    }
  });
}
