// ============================================================
// Rush Wall — Board Logic & Data Structures
// ============================================================

import {
  type BoardState,
  type Wall,
  type WallOrientation,
  type Position,
  type PlayerId,
  type Coord,
  BOARD_SIZE,
} from './types';

/**
 * Generate a unique string key for a wall, used for O(1) collision lookups.
 */
export function wallKey(row: number, col: number, orientation: WallOrientation): string {
  return `${row},${col},${orientation}`;
}

/**
 * Create an empty board state.
 */
export function createEmptyBoard(): BoardState {
  return {
    walls: [],
    wallSet: new Set<string>(),
  };
}

/**
 * Get the starting position for a player.
 * Player 0 starts at bottom center (row 8, col 4)
 * Player 1 starts at top center (row 0, col 4)
 */
export function getStartPosition(playerId: PlayerId): Position {
  return playerId === 0
    ? { row: 8 as Coord, col: 4 as Coord }
    : { row: 0 as Coord, col: 4 as Coord };
}

/**
 * Get the goal row for a player.
 * Player 0 needs to reach row 0 (top)
 * Player 1 needs to reach row 8 (bottom)
 */
export function getGoalRow(playerId: PlayerId): Coord {
  return playerId === 0 ? (0 as Coord) : (8 as Coord);
}

/**
 * Check if two positions are adjacent (Manhattan distance = 1).
 */
export function areAdjacent(a: Position, b: Position): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

/**
 * Check if a wall blocks movement between two adjacent cells.
 *
 * A horizontal wall at (wr, wc) blocks:
 *   - (wr, wc) ↔ (wr+1, wc)
 *   - (wr, wc+1) ↔ (wr+1, wc+1)
 *
 * A vertical wall at (wr, wc) blocks:
 *   - (wr, wc) ↔ (wr, wc+1)
 *   - (wr+1, wc) ↔ (wr+1, wc+1)
 */
export function isMovementBlocked(
  board: BoardState,
  from: Position,
  to: Position
): boolean {
  const dr = to.row - from.row;
  const dc = to.col - from.col;

  if (dr === 1 && dc === 0) {
    // Moving DOWN: check horizontal walls
    // A horizontal wall at (from.row, c) for c in [from.col-1, from.col] blocks this
    for (const c of [from.col - 1, from.col]) {
      if (c >= 0 && c < BOARD_SIZE - 1) {
        if (board.wallSet.has(wallKey(from.row, c, 'horizontal'))) {
          return true;
        }
      }
    }
  } else if (dr === -1 && dc === 0) {
    // Moving UP: check horizontal walls
    for (const c of [from.col - 1, from.col]) {
      if (c >= 0 && c < BOARD_SIZE - 1) {
        if (board.wallSet.has(wallKey(from.row - 1, c, 'horizontal'))) {
          return true;
        }
      }
    }
  } else if (dc === 1 && dr === 0) {
    // Moving RIGHT: check vertical walls
    for (const r of [from.row - 1, from.row]) {
      if (r >= 0 && r < BOARD_SIZE - 1) {
        if (board.wallSet.has(wallKey(r, from.col, 'vertical'))) {
          return true;
        }
      }
    }
  } else if (dc === -1 && dr === 0) {
    // Moving LEFT: check vertical walls
    for (const r of [from.row - 1, from.row]) {
      if (r >= 0 && r < BOARD_SIZE - 1) {
        if (board.wallSet.has(wallKey(r, from.col - 1, 'vertical'))) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get all cells that can be reached from a given position in one step,
 * considering walls and board boundaries but NOT other pawns.
 */
export function getAdjacentCells(board: BoardState, pos: Position): Position[] {
  const neighbors: Position[] = [];
  const deltas: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of deltas) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
      const to: Position = { row: nr as Coord, col: nc as Coord };
      if (!isMovementBlocked(board, pos, to)) {
        neighbors.push(to);
      }
    }
  }

  return neighbors;
}

/**
 * Check if placing a wall at the given position would overlap with any existing wall.
 */
export function doesWallOverlap(
  board: BoardState,
  row: number,
  col: number,
  orientation: WallOrientation
): boolean {
  // Check exact overlap
  if (board.wallSet.has(wallKey(row, col, orientation))) {
    return true;
  }

  // Overlapping (half-walls) and intersecting walls are permitted now!
  return false;
}

/**
 * Place a wall on the board (mutates state).
 */
export function placeWall(board: BoardState, wall: Wall): void {
  board.walls.push(wall);
  board.wallSet.add(wallKey(wall.row, wall.col, wall.orientation));
}

/**
 * Remove the last placed wall (for undo/AI search).
 */
export function removeLastWall(board: BoardState): Wall | undefined {
  const wall = board.walls.pop();
  if (wall) {
    board.wallSet.delete(wallKey(wall.row, wall.col, wall.orientation));
  }
  return wall;
}

/**
 * Clone the board state (deep copy).
 */
export function cloneBoard(board: BoardState): BoardState {
  return {
    walls: [...board.walls],
    wallSet: new Set(board.wallSet),
  };
}
