// ============================================================
// CrazyGames SDK v3 integration (adapted from the Wall Duel wrapper).
// Docs: https://docs.crazygames.com/sdk/intro/
// Every call is safe outside CrazyGames (local dev / other hosts).
// ============================================================

import { STORAGE_PREFIX } from '../config/brand';

interface CGSettings { muteAudio: boolean; disableChat: boolean }

interface CGAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    settings: CGSettings;
    addSettingsChangeListener(listener: (settings: CGSettings) => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: CGAdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  user?: { systemInfo?: { device?: { type?: 'desktop' | 'tablet' | 'mobile' }; locale?: string } };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

declare global {
  interface Window { CrazyGames?: { SDK?: CrazySDK } }
}

let sdk: CrazySDK | null = null;
let gameplayActive = false;
/** False when an adblocker is on or the platform has ads disabled (e.g. Basic Launch). */
let adsUsable = true;
const adListeners = new Set<(playing: boolean) => void>();

function active(): CrazySDK | null {
  return sdk && sdk.environment !== 'disabled' ? sdk : null;
}

function safely<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn(`[CrazyGames] ${label} failed`, e);
    return fallback;
  }
}

/** Initialise the SDK. Resolves true when running on CrazyGames (or its local test mode). */
export async function initSDK(): Promise<boolean> {
  const candidate = window.CrazyGames?.SDK;
  if (!candidate) return false;
  try {
    await candidate.init();
    sdk = candidate;
    if (candidate.environment !== 'disabled') {
      try {
        if (await candidate.ad.hasAdblock()) adsUsable = false;
      } catch { /* treat as no adblock */ }
    }
    return candidate.environment !== 'disabled';
  } catch (e) {
    console.warn('[CrazyGames] SDK init failed, continuing without it', e);
    return false;
  }
}

export const isOnCrazyGames = (): boolean => !!active();

export const loadingStart = () => safely('loadingStart', () => active()?.game.loadingStart(), undefined);
export const loadingStop = () => safely('loadingStop', () => active()?.game.loadingStop(), undefined);

export function gameplayStart(): void {
  if (gameplayActive) return;
  gameplayActive = true;
  safely('gameplayStart', () => active()?.game.gameplayStart(), undefined);
}

export function gameplayStop(): void {
  if (!gameplayActive) return;
  gameplayActive = false;
  safely('gameplayStop', () => active()?.game.gameplayStop(), undefined);
}

/** Site celebration: keep it for real milestones (planet destroyed, level up). */
export const happyTime = () => safely('happytime', () => active()?.game.happytime(), undefined);

export function getPlatformSettings(): CGSettings {
  return safely('settings', () => active()?.game.settings ?? { muteAudio: false, disableChat: false },
    { muteAudio: false, disableChat: false });
}

export function onPlatformSettingsChange(listener: (settings: CGSettings) => void): void {
  safely('addSettingsChangeListener', () => active()?.game.addSettingsChangeListener(listener), undefined);
}

/** Subscribe to ad playback (true while an ad is on screen). The game must be silent then. */
export function onAdPlayback(listener: (playing: boolean) => void): () => void {
  adListeners.add(listener);
  return () => adListeners.delete(listener);
}

