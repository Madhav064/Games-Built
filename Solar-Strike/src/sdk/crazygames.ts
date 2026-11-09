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

/**
 * Whether to show rewarded-ad buttons at all. QA rule: no rewarded buttons that do nothing,
 * so they hide with an adblocker or when ads are disabled for the game.
 */
export const canShowRewarded = (): boolean => !!active() && adsUsable;

/** Device type from CrazyGames system info (QA: don't guess from touch support). */
export function deviceType(): 'desktop' | 'tablet' | 'mobile' {
  const t = safely('systemInfo', () => active()?.user?.systemInfo?.device?.type, undefined);
  if (t) return t;
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

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

function requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
  const s = active();
  if (!s) return Promise.resolve(false);
  return new Promise(resolve => {
    const done = (watched: boolean) => {
      adListeners.forEach(l => l(false));
      resolve(watched);
    };
    const requested = safely('requestAd', () => {
      s.ad.requestAd(type, {
        adStarted: () => adListeners.forEach(l => l(true)),
        adFinished: () => done(true),
        adError: (error: unknown) => {
          const code = (error as { code?: string } | null)?.code;
          if (code === 'adsDisabled' || code === 'adblock') adsUsable = false;
          done(false);
        },
      });
      return true;
    }, false);
    if (!requested) done(false);
  });
}

/** Break ad between planets. CrazyGames also applies its own frequency cap. */
export const requestBreakAd = (): Promise<boolean> => requestAd('midgame');

/** Opt-in rewarded ad. Resolves true only when the ad was watched to the end. */
export const requestRewardedAd = (): Promise<boolean> => requestAd('rewarded');

/** Progress is tied to the player's CrazyGames account; falls back to localStorage. */
export function saveData(key: string, value: string): void {
  const full = STORAGE_PREFIX + key;
  const s = active();
  if (s && safely('data.setItem', () => { s.data.setItem(full, value); return true; }, false)) return;
  safely('localStorage.setItem', () => localStorage.setItem(full, value), undefined);
}

export function loadData(key: string): string | null {
  const full = STORAGE_PREFIX + key;
  const s = active();
  if (s) {
    const value = safely('data.getItem', () => s.data.getItem(full), null);
    if (value !== null) return value;
  }
  return safely('localStorage.getItem', () => localStorage.getItem(full), null);
}
