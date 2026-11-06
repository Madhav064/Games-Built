// ============================================================
// Wall Duel — BFS Pathfinding
// ============================================================

import { type BoardState, type Position, BOARD_SIZE } from './types';
import { getAdjacentCells } from './board';

const index = (p: Position) => p.row * BOARD_SIZE + p.col;

/**
 * Shortest route (list of cells, start excluded) from `start` to any cell
 * of `goalRow`, ignoring pawns. Returns null when the goal is unreachable.
 */
export function shortestPath(board: BoardState, start: Position, goalRow: number): Position[] | null {
  if (start.row === goalRow) return [];

  const parent = new Int16Array(BOARD_SIZE * BOARD_SIZE).fill(-1);
  const startIdx = index(start);
  parent[startIdx] = startIdx;
  const queue: Position[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const pos = queue[head];
    for (const next of getAdjacentCells(board, pos)) {
      const ni = index(next);
      if (parent[ni] !== -1) continue;
      parent[ni] = index(pos);
      if (next.row === goalRow) {
        const path: Position[] = [];
        let cur = ni;
        while (cur !== startIdx) {
          path.push({ row: Math.floor(cur / BOARD_SIZE), col: cur % BOARD_SIZE } as Position);
          cur = parent[cur];
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/** Number of steps to the goal row, or -1 when unreachable. */
export function shortestPathLength(board: BoardState, start: Position, goalRow: number): number {
  const path = shortestPath(board, start, goalRow);
  return path ? path.length : -1;
}

export function hasPathToGoal(board: BoardState, start: Position, goalRow: number): boolean {
  return shortestPath(board, start, goalRow) !== null;
}
