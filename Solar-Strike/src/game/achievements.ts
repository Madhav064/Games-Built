// Achievements: permanent goals with up to three tiers, each paying coins once.
// Values come from lifetime stats in the save (see progress.ts).

import { PLANETS } from '../engine/planets';
import { WEAPONS } from './weapons';
import type { SaveState } from './progress';

export interface AchievementTier { target: number; reward: number }

export interface AchievementDef {
  id: string;
  name: string;
  /** Description for a tier target, e.g. "Destroy 25 planets". */
  desc: (target: number) => string;
  value: (s: SaveState) => number;
  tiers: AchievementTier[];
  /** Inline SVG body (24x24). */
  icon: string;
}

const big = (n: number) => (n >= 1e12 ? `${n / 1e12} trillion` : n >= 1e9 ? `${n / 1e9} billion` : n.toLocaleString('en-US'));

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'breaker', name: 'Planet Breaker', desc: n => `Destroy ${n} planets`,
    value: s => s.planetsDestroyed,
    tiers: [{ target: 5, reward: 200 }, { target: 25, reward: 500 }, { target: 100, reward: 1500 }],
    icon: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5l-1.5 4 3 2-2 4 1 4M5.5 10l4 1M14.5 11l4.2-1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: 'explorer', name: 'Grand Tour', desc: n => `Destroy ${n} different planets`,
    value: s => s.destroyedPlanets.length,
    tiers: [{ target: 4, reward: 200 }, { target: 8, reward: 400 }, { target: PLANETS.length, reward: 1000 }],
    icon: '<circle cx="9" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="16.5" r="3" fill="currentColor"/><circle cx="18" cy="5" r="1.6" fill="currentColor"/>',
  },
  {
    id: 'extinction', name: 'Mass Extinction', desc: n => `Wipe out ${big(n)} people`,
    value: s => s.peopleKilled,
    tiers: [{ target: 10e9, reward: 150 }, { target: 100e9, reward: 400 }, { target: 1e12, reward: 1000 }],
    icon: '<circle cx="12" cy="8" r="3.4" fill="currentColor"/><path d="M5.5 20c.6-4 3.2-6.4 6.5-6.4s5.9 2.4 6.5 6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
  {
    id: 'trigger', name: 'Trigger Happy', desc: n => `Fire ${n.toLocaleString('en-US')} shots`,
    value: s => s.shotsFired,
    tiers: [{ target: 500, reward: 100 }, { target: 2500, reward: 300 }, { target: 10000, reward: 800 }],
    icon: '<path d="M4 20 15 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="17" cy="7" r="3" fill="currentColor"/><path d="M8 4h3M4 8V5M20 16v3M16 20h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  {
    id: 'arsenal', name: 'Full Arsenal', desc: n => (n >= WEAPONS.length ? 'Unlock every weapon' : `Unlock ${n} weapons`),
    value: s => s.ownedWeapons.length,
    tiers: [{ target: 5, reward: 200 }, { target: 8, reward: 400 }, { target: WEAPONS.length, reward: 800 }],
    icon: '<path d="M5 19 14 6M10 19l8-12M15 19l4-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="14" cy="6" r="2" fill="currentColor"/><circle cx="18" cy="7" r="2" fill="currentColor"/>',
  },
  {
    id: 'icebreaker', name: 'Ice Breaker', desc: n => `Shatter frozen ground ${n} times`,
    value: s => s.shatters,
    tiers: [{ target: 25, reward: 200 }, { target: 100, reward: 500 }],
    icon: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M15 3l-2 5 3 1-2 4" fill="none" stroke="#0b0f1e" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    id: 'hunter', name: 'Satellite Hunter', desc: n => `Shoot down ${n} satellites`,
    value: s => s.satellitesDown,
    tiers: [{ target: 10, reward: 200 }, { target: 50, reward: 500 }, { target: 200, reward: 1200 }],
    icon: '<rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/><path d="M3 6.5h5v3H3zM16 14.5h5v3h-5z" fill="currentColor" opacity=".75"/><path d="M8 8l1.5 1.5M16 16l-1.5-1.5" stroke="currentColor" stroke-width="1.6"/>',
  },
  {
    id: 'speed', name: 'Lightning Strike', desc: n => `Destroy a planet in under ${n} seconds`,
    value: s => (s.fastestDestroy > 0 && s.fastestDestroy < 20 ? 20 : 0),
    tiers: [{ target: 20, reward: 300 }],
    icon: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2z" fill="currentColor"/>',
  },
  {
    id: 'sun', name: 'Lights Out', desc: () => 'Destroy The Sun',
    value: s => (s.destroyedPlanets.includes('sun') ? 1 : 0),
    tiers: [{ target: 1, reward: 600 }],
    icon: '<circle cx="12" cy="12" r="4.6" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
];

/** Tiers already paid out for an achievement. */
export const claimedTiers = (s: SaveState, id: string) => s.achievements[id] ?? 0;

/** Pays out every newly reached tier. Returns what was unlocked (the caller grants the coins). */
export function checkAchievements(s: SaveState): { def: AchievementDef; tier: number }[] {
  const out: { def: AchievementDef; tier: number }[] = [];
  for (const def of ACHIEVEMENTS) {
    let claimed = claimedTiers(s, def.id);
    const v = def.value(s);
    while (claimed < def.tiers.length && v >= def.tiers[claimed].target) {
      out.push({ def, tier: claimed });
      claimed++;
    }
    s.achievements[def.id] = claimed;
  }
  return out;
}
