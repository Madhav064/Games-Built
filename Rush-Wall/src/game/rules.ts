// ============================================================
// Rush Wall — Game Rules & Validation
// ============================================================

import {
  type GameState,
  type Move,
  type PawnMove,
  type WallMove,
  type Position,
  type PlayerId,
  type WallOrientation,
  type Coord,
  GamePhase,
  BOARD_SIZE,
} from './types';
import {
  isMovementBlocked,
  doesWallOverlap,
  getAdjacentCells,
} from './board';
import { hasPathToGoal } from './pathfinding';

/**
 * Validate whether a move is legal in the current game state.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateMove(state: GameState, playerId: PlayerId, move: Move): string | null {
  if (state.phase !== GamePhase.Playing) {
    return 'Game is not in progress';
  }
  if (state.currentTurn !== playerId) {
    return 'Not your turn';
  }

  if (move.type === 'move') {
    return validatePawnMove(state, playerId, move);
  } else {
    return validateWallMove(state, playerId, move);
  }
}

/**
 * Validate a pawn movement.
 */
function validatePawnMove(state: GameState, playerId: PlayerId, move: PawnMove): string | null {
  const player = state.players[playerId];
  const opponent = state.players[playerId === 0 ? 1 : 0];
  const { to } = move;

  // Check bounds
  if (to.row < 0 || to.row >= BOARD_SIZE || to.col < 0 || to.col >= BOARD_SIZE) {
    return 'Target position is out of bounds';
  }

  // Can't stay in place
  if (to.row === player.position.row && to.col === player.position.col) {
    return 'Cannot stay in place';
  }

  // Can't move to opponent's position directly
  if (to.row === opponent.position.row && to.col === opponent.position.col) {
    return 'Cannot move to opponent position';
  }

  // Check if it's a valid adjacent move, jump, or diagonal jump
  const validMoves = getAllValidPawnMoves(state, playerId);
  const isValid = validMoves.some(m => m.row === to.row && m.col === to.col);

  if (!isValid) {
    return 'Invalid pawn move';
  }

  return null; // Valid
}

/**
 * Get all valid pawn moves for the current player.
 */
export function getAllValidPawnMoves(state: GameState, playerId: PlayerId): Position[] {
  const player = state.players[playerId];
  const opponent = state.players[playerId === 0 ? 1 : 0];
  const pos = player.position;
  const oppPos = opponent.position;

  const validMoves: Position[] = [];

  // Get adjacent cells (considering walls)
  const adjacent = getAdjacentCells(state.board, pos);

  for (const cell of adjacent) {
    if (cell.row === oppPos.row && cell.col === oppPos.col) {
      // Opponent is adjacent — handle jumping
      handleJumpMoves(state, pos, oppPos, validMoves);
    } else {
      validMoves.push(cell);
    }
  }

  return validMoves;
}

/**
 * Handle pawn jumping over opponent.
 */
function handleJumpMoves(
  state: GameState,
  currentPos: Position,
  opponentPos: Position,
  validMoves: Position[]
): void {
  const dr = opponentPos.row - currentPos.row;
  const dc = opponentPos.col - currentPos.col;
  const jumpRow = opponentPos.row + dr;
  const jumpCol = opponentPos.col + dc;

  // Try straight jump
  if (
    jumpRow >= 0 && jumpRow < BOARD_SIZE &&
    jumpCol >= 0 && jumpCol < BOARD_SIZE
  ) {
    const jumpTarget: Position = {
      row: jumpRow as Coord,
      col: jumpCol as Coord,
    };
    if (!isMovementBlocked(state.board, opponentPos, jumpTarget)) {
      validMoves.push(jumpTarget);
      return;
    }
  }

  // Straight jump blocked or off-board → try diagonal jumps
  const sideDeltas: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [sdr, sdc] of sideDeltas) {
    const diagRow = opponentPos.row + sdr;
    const diagCol = opponentPos.col + sdc;
    if (
      diagRow >= 0 && diagRow < BOARD_SIZE &&
      diagCol >= 0 && diagCol < BOARD_SIZE &&
      (diagRow !== currentPos.row || diagCol !== currentPos.col)
    ) {
      const diagPos: Position = {
        row: diagRow as Coord,
        col: diagCol as Coord,
      };
      if (!isMovementBlocked(state.board, opponentPos, diagPos)) {
        validMoves.push(diagPos);
      }
    }
  }
}

/**
 * Validate a wall placement.
 */
function validateWallMove(state: GameState, playerId: PlayerId, move: WallMove): string | null {
  const player = state.players[playerId];
  const { wall } = move;

  // Check walls remaining
  if (player.wallsRemaining <= 0) {
    return 'No walls remaining';
  }

  // Check bounds
  if (wall.row < 0 || wall.row >= BOARD_SIZE - 1 ||
      wall.col < 0 || wall.col >= BOARD_SIZE - 1) {
    return 'Wall position out of bounds';
  }

  // Check overlap with existing walls
  if (doesWallOverlap(state.board, wall.row, wall.col, wall.orientation)) {
    return 'Wall overlaps with existing wall';
  }

  // Check that both players still have a path to their goal after placement
  // Temporarily place wall to test
  const testKey = `${wall.row},${wall.col},${wall.orientation}`;
  state.board.wallSet.add(testKey);

  const p0HasPath = hasPathToGoal(state.board, state.players[0].position, state.players[0].goalRow);
  const p1HasPath = hasPathToGoal(state.board, state.players[1].position, state.players[1].goalRow);

  // Remove test wall
  state.board.wallSet.delete(testKey);

  if (!p0HasPath || !p1HasPath) {
    return 'Wall would completely block a player\'s path to goal';
  }

  return null; // Valid
}

/**
 * Get all valid wall placements for the current player.
 * This is computationally expensive — use sparingly (e.g., for AI).
 */
export function getAllValidWallMoves(state: GameState, playerId: PlayerId): WallMove[] {
  const player = state.players[playerId];
  if (player.wallsRemaining <= 0) return [];

  const validWalls: WallMove[] = [];
  const orientations: WallOrientation[] = ['horizontal', 'vertical'];

  for (const orientation of orientations) {
    for (let row = 0; row < BOARD_SIZE - 1; row++) {
      for (let col = 0; col < BOARD_SIZE - 1; col++) {
        const wallMove: WallMove = {
          type: 'wall',
          wall: { row, col, orientation },
        };
        const error = validateWallMove(state, playerId, wallMove);
        if (error === null) {
          validWalls.push(wallMove);
        }
      }
    }
  }

  return validWalls;
}

/**
 * Check if a player has won (reached their goal row).
 */
export function checkWinCondition(state: GameState): PlayerId | null {
  for (const player of state.players) {
    if (player.position.row === player.goalRow) {
      return player.id;
    }
  }
  return null;
}

/**
 * Get all valid moves (pawn + wall) for a player.
 */
export function getAllValidMoves(state: GameState, playerId: PlayerId): Move[] {
  const pawnMoves: Move[] = getAllValidPawnMoves(state, playerId).map(pos => ({
    type: 'move' as const,
    to: pos,
  }));

  const wallMoves: Move[] = getAllValidWallMoves(state, playerId);

  return [...pawnMoves, ...wallMoves];
}
