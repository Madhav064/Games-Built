// ============================================================
// Wall Duel — Game Rules & Validation
// ============================================================

import {
  type GameState,
  type Move,
  type PawnMove,
  type WallMove,
  type Position,
  type PlayerId,
  type WallOrientation,
  GamePhase,
  BOARD_SIZE,
} from './types';
import { isMovementBlocked, isDuplicateWall, getAdjacentCells, samePosition, wallKey } from './board';
import { hasPathToGoal } from './pathfinding';

export const opponentOf = (id: PlayerId): PlayerId => (id === 0 ? 1 : 0);

const inBounds = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

/** Returns null when the move is legal, otherwise a human-readable reason. */
export function validateMove(state: GameState, playerId: PlayerId, move: Move): string | null {
  if (state.phase !== GamePhase.Playing) return 'Game is not in progress';
  if (state.currentTurn !== playerId) return 'Not your turn';
  return move.type === 'move'
    ? validatePawnMove(state, playerId, move)
    : validateWallMove(state, playerId, move);
}

function validatePawnMove(state: GameState, playerId: PlayerId, move: PawnMove): string | null {
  const ok = getAllValidPawnMoves(state, playerId).some(p => samePosition(p, move.to));
  return ok ? null : 'Invalid pawn move';
}

/** Every square the player's pawn can step or jump to. */
export function getAllValidPawnMoves(state: GameState, playerId: PlayerId): Position[] {
  const pos = state.players[playerId].position;
  const oppPos = state.players[opponentOf(playerId)].position;
  const moves: Position[] = [];

  for (const cell of getAdjacentCells(state.board, pos)) {
    if (!samePosition(cell, oppPos)) {
      moves.push(cell);
      continue;
    }
    // Opponent adjacent: straight jump if possible, otherwise side jumps.
    const jumpRow = oppPos.row + (oppPos.row - pos.row);
    const jumpCol = oppPos.col + (oppPos.col - pos.col);
    if (inBounds(jumpRow, jumpCol)) {
      const jump = { row: jumpRow, col: jumpCol } as Position;
      if (!isMovementBlocked(state.board, oppPos, jump)) {
        moves.push(jump);
        continue;
      }
    }
    for (const side of getAdjacentCells(state.board, oppPos)) {
      if (!samePosition(side, pos)) moves.push(side);
    }
  }
  return moves;
}

function validateWallMove(state: GameState, playerId: PlayerId, move: WallMove): string | null {
  const { wall } = move;
  if (state.players[playerId].wallsRemaining <= 0) return 'No walls remaining';
  if (wall.row < 0 || wall.row >= BOARD_SIZE - 1 || wall.col < 0 || wall.col >= BOARD_SIZE - 1) {
    return 'Wall position out of bounds';
  }
  if (isDuplicateWall(state.board, wall.row, wall.col, wall.orientation)) return 'A wall is already there';
  if (!wallKeepsPathsOpen(state, wall.row, wall.col, wall.orientation)) {
    return "A wall can't shut a pawn in";
  }
  return null;
}

/** Temporarily adds the wall and checks both pawns can still reach their goal. */
export function wallKeepsPathsOpen(state: GameState, row: number, col: number, orientation: WallOrientation): boolean {
  const key = wallKey(row, col, orientation);
  state.board.wallSet.add(key);
  const open =
    hasPathToGoal(state.board, state.players[0].position, state.players[0].goalRow) &&
    hasPathToGoal(state.board, state.players[1].position, state.players[1].goalRow);
  state.board.wallSet.delete(key);
  return open;
}

/** All legal wall placements (128 checks with BFS — use sparingly). */
export function getAllValidWallMoves(state: GameState, playerId: PlayerId): WallMove[] {
  if (state.players[playerId].wallsRemaining <= 0) return [];
  const walls: WallMove[] = [];
  const orientations: WallOrientation[] = ['horizontal', 'vertical'];
  for (const orientation of orientations) {
    for (let row = 0; row < BOARD_SIZE - 1; row++) {
      for (let col = 0; col < BOARD_SIZE - 1; col++) {
        const move: WallMove = { type: 'wall', wall: { row, col, orientation } };
        if (validateWallMove(state, playerId, move) === null) walls.push(move);
      }
    }
  }
  return walls;
}

export function checkWinCondition(state: GameState): PlayerId | null {
  for (const player of state.players) {
    if (player.position.row === player.goalRow) return player.id;
  }
  return null;
}
