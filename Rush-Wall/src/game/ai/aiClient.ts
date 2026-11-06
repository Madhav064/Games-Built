// ============================================================
// Wall Duel — AI client: runs the engine in a worker, with a
// main-thread fallback when workers are unavailable.
// ============================================================

import type { AIProfile, GameState, Move, PlayerId } from '../types';
import { getAIMove } from './ai';

export interface AIRequest {
  id: number;
  state: GameState;
  playerId: PlayerId;
  profile: AIProfile;
}

export interface AIResponse {
  id: number;
  move: Move;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, (move: Move) => void>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AIResponse>) => {
      pending.get(e.data.id)?.(e.data.move);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      workerBroken = true;
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Ask the AI for a move. Resolves with a legal move for `playerId`. */
export function requestAIMove(state: GameState, playerId: PlayerId, profile: AIProfile): Promise<Move> {
  const w = getWorker();
  if (!w) return Promise.resolve(getAIMove(state, playerId, profile));

  const id = nextId++;
  return new Promise<Move>(resolve => {
    // If the worker dies mid-request, fall back to computing here.
    const fallback = setTimeout(() => {
      if (pending.delete(id)) resolve(getAIMove(state, playerId, profile));
    }, 8000);
    pending.set(id, move => {
      clearTimeout(fallback);
      resolve(move);
    });
    const request: AIRequest = { id, state, playerId, profile };
    w.postMessage(request);
  });
}
