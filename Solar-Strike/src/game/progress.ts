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

export class Progress {
  state: SaveState;
  private saveTimer: number | null = null;

  constructor() {
    const s = defaults();
    try {
      const raw = loadData('save');
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SaveState> & { muted?: boolean };
        Object.assign(s, saved);
        s.settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
        if (saved.muted !== undefined && !saved.settings) s.settings.muted = saved.muted; // pre-shop saves
        // Free items are always owned, even ones added after the save was made.
        for (const w of WEAPONS) if (w.price === 0 && !s.ownedWeapons.includes(w.id)) s.ownedWeapons.push(w.id);
        for (const p of PLANETS) if (p.price === 0 && !s.ownedPlanets.includes(p.id)) s.ownedPlanets.push(p.id);
      }
    } catch { /* corrupt save: start fresh */ }
    this.state = s;
  }

  get rank(): Rank { return rankFromXp(this.state.xp); }

  /** 0..1 progress toward the next rank (1 at the top rank). */
  get rankProgress(): number {
    const r = this.rank;
    if (r.index >= RANKS.length - 1) return 1;
    const a = xpForRank(r.index), b = xpForRank(r.index + 1);
    return (this.state.xp - a) / (b - a);
  }

  /** Adds XP. Returns the new rank if the player ranked up, else null. */
  addXp(amount: number): Rank | null {
    if (amount <= 0) return null;
    const before = this.rank.index;
    this.state.xp += Math.round(amount);
    this.queueSave();
    const after = this.rank;
    return after.index > before ? after : null;
  }

  addCoins(amount: number): void {
    if (amount <= 0) return;
    this.state.coins += Math.round(amount);
    this.queueSave();
  }

  ownsWeapon(id: string): boolean { return this.state.ownedWeapons.includes(id); }
  ownsPlanet(id: string): boolean { return this.state.ownedPlanets.includes(id); }

  /** Spend coins on an item. Returns false if the player can't afford it. */
  buy(kind: 'weapon' | 'planet', id: string, price: number): boolean {
    const list = kind === 'weapon' ? this.state.ownedWeapons : this.state.ownedPlanets;
    if (list.includes(id)) return true;
    if (this.state.coins < price) return false;
    this.state.coins -= price;
    list.push(id);
    this.saveNow();
    return true;
  }

  /** Wipe progress but keep settings. */
  reset(): void {
    const settings = this.state.settings;
    this.state = defaults();
    this.state.settings = settings;
    this.saveNow();
  }

  queueSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      saveData('save', JSON.stringify(this.state));
    }, 800);
  }

  saveNow(): void {
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    saveData('save', JSON.stringify(this.state));
  }
}
