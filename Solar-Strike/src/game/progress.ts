// Player progression: XP rank, coins, owned weapons/planets, settings, stats.
// Saved through the CrazyGames data module (localStorage fallback).

import { loadData, saveData } from '../sdk/crazygames';
import { WEAPONS } from './weapons';
import { PLANETS } from '../engine/planets';

export interface Settings {
  /** 0..1 */
  masterVolume: number;
  /** 0..1 */
  sfxVolume: number;
  muted: boolean;
  screenShake: boolean;
  hints: boolean;
}

export interface SaveState {
  xp: number;
  coins: number;
  ownedWeapons: string[];
  ownedPlanets: string[];
  planetsDestroyed: number;
  peopleKilled: number;
  shotsFired: number;
  /** Planet PLAY jumps straight into. */
  lastPlanet: string;
  /** Date.now() when the shop's free-coins ad was last watched. */
  freeCoinsAt: number;
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { masterVolume: 0.8, sfxVolume: 1, muted: false, screenShake: true, hints: true };

function defaults(): SaveState {
  return {
    xp: 0,
    coins: 0,
    ownedWeapons: WEAPONS.filter(w => w.price === 0).map(w => w.id),
    ownedPlanets: PLANETS.filter(p => p.price === 0).map(p => p.id),
    planetsDestroyed: 0,
    peopleKilled: 0,
    shotsFired: 0,
    lastPlanet: PLANETS[0].id,
    freeCoinsAt: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ------------------------------------------------------------
// Ranks: Bronze I..III, Silver I..III, Gold I..III, Platinum
// ------------------------------------------------------------
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Rank { index: number; tier: Tier; name: string }

const RANKS: Rank[] = [
  ['bronze', 'Bronze I'], ['bronze', 'Bronze II'], ['bronze', 'Bronze III'],
  ['silver', 'Silver I'], ['silver', 'Silver II'], ['silver', 'Silver III'],
  ['gold', 'Gold I'], ['gold', 'Gold II'], ['gold', 'Gold III'],
  ['platinum', 'Platinum'],
].map(([tier, name], index) => ({ index, tier: tier as Tier, name }));

/** Total XP needed to reach rank `i` (rank 0 = 0 XP). */
export function xpForRank(i: number): number {
  if (i <= 0) return 0;
  return Math.round(150 * Math.pow(i, 1.6));
}

export function rankFromXp(xp: number): Rank {
  let i = 0;
  while (i < RANKS.length - 1 && xp >= xpForRank(i + 1)) i++;
  return RANKS[i];
}

