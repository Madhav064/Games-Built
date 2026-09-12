// ============================================================
// Rush Wall — AI Engine
// ============================================================

import {
  type GameState,
  type Move,
  type PlayerId,
  AIDifficulty,
} from './types';
import {
  getAllValidPawnMoves,
  getAllValidWallMoves,
  getAllValidMoves,
} from './rules';
import { shortestPathLength } from './pathfinding';
import { type Wall } from './types';
import { placeWall } from './board';

/**
 * Select a move for the AI based on difficulty level.
 */
export function getAIMove(state: GameState, playerId: PlayerId, difficulty: AIDifficulty): Move {
  switch (difficulty) {
    case AIDifficulty.Easy:
      return getEasyMove(state, playerId);
    case AIDifficulty.Medium:
      return getMediumMove(state, playerId);
    case AIDifficulty.Hard:
      return getHardMove(state, playerId);
    default:
      return getEasyMove(state, playerId);
  }
}

// ============================================================
// Easy AI — Random valid move with slight bias toward advancing
// ============================================================

function getEasyMove(state: GameState, playerId: PlayerId): Move {
  const pawnMoves = getAllValidPawnMoves(state, playerId);
  const player = state.players[playerId];

  // 80% chance to move pawn, 20% chance to place wall (if available)
  const shouldPlaceWall = Math.random() < 0.2 && player.wallsRemaining > 0;

  if (shouldPlaceWall) {
    const wallMoves = getAllValidWallMoves(state, playerId);
    if (wallMoves.length > 0) {
      return wallMoves[Math.floor(Math.random() * wallMoves.length)];
    }
  }

  // Pick a random pawn move, with slight preference for moves toward goal
  if (pawnMoves.length > 0) {
    // Sort by distance to goal (ascending)
    const goalDir = player.goalRow === 0 ? -1 : 1;
    const sorted = [...pawnMoves].sort((a, b) => {
      const aProgress = (a.row - player.position.row) * goalDir;
      const bProgress = (b.row - player.position.row) * goalDir;
      return bProgress - aProgress; // prefer moves toward goal
    });

    // 60% chance to pick the best advancing move, 40% random
    if (Math.random() < 0.6) {
      return { type: 'move', to: sorted[0] };
    }
    return { type: 'move', to: pawnMoves[Math.floor(Math.random() * pawnMoves.length)] };
  }

  // Fallback — should never happen if game logic is correct
  const allMoves = getAllValidMoves(state, playerId);
  return allMoves[0];
}

// ============================================================
// Medium AI — Greedy: minimize own shortest path, occasionally block
// ============================================================

function getMediumMove(state: GameState, playerId: PlayerId): Move {
  const player = state.players[playerId];
  const opponentId: PlayerId = playerId === 0 ? 1 : 0;
  const opponent = state.players[opponentId];

  const myDist = shortestPathLength(state.board, player.position, player.goalRow);
  const oppDist = shortestPathLength(state.board, opponent.position, opponent.goalRow);

  // If opponent is closer, try to block them (40% chance)
  if (oppDist < myDist && player.wallsRemaining > 0 && Math.random() < 0.4) {
    const bestWall = findBestBlockingWall(state, playerId, 5);
    if (bestWall) return bestWall;
  }

  // Otherwise, pick the pawn move that minimizes our distance to goal
  const pawnMoves = getAllValidPawnMoves(state, playerId);
  let bestMove: Move | null = null;
  let bestDist = Infinity;

  for (const pos of pawnMoves) {
    const dist = shortestPathLength(state.board, pos, player.goalRow);
    if (dist < bestDist) {
      bestDist = dist;
      bestMove = { type: 'move', to: pos };
    }
  }

  if (bestMove) return bestMove;

  // Fallback
  const allMoves = getAllValidMoves(state, playerId);
  return allMoves[0];
}

// ============================================================
// Hard AI — Minimax with alpha-beta pruning
// ============================================================

function getHardMove(state: GameState, playerId: PlayerId): Move {
  const MAX_DEPTH = 3;

  // Generate candidate moves — limit wall moves for performance
  const pawnMoves: Move[] = getAllValidPawnMoves(state, playerId).map(pos => ({
    type: 'move' as const,
    to: pos,
  }));

  let candidateMoves: Move[] = [...pawnMoves];

  // Add a subset of promising wall moves
  if (state.players[playerId].wallsRemaining > 0) {
    const promisingWalls = getPromisingWallMoves(state, playerId, 10);
    candidateMoves = [...candidateMoves, ...promisingWalls];
  }

  if (candidateMoves.length === 0) {
    const allMoves = getAllValidMoves(state, playerId);
    return allMoves[0];
  }

  let bestMove = candidateMoves[0];
  let bestScore = -Infinity;

  for (const move of candidateMoves) {
    const newState = applyMoveToState(state, playerId, move);
    const score = minimax(newState, MAX_DEPTH - 1, -Infinity, Infinity, false, playerId);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Minimax with alpha-beta pruning.
 */
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  aiPlayerId: PlayerId
): number {
  // Terminal conditions
  const opponentId: PlayerId = aiPlayerId === 0 ? 1 : 0;

  // Check wins
  if (state.players[aiPlayerId].position.row === state.players[aiPlayerId].goalRow) {
    return 1000 + depth; // Win — prefer sooner
  }
  if (state.players[opponentId].position.row === state.players[opponentId].goalRow) {
    return -1000 - depth; // Loss — prefer later
  }

  if (depth === 0) {
    return evaluateState(state, aiPlayerId);
  }

  const currentPlayerId = isMaximizing ? aiPlayerId : opponentId;

  // Generate limited moves
  const pawnMoves: Move[] = getAllValidPawnMoves(state, currentPlayerId).map(pos => ({
    type: 'move' as const,
    to: pos,
  }));

  let candidateMoves: Move[] = [...pawnMoves];

  if (state.players[currentPlayerId].wallsRemaining > 0 && depth >= 2) {
    const walls = getPromisingWallMoves(state, currentPlayerId, 5);
    candidateMoves = [...candidateMoves, ...walls];
  }

  if (candidateMoves.length === 0) {
    return evaluateState(state, aiPlayerId);
  }

  if (isMaximizing) {
    let maxScore = -Infinity;
    for (const move of candidateMoves) {
      const newState = applyMoveToState(state, currentPlayerId, move);
      const score = minimax(newState, depth - 1, alpha, beta, false, aiPlayerId);
      maxScore = Math.max(maxScore, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return maxScore;
  } else {
    let minScore = Infinity;
    for (const move of candidateMoves) {
      const newState = applyMoveToState(state, currentPlayerId, move);
      const score = minimax(newState, depth - 1, alpha, beta, true, aiPlayerId);
      minScore = Math.min(minScore, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return minScore;
  }
}

/**
 * Evaluate the game state from the perspective of a player.
 * Higher = better for that player.
 */
function evaluateState(state: GameState, playerId: PlayerId): number {
  const opponentId: PlayerId = playerId === 0 ? 1 : 0;
  const player = state.players[playerId];
  const opponent = state.players[opponentId];

  const myDist = shortestPathLength(state.board, player.position, player.goalRow);
  const oppDist = shortestPathLength(state.board, opponent.position, opponent.goalRow);

  // If no path (shouldn't happen), penalize heavily
  if (myDist === -1) return -500;
  if (oppDist === -1) return 500;

  // Distance difference (positive = good for us)
  let score = (oppDist - myDist) * 10;

  // Wall advantage
  score += (player.wallsRemaining - opponent.wallsRemaining) * 2;

  // Center control bonus (for early game)
  const centerDist = Math.abs(player.position.col - 4);
  score -= centerDist;

  return score;
}

/**
 * Apply a move to a game state and return a new state (shallow clone).
 */
function applyMoveToState(state: GameState, playerId: PlayerId, move: Move): GameState {
  const newState: GameState = {
    ...state,
    players: [
      { ...state.players[0] },
      { ...state.players[1] },
    ],
    board: {
      walls: [...state.board.walls],
      wallSet: new Set(state.board.wallSet),
    },
    moveHistory: [...state.moveHistory, move],
    currentTurn: (playerId === 0 ? 1 : 0) as PlayerId,
    turnCount: state.turnCount + 1,
  };

  if (move.type === 'move') {
    newState.players[playerId] = {
      ...newState.players[playerId],
      position: { ...move.to },
    };
  } else {
    const wall: Wall = {
      ...move.wall,
      placedBy: playerId,
    };
    placeWall(newState.board, wall);
    newState.players[playerId] = {
      ...newState.players[playerId],
      wallsRemaining: newState.players[playerId].wallsRemaining - 1,
    };
  }

  return newState;
}

/**
 * Find the wall placement that maximally extends the opponent's shortest path.
 */
function findBestBlockingWall(
  state: GameState,
  playerId: PlayerId,
  maxCandidates: number
): Move | null {
  const opponentId: PlayerId = playerId === 0 ? 1 : 0;
  const opponent = state.players[opponentId];
  const currentOppDist = shortestPathLength(state.board, opponent.position, opponent.goalRow);

  const wallMoves = getAllValidWallMoves(state, playerId);
  if (wallMoves.length === 0) return null;

  // Score each wall by how much it extends the opponent's path
  const scored: { move: Move; delta: number }[] = [];
  const sample = wallMoves.length > 50
    ? sampleArray(wallMoves, 50)
    : wallMoves;

  for (const wm of sample) {
    // Temporarily place wall
    const key = `${wm.wall.row},${wm.wall.col},${wm.wall.orientation}`;
    state.board.wallSet.add(key);

    const newOppDist = shortestPathLength(state.board, opponent.position, opponent.goalRow);

    state.board.wallSet.delete(key);

    if (newOppDist > currentOppDist) {
      scored.push({ move: wm, delta: newOppDist - currentOppDist });
    }
  }

  if (scored.length === 0) return null;

  // Sort by delta descending
  scored.sort((a, b) => b.delta - a.delta);

  // Return best (with some randomness for variety)
  const idx = Math.min(
    Math.floor(Math.random() * Math.min(maxCandidates, scored.length)),
    scored.length - 1
  );
  return scored[idx].move;
}

/**
 * Get promising wall moves (walls near the opponent's shortest path).
 */
function getPromisingWallMoves(
  state: GameState,
  playerId: PlayerId,
  maxCount: number
): Move[] {
  const opponentId: PlayerId = playerId === 0 ? 1 : 0;
  const opponent = state.players[opponentId];
  const oppPos = opponent.position;

  // Focus walls near opponent's position
  const wallMoves = getAllValidWallMoves(state, playerId);

  // Score by proximity to opponent
  const scored = wallMoves.map(wm => {
    const dist = Math.abs(wm.wall.row - oppPos.row) + Math.abs(wm.wall.col - oppPos.col);
    return { move: wm, dist };
  });

  scored.sort((a, b) => a.dist - b.dist);

  return scored.slice(0, maxCount).map(s => s.move);
}

/**
 * Randomly sample n items from an array.
 */
function sampleArray<T>(arr: T[], n: number): T[] {
  const result: T[] = [];
  const copy = [...arr];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}
