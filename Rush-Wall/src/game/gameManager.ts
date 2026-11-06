// ============================================================
// Wall Duel — Game State Manager
// Owns one match: turn flow, timers, AI turns and events.
// ============================================================

import {
  type GameState,
  type Move,
  type PlayerId,
  type Player,
  type PlayerLook,
  type AIProfile,
  GamePhase,
  GameMode,
  GameEndReason,
  AIDifficulty,
  WALLS_PER_PLAYER,
  TURN_TIMER_SECONDS,
} from './types';
import { createEmptyBoard, getStartPosition, getGoalRow, placeWall } from './board';
import { validateMove, checkWinCondition, opponentOf } from './rules';
import { requestAIMove } from './ai/aiClient';
import { ONLINE_TIMEOUT_GRACE_SECONDS } from '../config/balance';

export interface PlayerSetup extends PlayerLook {
  name: string;
  ai?: AIProfile;
}

export interface MatchOptions {
  mode: GameMode;
  players: [PlayerSetup, PlayerSetup];
  /** Players controlled on this device. Remote players get a timeout grace period. */
  localPlayers: PlayerId[];
  /** Turn timer on/off (off for the tutorial). */
  timerEnabled?: boolean;
}

export interface MoveEvent { playerId: PlayerId; move: Move }
export interface GameOverEvent { winner: PlayerId; reason: GameEndReason }
export interface InvalidMoveEvent { playerId: PlayerId; move: Move; error: string }

interface EventMap {
  stateChanged: GameState;
  moveMade: MoveEvent;
  gameOver: GameOverEvent;
  timerTick: { timer: number; currentTurn: PlayerId };
  invalidMove: InvalidMoveEvent;
}
type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

const AI_MIN_DELAY_MS: Record<AIDifficulty, [number, number]> = {
  easy: [450, 900],
  medium: [600, 1100],
  hard: [500, 900],
  nightmare: [400, 800],
};

export class GameManager {
  private state: GameState;
  private options: MatchOptions;
  private listeners = new Map<keyof EventMap, Set<(data: never) => void>>();
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private aiTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Seconds past zero we've waited for a remote player. */
  private graceElapsed = 0;

  constructor(options: MatchOptions) {
    this.options = options;
    this.state = createState(options);
  }

  start(): void {
    this.state.phase = GamePhase.Playing;
    this.emit('stateChanged', this.snapshot());
    if (this.options.timerEnabled !== false) this.startTimer();
    this.maybeScheduleAI();
  }

  getState(): GameState {
    return this.state;
  }

  /** Attempt a move for `playerId`. Returns false (and emits invalidMove) when illegal. */
  makeMove(playerId: PlayerId, move: Move): boolean {
    const error = validateMove(this.state, playerId, move);
    if (error) {
      this.emit('invalidMove', { playerId, move, error });
      return false;
    }

    this.applyMove(playerId, move);
    this.emit('moveMade', { playerId, move });

    const winner = checkWinCondition(this.state);
    if (winner !== null) {
      this.endGame(winner, GameEndReason.GoalReached);
      return true;
    }

    this.state.currentTurn = opponentOf(playerId);
    this.state.turnTimer = TURN_TIMER_SECONDS;
    this.state.turnCount++;
    this.graceElapsed = 0;
    this.emit('stateChanged', this.snapshot());
    this.maybeScheduleAI();
    return true;
  }

  resign(playerId: PlayerId): void {
    if (this.state.phase !== GamePhase.Playing) return;
    this.endGame(opponentOf(playerId), GameEndReason.Resignation);
  }

  /** End the match from outside (opponent disconnected or timed out on their side). */
  forceEnd(winner: PlayerId, reason: GameEndReason): void {
    if (this.state.phase !== GamePhase.Playing) return;
    this.endGame(winner, reason);
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    const fn = listener as (data: never) => void;
    set.add(fn);
    return () => set.delete(fn);
  }

  destroy(): void {
    this.stopTimers();
    this.listeners.clear();
  }

  // ----------------------------------------------------------

  private applyMove(playerId: PlayerId, move: Move): void {
    const player = this.state.players[playerId];
    if (move.type === 'move') {
      player.position = { ...move.to };
    } else {
      placeWall(this.state.board, { ...move.wall, placedBy: playerId });
      player.wallsRemaining--;
    }
    this.state.moveHistory.push(move);
  }

  private endGame(winner: PlayerId, reason: GameEndReason): void {
    this.state.phase = GamePhase.Finished;
    this.state.winner = winner;
    this.state.endReason = reason;
    this.stopTimers();
    this.emit('stateChanged', this.snapshot());
    this.emit('gameOver', { winner, reason });
  }

  private maybeScheduleAI(): void {
    const player = this.state.players[this.state.currentTurn];
    if (!player.isAI || !player.ai || this.state.phase !== GamePhase.Playing) return;

    const turnAtRequest = this.state.turnCount;
    const playerId = this.state.currentTurn;
    const [min, max] = AI_MIN_DELAY_MS[player.ai.difficulty];
    const minDelay = min + Math.random() * (max - min);
    const startedAt = Date.now();

    requestAIMove(this.snapshot(), playerId, player.ai).then(move => {
      const wait = Math.max(0, minDelay - (Date.now() - startedAt));
      this.aiTimeout = setTimeout(() => {
        if (this.state.phase !== GamePhase.Playing || this.state.turnCount !== turnAtRequest) return;
        this.makeMove(playerId, move);
      }, wait);
    });
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      if (this.state.phase !== GamePhase.Playing) return;

      if (this.state.turnTimer > 0) {
        this.state.turnTimer--;
        this.emit('timerTick', { timer: this.state.turnTimer, currentTurn: this.state.currentTurn });
        if (this.state.turnTimer > 0) return;
      }

      const current = this.state.currentTurn;
      const isRemote = this.options.mode === GameMode.Online && !this.options.localPlayers.includes(current);
      if (isRemote && this.graceElapsed < ONLINE_TIMEOUT_GRACE_SECONDS) {
        this.graceElapsed++;
        return;
      }
      this.endGame(opponentOf(current), GameEndReason.Timeout);
    }, 1000);
  }

  private stopTimers(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    this.timerInterval = null;
    this.aiTimeout = null;
  }

  /** Copy handed to React / the AI so they never mutate live state. */
  private snapshot(): GameState {
    const s = this.state;
    return {
      ...s,
      players: [{ ...s.players[0] }, { ...s.players[1] }],
      board: { walls: [...s.board.walls], wallSet: new Set(s.board.wallSet) },
      moveHistory: [...s.moveHistory],
    };
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach(fn => (fn as Listener<K>)(data));
  }
}

function createState(options: MatchOptions): GameState {
  const makePlayer = (id: PlayerId, setup: PlayerSetup): Player => ({
    id,
    name: setup.name,
    pawnSkin: setup.pawnSkin,
    wallSkin: setup.wallSkin,
    avatar: setup.avatar,
    wallsRemaining: WALLS_PER_PLAYER,
    position: getStartPosition(id),
    goalRow: getGoalRow(id),
    isAI: !!setup.ai,
    ai: setup.ai,
  });

  return {
    phase: GamePhase.Setup,
    mode: options.mode,
    board: createEmptyBoard(),
    players: [makePlayer(0, options.players[0]), makePlayer(1, options.players[1])],
    currentTurn: 0,
    turnTimer: TURN_TIMER_SECONDS,
    moveHistory: [],
    winner: null,
    endReason: null,
    turnCount: 0,
  };
}
