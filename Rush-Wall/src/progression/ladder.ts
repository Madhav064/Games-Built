// ============================================================
// Wall Duel — AI Ladder (campaign of computer rivals)
// ============================================================

import { type AIProfile, AIDifficulty } from '../game/types';
import { STAR_MARGINS } from '../config/balance';

export interface LadderRival {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  pawnSkin: string;
  wallSkin: string;
  ai: AIProfile;
}

export interface LadderTier {
  id: string;
  name: string;
  rivals: LadderRival[];
}

const rival = (
  id: string, name: string, tagline: string, avatar: string, pawnSkin: string,
  difficulty: AIDifficulty, mistakeRate: number, wallSkin = 'wall_default',
): LadderRival => ({ id, name, tagline, avatar, pawnSkin, wallSkin, ai: { difficulty, mistakeRate } });

export const LADDER: LadderTier[] = [
  {
    id: 'tier1', name: 'Rookie Row', rivals: [
      rival('pip', 'Pip', 'Just learning the ropes', 'avatar_2', 'pawn_red', 'easy', 0.3),
      rival('momo', 'Momo', 'Walks straight, mostly', 'avatar_3', 'pawn_amber', 'easy', 0.1),
      rival('dash', 'Dash', 'Fast feet, few walls', 'avatar_4', 'pawn_emerald', 'medium', 0.4),
    ],
  },
  {
    id: 'tier2', name: 'Maze Street', rivals: [
      rival('brick', 'Brick', 'Likes a good wall', 'avatar_5', 'pawn_red', 'medium', 0.25, 'wall_classic'),
      rival('juno', 'Juno', 'Blocks when behind', 'avatar_6', 'pawn_violet', 'medium', 0.1),
      rival('rook', 'Rook', 'Never wastes a step', 'avatar_7', 'pawn_cyan', 'medium', 0),
    ],
  },
  {
    id: 'tier3', name: 'Brick League', rivals: [
      rival('vex', 'Vex', 'Reads two moves ahead', 'avatar_8', 'pawn_ruby', 'hard', 0.35, 'wall_fire'),
      rival('nova', 'Nova', 'Walls with purpose', 'avatar_9', 'pawn_amber', 'hard', 0.2, 'wall_ice'),
      rival('atlas', 'Atlas', 'Patient and precise', 'avatar_10', 'pawn_emerald', 'hard', 0.1, 'wall_neon_green'),
    ],
  },
  {
    id: 'tier4', name: 'Fortress', rivals: [
      rival('warden', 'Warden', 'Builds mazes for fun', 'avatar_11', 'pawn_violet', 'hard', 0, 'wall_shadow'),
      rival('echo', 'Echo', 'Sees your plan coming', 'avatar_12', 'pawn_gold', 'nightmare', 0.3, 'wall_ice'),
      rival('titan', 'Titan', 'Rarely makes a mistake', 'avatar_13', 'pawn_ruby', 'nightmare', 0.2, 'wall_fire'),
    ],
  },
  {
    id: 'tier5', name: 'Nightmare Keep', rivals: [
      rival('shade', 'Shade', 'Silent and deadly', 'avatar_14', 'pawn_nebula', 'nightmare', 0.1, 'wall_shadow'),
      rival('oracle', 'Oracle', 'Four moves deep', 'avatar_15', 'pawn_diamond', 'nightmare', 0.05, 'wall_rainbow'),
      rival('monarch', 'The Monarch', 'Final boss. Good luck.', 'avatar_16', 'pawn_gold', 'nightmare', 0, 'wall_gold'),
    ],
  },
];

export const ALL_RIVALS: LadderRival[] = LADDER.flatMap(t => t.rivals);

export function findRival(id: string): LadderRival | undefined {
  return ALL_RIVALS.find(r => r.id === id);
}

/** A rival is unlocked when the one before it has at least one star. */
export function isRivalUnlocked(id: string, stars: Record<string, number>): boolean {
  const i = ALL_RIVALS.findIndex(r => r.id === id);
  return i === 0 || (i > 0 && (stars[ALL_RIVALS[i - 1].id] ?? 0) > 0);
}

/** The first unlocked rival that still has stars to win, or the last one. */
export function nextRival(stars: Record<string, number>): LadderRival {
  const firstUnbeaten = ALL_RIVALS.find(r => (stars[r.id] ?? 0) === 0);
  return firstUnbeaten ?? ALL_RIVALS.find(r => (stars[r.id] ?? 0) < 3) ?? ALL_RIVALS[ALL_RIVALS.length - 1];
}

export function rivalAfter(id: string): LadderRival | undefined {
  const i = ALL_RIVALS.findIndex(r => r.id === id);
  return i >= 0 ? ALL_RIVALS[i + 1] : undefined;
}

/** Stars for a win: 1, or 2/3 when the rival is still far from their goal. */
export function starsForWin(rivalStepsLeft: number): number {
  if (rivalStepsLeft >= STAR_MARGINS.threeStars) return 3;
  if (rivalStepsLeft >= STAR_MARGINS.twoStars) return 2;
  return 1;
}

export function totalStars(stars: Record<string, number>): number {
  return Object.values(stars).reduce((a, b) => a + b, 0);
}
