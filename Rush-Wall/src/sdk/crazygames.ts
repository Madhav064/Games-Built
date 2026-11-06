// ============================================================
// Wall Duel — CrazyGames SDK v3 integration
// Docs: https://docs.crazygames.com/sdk/intro/
// Every call is safe outside CrazyGames (local dev / other hosts).
// ============================================================

import { STORAGE_PREFIX, LEGACY_STORAGE_PREFIX } from '../config/brand';

interface CGSettings { muteAudio: boolean; disableChat: boolean }

/** A player logged in to their CrazyGames account. */
export interface CrazyUser {
  username: string;
  profilePictureUrl: string;
}

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
    inviteLink(params: Record<string, string>): string;
    getInviteParam(name: string): string | null;
    isInstantMultiplayer?: boolean;
    settings: CGSettings;
    addSettingsChangeListener(listener: (settings: CGSettings) => void): void;
    // Room Data (replaces the deprecated invite button)
    updateRoom?(room: { roomId?: string; isJoinable?: boolean; inviteParams?: Record<string, string> }): void;
    leftRoom?(): void;
    addJoinRoomListener?(listener: (inviteParams: Record<string, string>) => void): void;
    // Deprecated fallback for older SDK builds
    showInviteButton?(params: Record<string, string>): string;
    hideInviteButton?(): void;
  };
  ad: { requestAd(type: 'midgame' | 'rewarded', callbacks: CGAdCallbacks): void };
  user: {
    isUserAccountAvailable: boolean;
    getUser(): Promise<CrazyUser | null>;
    showAuthPrompt(): Promise<CrazyUser | null>;
    addAuthListener(listener: (user: CrazyUser | null) => void): void;
  };
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
    return candidate.environment !== 'disabled';
  } catch (e) {
    console.warn('[CrazyGames] SDK init failed, continuing without it', e);
    return false;
  }
}

// ------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------
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

/** Site celebration — keep it for real milestones (ladder progress, level ups). */
export const happyTime = () => safely('happytime', () => active()?.game.happytime(), undefined);

// ------------------------------------------------------------
// Settings (mute / chat) set by the CrazyGames site
// ------------------------------------------------------------
export function getPlatformSettings(): CGSettings {
  return safely('settings', () => active()?.game.settings ?? { muteAudio: false, disableChat: false },
    { muteAudio: false, disableChat: false });
}

export function onPlatformSettingsChange(listener: (settings: CGSettings) => void): void {
  safely('addSettingsChangeListener', () => active()?.game.addSettingsChangeListener(listener), undefined);
}

// ------------------------------------------------------------
// Ads — the game must be silent while an ad plays
// ------------------------------------------------------------
/** Subscribe to ad playback (true while an ad is on screen). */
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
        adError: () => done(false),
      });
      return true;
    }, false);
    if (!requested) done(false);
  });
}

/** Break ad between matches. CrazyGames also applies its own frequency cap. */
export const requestBreakAd = (): Promise<boolean> => requestAd('midgame');

/** Opt-in rewarded ad. Resolves true only when the ad was watched to the end. */
export const requestRewardedAd = (): Promise<boolean> => requestAd('rewarded');

// ------------------------------------------------------------
// Invites (play with a friend)
// ------------------------------------------------------------
export function createInviteLink(params: Record<string, string>): string {
  const s = active();
  if (s) return safely('inviteLink', () => s.game.inviteLink(params), fallbackInviteLink(params));
  return fallbackInviteLink(params);
}

export function getInviteParam(name: string): string | null {
  const s = active();
  const fromSdk = s ? safely('getInviteParam', () => s.game.getInviteParam(name), null) : null;
  return fromSdk ?? new URLSearchParams(window.location.search).get(name);
}

/** Started from the CrazyGames party UI: go straight into a joinable private room. */
export function isInstantMultiplayer(): boolean {
  return !!active()?.game.isInstantMultiplayer;
}

// ------------------------------------------------------------
// Room Data — tells CrazyGames where the player is, so it can show
// its invite button and let friends join.
// ------------------------------------------------------------
/** The player is waiting in a private room that a friend can join. */
export function reportJoinableRoom(roomCode: string): void {
  const s = active();
  if (!s) return;
  if (s.game.updateRoom) {
    safely('updateRoom', () => s.game.updateRoom!({ roomId: roomCode, isJoinable: true, inviteParams: { room: roomCode } }), undefined);
  } else {
    safely('showInviteButton', () => s.game.showInviteButton?.({ room: roomCode }), undefined);
  }
}

/** The player is in a full room (a match with two players). */
export function reportFullRoom(roomId: string): void {
  const s = active();
  if (!s) return;
  if (s.game.updateRoom) safely('updateRoom', () => s.game.updateRoom!({ roomId, isJoinable: false }), undefined);
  else safely('hideInviteButton', () => s.game.hideInviteButton?.(), undefined);
}

/** The player left their room. */
export function reportLeftRoom(): void {
  const s = active();
  if (!s) return;
  if (s.game.leftRoom) safely('leftRoom', () => s.game.leftRoom!(), undefined);
  else safely('hideInviteButton', () => s.game.hideInviteButton?.(), undefined);
}

/** A friend's invite was accepted while the game is already open. */
export function onJoinRoomRequest(listener: (roomCode: string) => void): void {
  safely('addJoinRoomListener', () => active()?.game.addJoinRoomListener?.(params => {
    if (params?.room) listener(params.room);
  }), undefined);
}

function fallbackInviteLink(params: Record<string, string>): string {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

// ------------------------------------------------------------
// User accounts — use the CrazyGames username and picture
// ------------------------------------------------------------
function userModule() {
  const s = active();
  return s?.user?.isUserAccountAvailable ? s.user : null;
}

/** True when the CrazyGames account system can be used (not on other domains). */
export const isAccountSystemAvailable = (): boolean => !!userModule();

/** The logged-in CrazyGames player, or null for guests / outside CrazyGames. */
export async function getCrazyUser(): Promise<CrazyUser | null> {
  const u = userModule();
  if (!u) return null;
  try {
    return await u.getUser();
  } catch (e) {
    console.warn('[CrazyGames] getUser failed', e);
    return null;
  }
}

/** Open the CrazyGames log-in / sign-up popup. Resolves with the user, or null if cancelled. */
export async function showCrazyLogin(): Promise<CrazyUser | null> {
  const u = userModule();
  if (!u) return null;
  try {
    return await u.showAuthPrompt();
  } catch {
    return null; // cancelled, already signed in, or a prompt is already open
  }
}

/** Called when the player logs in during the session (logging out reloads the page). */
export function onCrazyLogin(listener: (user: CrazyUser | null) => void): void {
  safely('addAuthListener', () => userModule()?.addAuthListener(listener), undefined);
}

// ------------------------------------------------------------
// Data module — progress is tied to the player's CrazyGames account.
// Falls back to localStorage outside CrazyGames.
// ------------------------------------------------------------
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

/** Read a value saved by the previous "Rush Wall" build (used once for migration). */
export function loadLegacyData(key: string): string | null {
  const s = active();
  const fromSdk = s ? safely('legacy data.getItem', () => s.data.getItem(key), null) : null;
  return fromSdk ?? safely('legacy localStorage', () => localStorage.getItem(LEGACY_STORAGE_PREFIX + key), null);
}
