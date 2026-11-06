// ============================================================
// Wall Duel — Core Game Types
// ============================================================

import { TURN_SECONDS } from '../config/balance';

/** Player identifier */
export type PlayerId = 0 | 1;

/** Board coordinate (0-8 for a 9×9 grid) */
export type Coord = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** A position on the board */
export interface Position {
  row: Coord;
  col: Coord;
}

/** Wall orientation */
export type WallOrientation = 'horizontal' | 'vertical';

/**
 * A wall on the board, placed between cells and identified by its
 * top-left anchor (row, col) and orientation.
 *
 * Horizontal wall at (r, c) blocks (r, c)↔(r+1, c) and (r, c+1)↔(r+1, c+1).
 * Vertical wall at (r, c) blocks (r, c)↔(r, c+1) and (r+1, c)↔(r+1, c+1).
 *
 * House rule: walls may overlap halfway or cross each other; only an
 * exact duplicate is rejected, and no wall may cut a pawn off its goal.
 */
export interface Wall {
  row: number; // 0-7
  col: number; // 0-7
  orientation: WallOrientation;
  placedBy: PlayerId;
}

export interface PawnMove {
  type: 'move';
  to: Position;
}

export interface WallMove {
  type: 'wall';
  wall: Omit<Wall, 'placedBy'>;
}

export type Move = PawnMove | WallMove;

export const GamePhase = {
  Setup: 'setup',
  Playing: 'playing',
  Finished: 'finished',
} as const;
export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

export const GameEndReason = {
  GoalReached: 'goal_reached',
  Resignation: 'resignation',
  Timeout: 'timeout',
  Disconnect: 'disconnect',
} as const;
export type GameEndReason = typeof GameEndReason[keyof typeof GameEndReason];

export const GameMode = {
  VsAI: 'vs_ai',
  Local: 'local',
  Online: 'online',
} as const;
export type GameMode = typeof GameMode[keyof typeof GameMode];

export const AIDifficulty = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
  Nightmare: 'nightmare',
} as const;
export type AIDifficulty = typeof AIDifficulty[keyof typeof AIDifficulty];

/** How a computer opponent plays: base engine plus a chance of a weaker move. */
export interface AIProfile {
  difficulty: AIDifficulty;
  /** 0..1 chance to play a simple greedy move instead of the engine's choice. */
  mistakeRate: number;
}

/** Cosmetic look of one player during a match. */
export interface PlayerLook {
  pawnSkin: string;
  wallSkin: string;
  avatar: string;
}

export interface Player extends PlayerLook {
  id: PlayerId;
  name: string;
  wallsRemaining: number;
  position: Position;
  goalRow: Coord;
  isAI: boolean;
  ai?: AIProfile;
}

export interface BoardState {
  walls: Wall[];
  /** Quick lookup of wall keys for collision detection */
  wallSet: Set<string>;
}

export interface GameState {
  phase: GamePhase;
  mode: GameMode;
  board: BoardState;
  players: [Player, Player];
  currentTurn: PlayerId;
  turnTimer: number;
  moveHistory: Move[];
  winner: PlayerId | null;
  endReason: GameEndReason | null;
  turnCount: number;
}

// ============================================================
// Cosmetics
// ============================================================

export type CosmeticType = 'pawn' | 'wall' | 'board' | 'emote' | 'avatar';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticItem {
  id: string;
  name: string;
  type: CosmeticType;
  price: number;
  rarity: Rarity;
  /** Free items every player owns from the start. */
  free?: boolean;
}

// ============================================================
// Player profile (saved through the CrazyGames Data module)
// ============================================================

export interface PlayerSettings {
  soundOn: boolean;
  theme: 'light' | 'dark';
}

export interface PlayerProfile {
  username: string;
  coins: number;
  xp: number;
  level: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winStreak: number;
  bestWinStreak: number;
  unlockedCosmetics: string[];
  equippedPawnSkin: string;
  equippedWallSkin: string;
  equippedBoardTheme: string;
  equippedAvatar: string;
  totalWallsPlaced: number;
  totalMovesPlayed: number;
  /** Best star count (0-3) per ladder opponent id. */
  ladderStars: Record<string, number>;
  tutorialDone: boolean;
  settings: PlayerSettings;
  /** Set when the player is logged in to CrazyGames; their name and picture come from there. */
  crazyGames: { username: string; avatarUrl: string } | null;
  createdAt: number;
  lastPlayedAt: number;
}

export function createDefaultProfile(): PlayerProfile {
  const now = Date.now();
  return {
    username: 'Player',
    coins: 100,
    xp: 0,
    level: 1,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    winStreak: 0,
    bestWinStreak: 0,
    unlockedCosmetics: [],
    equippedPawnSkin: 'pawn_blue',
    equippedWallSkin: 'wall_default',
    equippedBoardTheme: 'board_default',
    equippedAvatar: 'avatar_1',
    totalWallsPlaced: 0,
    totalMovesPlayed: 0,
    ladderStars: {},
    tutorialDone: false,
    settings: { soundOn: true, theme: 'light' },
    crazyGames: null,
    createdAt: now,
    lastPlayedAt: now,
  };
}

// ============================================================
// Constants
// ============================================================

export const BOARD_SIZE = 9;
export const WALLS_PER_PLAYER = 10;
export const TURN_TIMER_SECONDS = TURN_SECONDS;
