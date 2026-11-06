// ============================================================
// Wall Duel — AI engine
// Pure functions: safe to run in a Web Worker or on the main thread.
// The search uses a compact typed-array board with make/undo moves,
// which is much faster than cloning game states.
// ============================================================

import {
  type GameState,
  type Move,
  type PlayerId,
  type Position,
  type WallOrientation,
  type AIProfile,
  AIDifficulty,
  BOARD_SIZE,
} from '../types';
import { getAllValidPawnMoves, getAllValidWallMoves } from '../rules';

const N = BOARD_SIZE;
const CELLS = N * N;
const WIN_SCORE = 10_000;

export function getAIMove(state: GameState, playerId: PlayerId, profile: AIProfile): Move {
  const s = SearchState.from(state);
  if (profile.mistakeRate > 0 && Math.random() < profile.mistakeRate) return toMove(greedyStep(s, playerId));
  switch (profile.difficulty) {
    case AIDifficulty.Easy:
      return easyMove(state, s, playerId);
    case AIDifficulty.Medium:
      return mediumMove(s, playerId);
    case AIDifficulty.Hard:
      return searchMove(s, playerId, { depths: [2], wallsPerPly: [10, 6], innerPawnMoves: 3, timeBudgetMs: 900 });
    case AIDifficulty.Nightmare:
      return searchMove(s, playerId, { depths: [2, 4], wallsPerPly: [24, 20, 18, 16], innerPawnMoves: 5, timeBudgetMs: 1500 });
    default:
      return mediumMove(s, playerId);
  }
}

// ------------------------------------------------------------
// Compact search state
// ------------------------------------------------------------
type AIAction = { kind: 'move'; to: number } | { kind: 'wall'; row: number; col: number; o: WallOrientation };

class SearchState {
  /** Wall count blocking cell i ↔ i+N (down) and i ↔ i+1 (right). Counts, because walls may overlap. */
  down = new Uint8Array(CELLS);
  right = new Uint8Array(CELLS);
  /** Exact wall anchors already used (index: o * 64 + row * 8 + col). */
  used = new Uint8Array(2 * (N - 1) * (N - 1));
  pos: [number, number] = [0, 0];
  goal: [number, number] = [0, 0];
  walls: [number, number] = [0, 0];
  private queue = new Int16Array(CELLS);
  /** Visit stamps; 32-bit so a deep search (hundreds of thousands of BFS runs) never wraps around. */
  private seen = new Int32Array(CELLS);
  private stamp = 0;

  static from(state: GameState): SearchState {
    const s = new SearchState();
    for (const w of state.board.walls) s.setWall(w.row, w.col, w.orientation, 1);
    state.players.forEach((p, i) => {
      s.pos[i] = p.position.row * N + p.position.col;
      s.goal[i] = p.goalRow;
      s.walls[i] = p.wallsRemaining;
    });
    return s;
  }

  setWall(row: number, col: number, o: WallOrientation, delta: 1 | -1): void {
    const i = row * N + col;
    if (o === 'horizontal') {
      this.down[i] += delta;
      this.down[i + 1] += delta;
    } else {
      this.right[i] += delta;
      this.right[i + N] += delta;
    }
    this.used[wallIndex(row, col, o)] += delta;
  }

  /** Orthogonal neighbours of a cell reachable without crossing a wall. */
  neighbors(i: number, out: number[]): number {
    let n = 0;
    const r = (i / N) | 0;
    const c = i % N;
    if (r > 0 && !this.down[i - N]) out[n++] = i - N;
    if (r < N - 1 && !this.down[i]) out[n++] = i + N;
    if (c > 0 && !this.right[i - 1]) out[n++] = i - 1;
    if (c < N - 1 && !this.right[i]) out[n++] = i + 1;
    return n;
  }

  /** BFS distance from cell to goal row (pawns ignored); -1 when cut off. */
  dist(start: number, goalRow: number): number {
    if (((start / N) | 0) === goalRow) return 0;
    const stamp = ++this.stamp;
    const q = this.queue;
    const seen = this.seen;
    const nb = [0, 0, 0, 0];
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    seen[start] = stamp;
    let depth = 0;
    while (head < tail) {
      const levelEnd = tail;
      depth++;
      while (head < levelEnd) {
        const cur = q[head++];
        const k = this.neighbors(cur, nb);
        for (let j = 0; j < k; j++) {
          const nx = nb[j];
          if (seen[nx] === stamp) continue;
          if (((nx / N) | 0) === goalRow) return depth;
          seen[nx] = stamp;
          q[tail++] = nx;
        }
      }
    }
    return -1;
  }

  /** Shortest route as a list of cells (start excluded), or null. */
  path(start: number, goalRow: number): number[] | null {
    if (((start / N) | 0) === goalRow) return [];
    const parent = new Int16Array(CELLS).fill(-1);
    parent[start] = start;
    const q = [start];
    const nb = [0, 0, 0, 0];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const k = this.neighbors(cur, nb);
      for (let j = 0; j < k; j++) {
        const nx = nb[j];
        if (parent[nx] !== -1) continue;
        parent[nx] = cur;
        if (((nx / N) | 0) === goalRow) {
          const out: number[] = [];
          for (let x = nx; x !== start; x = parent[x]) out.push(x);
          return out.reverse();
        }
        q.push(nx);
      }
    }
    return null;
  }

  /** Legal pawn destinations for `p`, including jumps over the rival. */
  pawnMoves(p: PlayerId): number[] {
    const me = this.pos[p];
    const opp = this.pos[1 - p];
    const out: number[] = [];
    const nb = [0, 0, 0, 0];
    const k = this.neighbors(me, nb);
    for (let j = 0; j < k; j++) {
      const cell = nb[j];
      if (cell !== opp) {
        out.push(cell);
        continue;
      }
      const straight = opp + (opp - me);
      const sameLine = Math.abs(opp - me) === N || ((opp / N) | 0) === ((straight / N) | 0);
      const onBoard = straight >= 0 && straight < CELLS && sameLine;
      const nb2 = [0, 0, 0, 0];
      const k2 = this.neighbors(opp, nb2);
      if (onBoard && Array.prototype.includes.call(nb2.slice(0, k2), straight)) {
        out.push(straight);
      } else {
        for (let x = 0; x < k2; x++) if (nb2[x] !== me) out.push(nb2[x]);
      }
    }
    return out;
  }

  /** Legal wall: in bounds, not an exact duplicate, and both pawns keep a route. */
  wallAllowed(row: number, col: number, o: WallOrientation): boolean {
    if (row < 0 || col < 0 || row > N - 2 || col > N - 2) return false;
    if (this.used[wallIndex(row, col, o)]) return false;
    this.setWall(row, col, o, 1);
    const ok = this.dist(this.pos[0], this.goal[0]) >= 0 && this.dist(this.pos[1], this.goal[1]) >= 0;
    this.setWall(row, col, o, -1);
    return ok;
  }

  apply(p: PlayerId, a: AIAction): number {
    if (a.kind === 'move') {
      const from = this.pos[p];
      this.pos[p] = a.to;
      return from;
    }
    this.setWall(a.row, a.col, a.o, 1);
    this.walls[p]--;
    return -1;
  }

  undo(p: PlayerId, a: AIAction, undoInfo: number): void {
    if (a.kind === 'move') this.pos[p] = undoInfo;
    else {
      this.setWall(a.row, a.col, a.o, -1);
      this.walls[p]++;
    }
  }

  won(p: PlayerId): boolean {
    return ((this.pos[p] / N) | 0) === this.goal[p];
  }
}

const wallIndex = (row: number, col: number, o: WallOrientation) => (o === 'horizontal' ? 0 : 64) + row * 8 + col;
const cellPos = (i: number): Position => ({ row: (i / N) | 0, col: i % N }) as Position;

function toMove(a: AIAction): Move {
  return a.kind === 'move'
    ? { type: 'move', to: cellPos(a.to) }
    : { type: 'wall', wall: { row: a.row, col: a.col, orientation: a.o } };
}

// ------------------------------------------------------------
// Easy & Medium
// ------------------------------------------------------------
function easyMove(state: GameState, s: SearchState, p: PlayerId): Move {
  if (s.walls[p] > 0 && Math.random() < 0.15) {
    const walls = getAllValidWallMoves(state, p);
    if (walls.length) return pick(walls);
  }
  if (Math.random() < 0.65) return toMove(greedyStep(s, p));
  return { type: 'move', to: pick(getAllValidPawnMoves(state, p)) };
}

function mediumMove(s: SearchState, p: PlayerId): Move {
  const o = (1 - p) as PlayerId;
  if (s.walls[p] > 0 && s.dist(s.pos[o], s.goal[o]) < s.dist(s.pos[p], s.goal[p]) && Math.random() < 0.5) {
    const walls = rankedWalls(s, p, 4);
    if (walls.length) return toMove(pick(walls));
  }
  return toMove(greedyStep(s, p));
}

function greedyStep(s: SearchState, p: PlayerId): AIAction {
  let best = -1;
  let bestDist = Infinity;
  for (const to of s.pawnMoves(p)) {
    const d = s.dist(to, s.goal[p]);
    if (d >= 0 && d < bestDist) {
      bestDist = d;
      best = to;
    }
  }
  return { kind: 'move', to: best >= 0 ? best : s.pawnMoves(p)[0] };
}

// ------------------------------------------------------------
// Hard / Nightmare — alpha-beta (negamax) search
// ------------------------------------------------------------
interface SearchOptions {
  /** Depths searched in turn. Even depths include the rival's reply, so results aren't over-optimistic. */
  depths: number[];
  /** Walls tried at each ply (index 0 = root); deeper plies are narrower. */
  wallsPerPly: number[];
  /** Pawn moves tried below the root (best first). */
  innerPawnMoves: number;
  timeBudgetMs: number;
}

class TimeUp extends Error {}

function searchMove(s: SearchState, p: PlayerId, opts: SearchOptions): Move {
  // Instant win? Take it.
  for (const to of s.pawnMoves(p)) if (((to / N) | 0) === s.goal[p]) return toMove({ kind: 'move', to });

  const deadline = now() + opts.timeBudgetMs;
  let best = greedyStep(s, p);
  for (const depth of opts.depths) {
    try {
      const result = negamax(s, p, depth, 0, -Infinity, Infinity, opts, deadline);
      if (result.action) best = result.action;
      if (result.score >= WIN_SCORE - 100) break;
    } catch (e) {
      if (e instanceof TimeUp) break;
      throw e;
    }
  }
  return toMove(best);
}

function negamax(
  s: SearchState,
  mover: PlayerId,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  opts: SearchOptions,
  deadline: number,
): { score: number; action?: AIAction } {
  if (ply > 0 && (ply & 1) === 0 && now() > deadline) throw new TimeUp();
  const other = (1 - mover) as PlayerId;
  if (s.won(other)) return { score: -WIN_SCORE - depth };
  if (depth === 0) return { score: evaluate(s, mover) };

  const walls = opts.wallsPerPly[Math.min(ply, opts.wallsPerPly.length - 1)];
  const actions = candidates(s, mover, walls, ply === 0 ? 9 : opts.innerPawnMoves);
  let bestScore = -Infinity;
  let bestAction: AIAction | undefined;

  for (const a of actions) {
    const info = s.apply(mover, a);
    const score = -negamax(s, other, depth - 1, ply + 1, -beta, -alpha, opts, deadline).score;
    s.undo(mover, a, info);
    if (score > bestScore) {
      bestScore = score;
      bestAction = a;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return { score: bestScore, action: bestAction };
}

/** Score from `mover`'s point of view (mover is about to play). */
function evaluate(s: SearchState, mover: PlayerId): number {
  const other = (1 - mover) as PlayerId;
  const mine = s.dist(s.pos[mover], s.goal[mover]);
  const theirs = s.dist(s.pos[other], s.goal[other]);
  // Being on move is worth about half a step.
  let score = (theirs - mine + 0.5) * 10;
  score += (s.walls[mover] - s.walls[other]) * 2.5;
  if (s.walls[mover] === 0 && s.walls[other] > 0) score -= 6;
  return score;
}

/** Best pawn steps first, then the walls that hurt the rival most. */
function candidates(s: SearchState, mover: PlayerId, wallCount: number, pawnCount: number): AIAction[] {
  const pawn = s.pawnMoves(mover)
    .map(to => ({ to, d: s.dist(to, s.goal[mover]) }))
    .filter(m => m.d >= 0)
    .sort((a, b) => a.d - b.d)
    .slice(0, pawnCount)
    .map(m => ({ kind: 'move', to: m.to }) as AIAction);
  if (s.walls[mover] === 0 || wallCount === 0) return pawn;
  return [pawn[0], ...rankedWalls(s, mover, wallCount), ...pawn.slice(1)].filter(Boolean);
}

/**
 * Walls that cut the rival's current shortest route, ranked by
 * (rival's extra steps) − 1.2 × (our extra steps).
 */
function rankedWalls(s: SearchState, mover: PlayerId, limit: number): AIAction[] {
  const other = (1 - mover) as PlayerId;
  const route = s.path(s.pos[other], s.goal[other]);
  if (!route) return [];
  const baseTheirs = route.length;
  const baseMine = s.dist(s.pos[mover], s.goal[mover]);
  const seen = new Set<number>();
  const ranked: { a: AIAction; gain: number }[] = [];

  let prev = s.pos[other];
  for (const step of route) {
    for (const [row, col, o] of wallsBlockingStep(prev, step)) {
      const key = wallIndex(row, col, o);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!s.wallAllowed(row, col, o)) continue;
      s.setWall(row, col, o, 1);
      const gain = (s.dist(s.pos[other], s.goal[other]) - baseTheirs) - (s.dist(s.pos[mover], s.goal[mover]) - baseMine) * 1.2;
      s.setWall(row, col, o, -1);
      if (gain > 0) ranked.push({ a: { kind: 'wall', row, col, o }, gain });
    }
    prev = step;
  }
  ranked.sort((x, y) => y.gain - x.gain);
  return ranked.slice(0, limit).map(r => r.a);
}

/** Wall anchors that would block the single step a → b. */
function wallsBlockingStep(a: number, b: number): [number, number, WallOrientation][] {
  const out: [number, number, WallOrientation][] = [];
  const ar = (a / N) | 0, ac = a % N, br = (b / N) | 0, bc = b % N;
  if (ac === bc) {
    const row = Math.min(ar, br);
    for (const col of [ac - 1, ac]) if (col >= 0 && col <= N - 2) out.push([row, col, 'horizontal']);
  } else {
    const col = Math.min(ac, bc);
    for (const row of [ar - 1, ar]) if (row >= 0 && row <= N - 2) out.push([row, col, 'vertical']);
  }
  return out;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
