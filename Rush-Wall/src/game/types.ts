// ============================================================
// Rush Wall — Core Game Types
// ============================================================

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
 * A wall on the board.
 * Walls are placed between cells. A wall is identified by:
 * - its top-left anchor position (row, col)
 * - its orientation
 *
 * Horizontal wall at (r, c): blocks movement between
 *   (r, c)↔(r+1, c) and (r, c+1)↔(r+1, c+1)
 *
 * Vertical wall at (r, c): blocks movement between
 *   (r, c)↔(r, c+1) and (r+1, c)↔(r+1, c+1)
 */
export interface Wall {
  row: number; // 0-7 (anchor row)
  col: number; // 0-7 (anchor col)
  orientation: WallOrientation;
  placedBy: PlayerId;
}

/** Types of moves a player can make */
export type MoveType = 'move' | 'wall';

/** A pawn movement */
export interface PawnMove {
  type: 'move';
  to: Position;
}

/** A wall placement */
export interface WallMove {
  type: 'wall';
  wall: Omit<Wall, 'placedBy'>;
}

/** Any valid move */
export type Move = PawnMove | WallMove;

/** Game phase / lifecycle */
export const GamePhase = {
  Setup: 'setup',
  Playing: 'playing',
  Finished: 'finished',
} as const;
export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

/** How the game ended */
export const GameEndReason = {
  GoalReached: 'goal_reached',
  Resignation: 'resignation',
  Timeout: 'timeout',
  Disconnect: 'disconnect',
} as const;
export type GameEndReason = typeof GameEndReason[keyof typeof GameEndReason];

/** Game mode */
export const GameMode = {
  VsAI: 'vs_ai',
  Local: 'local',
  Online: 'online',
} as const;
export type GameMode = typeof GameMode[keyof typeof GameMode];

/** AI difficulty level */
export const AIDifficulty = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
} as const;
export type AIDifficulty = typeof AIDifficulty[keyof typeof AIDifficulty];

/** Player information */
export interface Player {
  id: PlayerId;
  name: string;
  rating: number;
  wallsRemaining: number;
  position: Position;
  goalRow: Coord; // The row the player needs to reach to win
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  /** Cosmetic skin ID */
  pawnSkin: string;
  /** Cosmetic wall skin ID */
  wallSkin: string;
  /** Profile Avatar ID */
  avatar: string;
}

/** Full game state */
export interface GameState {
  phase: GamePhase;
  mode: GameMode;
  board: BoardState;
  players: [Player, Player];
  currentTurn: PlayerId;
  turnTimer: number; // Seconds remaining
  moveHistory: Move[];
  winner: PlayerId | null;
  endReason: GameEndReason | null;
  turnCount: number;
}

/** Board state (walls placed on the board) */
export interface BoardState {
  walls: Wall[];
  /** Quick lookup: set of wall keys for collision detection */
  wallSet: Set<string>;
}

/** Cosmetic item type */
export type CosmeticType = 'pawn' | 'wall' | 'board' | 'emote' | 'avatar';

/** Cosmetic item that can be purchased */
export interface CosmeticItem {
  id: string;
  name: string;
  type: CosmeticType;
  price: number;
  /** CSS color or gradient string */
  preview: string;
  /** Optional emoji/icon for the item */
  icon?: string;
  /** Whether this is a default unlocked item */
  unlocked: boolean;
}

/** Player profile saved via CrazyGames Data Module */
export interface PlayerProfile {
  username: string;
  rating: number;
  coins: number;
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
  createdAt: number;
  lastPlayedAt: number;
}

/** Default starting profile */
export const DEFAULT_PROFILE: PlayerProfile = {
  username: 'Player',
  rating: 1000,
  coins: 100, // Starting currency
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  winStreak: 0,
  bestWinStreak: 0,
  unlockedCosmetics: ['pawn_blue', 'pawn_red', 'wall_default', 'board_default'],
  equippedPawnSkin: 'pawn_blue',
  equippedWallSkin: 'wall_default',
  equippedBoardTheme: 'board_default',
  equippedAvatar: 'avatar_1',
  totalWallsPlaced: 0,
  totalMovesPlayed: 0,
  createdAt: Date.now(),
  lastPlayedAt: Date.now(),
};

// ============================================================
// Constants
// ============================================================

export const BOARD_SIZE = 9;
export const WALLS_PER_PLAYER = 10;
export const TURN_TIMER_SECONDS = 60;
export const WALL_LENGTH = 2; // Each wall spans 2 cells
