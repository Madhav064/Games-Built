// Missions: three short goals are always active. Finishing one pays coins and rolls a new one.
// Goals are picked to suit what the player owns, and never repeat a kind that's already active.

import { PLANETS } from '../engine/planets';
import { WEAPONS } from './weapons';

export type MissionKind =
  | 'destroy' | 'destroyPlanet' | 'onlyWeapon' | 'fast' | 'people' | 'variety' | 'shatter' | 'satellites' | 'shots';

export interface Mission {
  kind: MissionKind;
  target: number;
  progress: number;
  reward: number;
  /** destroyPlanet: which planet. */
  planet?: string;
  /** onlyWeapon: which weapon. */
  weapon?: string;
}

export type MissionEvent =
  | { type: 'shot' }
  | { type: 'killed'; people: number }
  | { type: 'shatter' }
  | { type: 'satellite' }
  | { type: 'destroyed'; planet: string; seconds: number; weapons: string[] };

/** What the generator needs to know about the player. */
export interface MissionContext {
  ownedWeapons: string[];
  ownedPlanets: string[];
  /** The planet the player is on (destroyPlanet picks a different one). */
  currentPlanet: string;
}

export const MISSION_COUNT = 3;

/** Weapons that break planets quickly (the timed mission gets a tighter limit with one). */
const HEAVY = ['nuke', 'asteroid', 'splitter', 'lance', 'black-hole', 'nova'];

const planetName = (id?: string) => PLANETS.find(p => p.id === id)?.name ?? 'a planet';
const weaponName = (id?: string) => WEAPONS.find(w => w.id === id)?.name ?? 'one weapon';

export function describeMission(m: Mission): string {
  switch (m.kind) {
    case 'destroy': return m.target === 1 ? 'Destroy a planet' : `Destroy ${m.target} planets`;
    case 'destroyPlanet': return `Destroy ${planetName(m.planet)}`;
    case 'onlyWeapon': return `Destroy a planet using only the ${weaponName(m.weapon)}`;
    case 'fast': return `Destroy a planet in under ${m.target} seconds`;
    case 'people': return `Wipe out ${formatBig(m.target)} people`;
    case 'variety': return `Use ${m.target} different weapons on one planet`;
    case 'shatter': return `Shatter frozen ground ${m.target} times`;
    case 'satellites': return `Shoot down ${m.target} satellites`;
    case 'shots': return `Fire ${m.target} shots`;
  }
}

/** Progress text for the bar ("3 / 5"), or null for all-or-nothing goals. */
export function missionProgressText(m: Mission): string | null {
  if (m.kind === 'fast' || m.kind === 'onlyWeapon' || m.kind === 'destroyPlanet' || m.kind === 'variety') return null;
  if (m.kind === 'people') return `${formatBig(m.progress)} / ${formatBig(m.target)}`;
  return `${Math.min(m.progress, m.target)} / ${m.target}`;
}

function formatBig(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)} million`;
  return Math.round(n).toLocaleString('en-US');
}

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** A new mission that suits the player and isn't a kind in `active`. */
export function rollMission(ctx: MissionContext, active: Mission[]): Mission {
  const taken = new Set(active.map(m => m.kind));
  const heavy = ctx.ownedWeapons.some(w => HEAVY.includes(w));
  const otherPlanets = ctx.ownedPlanets.filter(p => p !== ctx.currentPlanet);
  const options: (() => Mission)[] = [];
  const add = (kind: MissionKind, make: () => Mission) => { if (!taken.has(kind)) options.push(make); };

  add('destroy', () => { const n = pick([1, 2, 3]); return { kind: 'destroy', target: n, progress: 0, reward: 100 * n + 50 }; });
  if (otherPlanets.length) add('destroyPlanet', () => ({ kind: 'destroyPlanet', target: 1, progress: 0, reward: 150, planet: pick(otherPlanets) }));
  add('onlyWeapon', () => ({ kind: 'onlyWeapon', target: 1, progress: 0, reward: 250, weapon: pick(ctx.ownedWeapons) }));
  add('fast', () => ({ kind: 'fast', target: heavy ? 40 : 75, progress: 0, reward: 200 }));
  if (ctx.ownedPlanets.includes('earth')) add('people', () => { const n = pick([5e9, 10e9, 20e9]); return { kind: 'people', target: n, progress: 0, reward: n >= 20e9 ? 300 : n >= 10e9 ? 200 : 120 }; });
  if (ctx.ownedWeapons.length >= 2) add('variety', () => { const n = Math.min(4, ctx.ownedWeapons.length); return { kind: 'variety', target: n, progress: 0, reward: 100 + 50 * n }; });
  if (ctx.ownedWeapons.includes('cryo')) add('shatter', () => ({ kind: 'shatter', target: pick([5, 10]), progress: 0, reward: 200 }));
  add('satellites', () => { const n = pick([3, 5, 8]); return { kind: 'satellites', target: n, progress: 0, reward: 100 + 25 * n }; });
  add('shots', () => { const n = pick([50, 100, 200]); return { kind: 'shots', target: n, progress: 0, reward: n >= 200 ? 250 : n >= 100 ? 150 : 100 }; });

  return pick(options)();
}

/**
 * Apply an event to the active missions. Returns the missions it completed (already
 * removed from `active` and replaced by fresh ones).
 */
export function applyMissionEvent(active: Mission[], e: MissionEvent, ctx: MissionContext): Mission[] {
  const done: Mission[] = [];
  for (const m of active) {
    switch (m.kind) {
      case 'shots': if (e.type === 'shot') m.progress++; break;
      case 'people': if (e.type === 'killed') m.progress += e.people; break;
      case 'shatter': if (e.type === 'shatter') m.progress++; break;
      case 'satellites': if (e.type === 'satellite') m.progress++; break;
      case 'destroy': if (e.type === 'destroyed') m.progress++; break;
      case 'destroyPlanet': if (e.type === 'destroyed' && e.planet === m.planet) m.progress = 1; break;
      case 'onlyWeapon':
        if (e.type === 'destroyed' && e.weapons.length === 1 && e.weapons[0] === m.weapon) m.progress = 1;
        break;
      case 'fast': if (e.type === 'destroyed' && e.seconds < m.target) m.progress = 1; break;
      case 'variety':
        if (e.type === 'destroyed' && e.weapons.length >= m.target) m.progress = 1;
        break;
    }
    const finished = m.kind === 'fast' || m.kind === 'onlyWeapon' || m.kind === 'destroyPlanet' || m.kind === 'variety'
      ? m.progress >= 1 : m.progress >= m.target;
    if (finished) done.push(m);
  }
  for (const m of done) {
    active.splice(active.indexOf(m), 1);
    active.push(rollMission(ctx, active));
  }
  return done;
}

/** Top up to MISSION_COUNT, and drop missions that no longer make sense (e.g. after a progress reset). */
export function ensureMissions(active: Mission[], ctx: MissionContext): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const m = active[i];
    const stale = (m.planet && !ctx.ownedPlanets.includes(m.planet)) || (m.weapon && !ctx.ownedWeapons.includes(m.weapon))
      || (m.kind === 'shatter' && !ctx.ownedWeapons.includes('cryo'));
    if (stale) active.splice(i, 1);
  }
  while (active.length < MISSION_COUNT) active.push(rollMission(ctx, active));
}
