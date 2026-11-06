// ============================================================
// Wall Duel — Board Logic & Data Structures
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

/** Unique key for a wall, used for O(1) lookups. */
export function wallKey(row: number, col: number, orientation: WallOrientation): string {
  return `${row},${col},${orientation}`;
}

export function createEmptyBoard(): BoardState {
  return { walls: [], wallSet: new Set<string>() };
}

/** Player 0 starts bottom-centre, player 1 top-centre. */
export function getStartPosition(playerId: PlayerId): Position {
  return playerId === 0
    ? { row: 8 as Coord, col: 4 as Coord }
    : { row: 0 as Coord, col: 4 as Coord };
}

/** Player 0 races to row 0, player 1 to row 8. */
export function getGoalRow(playerId: PlayerId): Coord {
  return playerId === 0 ? 0 : 8;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/** True when a wall blocks the step between two orthogonally adjacent cells. */
export function isMovementBlocked(board: BoardState, from: Position, to: Position): boolean {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const has = (r: number, c: number, o: WallOrientation) =>
    r >= 0 && r < BOARD_SIZE - 1 && c >= 0 && c < BOARD_SIZE - 1 && board.wallSet.has(wallKey(r, c, o));

  if (dc === 0 && Math.abs(dr) === 1) {
    const r = dr === 1 ? from.row : from.row - 1;
    return has(r, from.col - 1, 'horizontal') || has(r, from.col, 'horizontal');
  }
  if (dr === 0 && Math.abs(dc) === 1) {
    const c = dc === 1 ? from.col : from.col - 1;
    return has(from.row - 1, c, 'vertical') || has(from.row, c, 'vertical');
  }
  return false;
}

/** Orthogonal neighbours reachable in one step (walls and edges considered, pawns ignored). */
export function getAdjacentCells(board: BoardState, pos: Position): Position[] {
  const neighbors: Position[] = [];
  const deltas: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of deltas) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
    const to = { row: nr, col: nc } as Position;
    if (!isMovementBlocked(board, pos, to)) neighbors.push(to);
  }
  return neighbors;
}

/** House rule: only an exact duplicate wall is rejected (halfway overlaps and crossings are allowed). */
export function isDuplicateWall(board: BoardState, row: number, col: number, orientation: WallOrientation): boolean {
  return board.wallSet.has(wallKey(row, col, orientation));
}

/** Place a wall on the board (mutates). */
export function placeWall(board: BoardState, wall: Wall): void {
  board.walls.push(wall);
  board.wallSet.add(wallKey(wall.row, wall.col, wall.orientation));
}

export function cloneBoard(board: BoardState): BoardState {
  return { walls: [...board.walls], wallSet: new Set(board.wallSet) };
}
