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

