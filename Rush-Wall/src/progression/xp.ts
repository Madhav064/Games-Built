// ============================================================
// Wall Duel — XP levels & rank tiers
// ============================================================

import { xpToNextLevel } from '../config/balance';

export interface RankTier {
  id: string;
  name: string;
  minLevel: number;
  color: string;
  icon: string;
}

export const RANKS: RankTier[] = [
  { id: 'bronze', name: 'Bronze', minLevel: 1, color: '#cd7f32', icon: '🥉' },
  { id: 'silver', name: 'Silver', minLevel: 5, color: '#a8b3c7', icon: '🥈' },
  { id: 'gold', name: 'Gold', minLevel: 10, color: '#f5b301', icon: '🥇' },
  { id: 'platinum', name: 'Platinum', minLevel: 18, color: '#38bdf8', icon: '💠' },
  { id: 'diamond', name: 'Diamond', minLevel: 28, color: '#a78bfa', icon: '💎' },
];

export function rankForLevel(level: number): RankTier {
  let rank = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) rank = r;
  return rank;
}

export interface XpResult {
  level: number;
  xp: number;
  /** Every level reached during this gain (empty if none). */
  levelsReached: number[];
  newRank: RankTier | null;
}

/** Add XP to (level, xp-into-level) and return the new values. */
export function addXp(level: number, xp: number, gained: number): XpResult {
  const startRank = rankForLevel(level);
  const levelsReached: number[] = [];
  let total = xp + gained;
  while (total >= xpToNextLevel(level)) {
    total -= xpToNextLevel(level);
    level++;
    levelsReached.push(level);
  }
  const endRank = rankForLevel(level);
  return { level, xp: total, levelsReached, newRank: endRank.id !== startRank.id ? endRank : null };
}

/** 0..1 progress through the current level. */
export function levelProgress(level: number, xp: number): number {
  return Math.min(1, xp / xpToNextLevel(level));
}
