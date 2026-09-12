// ============================================================
// Rush Wall — BFS Pathfinding
// ============================================================

import {
  type BoardState,
  type Position,
  type Coord,
  BOARD_SIZE,
} from './types';
import { getAdjacentCells, isMovementBlocked } from './board';

/**
 * BFS to find the shortest path length from a position to any cell in the goal row.
 * Returns the number of steps, or -1 if no path exists.
 */
export function shortestPathLength(
  board: BoardState,
  start: Position,
  goalRow: number,
): number {
  const visited = new Set<string>();
  const queue: [Position, number][] = [[start, 0]];
  visited.add(`${start.row},${start.col}`);

  while (queue.length > 0) {
    const [pos, dist] = queue.shift()!;

    if (pos.row === goalRow) {
      return dist;
    }

    const neighbors = getAdjacentCells(board, pos);

    for (const next of neighbors) {
      const key = `${next.row},${next.col}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([next, dist + 1]);
      }
    }
  }

  return -1;
}

/**
 * Check if a path exists from a position to the goal row.
 */
export function hasPathToGoal(
  board: BoardState,
  start: Position,
  goalRow: number
): boolean {
  return shortestPathLength(board, start, goalRow) !== -1;
}

/**
 * Get all valid pawn moves for a player, considering walls and the opponent's position.
 * Handles jumping over opponent and diagonal jumps when straight jump is blocked.
 */
export function getValidPawnMoves(
  board: BoardState,
  currentPos: Position,
  opponentPos: Position
): Position[] {
  const basicNeighbors = getAdjacentCells(board, currentPos);
  const validMoves: Position[] = [];

  for (const neighbor of basicNeighbors) {
    if (neighbor.row === opponentPos.row && neighbor.col === opponentPos.col) {
      // Opponent is adjacent — handle jumping
      const dr = opponentPos.row - currentPos.row;
      const dc = opponentPos.col - currentPos.col;
      const jumpRow = opponentPos.row + dr;
      const jumpCol = opponentPos.col + dc;

      let straightJumpPossible = false;

      if (
        jumpRow >= 0 && jumpRow < BOARD_SIZE &&
        jumpCol >= 0 && jumpCol < BOARD_SIZE
      ) {
        const jumpTarget: Position = {
          row: jumpRow as Coord,
          col: jumpCol as Coord,
        };
        if (!isMovementBlocked(board, opponentPos, jumpTarget)) {
          validMoves.push(jumpTarget);
          straightJumpPossible = true;
        }
      }

      if (!straightJumpPossible) {
        // Diagonal jumps
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
            if (!isMovementBlocked(board, opponentPos, diagPos)) {
              validMoves.push(diagPos);
            }
          }
        }
      }
    } else {
      validMoves.push(neighbor);
    }
  }

  return validMoves;
}
