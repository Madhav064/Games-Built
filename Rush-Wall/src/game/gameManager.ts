// ============================================================
// Rush Wall — Game State Manager
// ============================================================

import {
  type GameState,
  type Move,
  type PlayerId,
  type Player,
  type Wall,
  GamePhase,
  GameMode,
  GameEndReason,
  AIDifficulty,
  WALLS_PER_PLAYER,
  TURN_TIMER_SECONDS,
} from './types';
import { createEmptyBoard, getStartPosition, getGoalRow, placeWall } from './board';
import { validateMove, checkWinCondition } from './rules';
import { getAIMove } from './ai';

export type GameEventType =
  | 'stateChanged'
  | 'moveMade'
  | 'turnChanged'
  | 'gameOver'
  | 'timerTick'
  | 'invalidMove';

export type GameEventCallback = (data: unknown) => void;

/**
 * Central game state manager.
 * Handles turn flow, timer, AI, and event dispatching.
 */
export class GameManager {
  private state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private aiTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = this.createInitialState(GameMode.VsAI);
  }

  /**
   * Create a fresh initial game state.
   */
  private createInitialState(
    mode: GameMode,
    aiDifficulty: AIDifficulty = AIDifficulty.Medium,
    player1Name: string = 'You',
    player2Name: string = 'Opponent',
    pawnSkin: string = 'pawn_blue',
    wallSkin: string = 'wall_default'
  ): GameState {
    const isAI = mode === GameMode.VsAI;

    const player0: Player = {
      id: 0,
      name: player1Name,
      rating: 1000,
      wallsRemaining: WALLS_PER_PLAYER,
      position: getStartPosition(0),
      goalRow: getGoalRow(0),
      isAI: false,
      pawnSkin: pawnSkin,
      wallSkin: wallSkin,
    };

    const player1: Player = {
      id: 1,
      name: isAI ? `AI (${aiDifficulty})` : player2Name,
      rating: 1000,
      wallsRemaining: WALLS_PER_PLAYER,
      position: getStartPosition(1),
      goalRow: getGoalRow(1),
      isAI: isAI,
      aiDifficulty: isAI ? aiDifficulty : undefined,
      pawnSkin: 'pawn_red',
      wallSkin: 'wall_default',
    };

    return {
      phase: GamePhase.Setup,
      mode,
      board: createEmptyBoard(),
      players: [player0, player1],
      currentTurn: 0,
      turnTimer: TURN_TIMER_SECONDS,
      moveHistory: [],
      winner: null,
      endReason: null,
      turnCount: 0,
    };
  }

  /**
   * Start a new game.
   */
  startGame(
    mode: GameMode,
    aiDifficulty: AIDifficulty = AIDifficulty.Medium,
    player1Name: string = 'You',
    player2Name?: string,
    pawnSkin: string = 'pawn_blue',
    wallSkin: string = 'wall_default'
  ): void {
    this.cleanup();

    const p2Name = player2Name || (mode === GameMode.VsAI ? `AI (${aiDifficulty})` : 'Player 2');
    this.state = this.createInitialState(mode, aiDifficulty, player1Name, p2Name, pawnSkin, wallSkin);
    this.state.phase = GamePhase.Playing;

    this.emit('stateChanged', this.state);
    this.startTimer();

    // If AI goes first (shouldn't normally, but just in case)
    if (this.state.players[this.state.currentTurn].isAI) {
      this.scheduleAIMove();
    }
  }

  /**
   * Attempt to make a move.
   */
  makeMove(playerId: PlayerId, move: Move): boolean {
    const error = validateMove(this.state, playerId, move);
    if (error) {
      this.emit('invalidMove', { playerId, move, error });
      return false;
    }

    // Apply the move
    this.applyMove(playerId, move);

    // Check win condition
    const winner = checkWinCondition(this.state);
    if (winner !== null) {
      this.endGame(winner, GameEndReason.GoalReached);
      return true;
    }

    // Switch turns
    this.state.currentTurn = (playerId === 0 ? 1 : 0) as PlayerId;
    this.state.turnTimer = TURN_TIMER_SECONDS;
    this.state.turnCount++;

    this.emit('moveMade', { playerId, move });
    this.emit('turnChanged', { currentTurn: this.state.currentTurn });
    this.emit('stateChanged', this.state);

    // Schedule AI move if it's AI's turn
    if (this.state.players[this.state.currentTurn].isAI && this.state.phase === GamePhase.Playing) {
      this.scheduleAIMove();
    }

    return true;
  }

  /**
   * Apply a move to the state (assumes already validated).
   */
  private applyMove(playerId: PlayerId, move: Move): void {
    if (move.type === 'move') {
      this.state.players[playerId].position = { ...move.to };
    } else {
      const wall: Wall = {
        ...move.wall,
        placedBy: playerId,
      };
      placeWall(this.state.board, wall);
      this.state.players[playerId].wallsRemaining--;
    }
    this.state.moveHistory.push(move);
  }

  /**
   * End the game.
   */
  private endGame(winner: PlayerId, reason: GameEndReason): void {
    this.state.phase = GamePhase.Finished;
    this.state.winner = winner;
    this.state.endReason = reason;
    this.cleanup();
    this.emit('gameOver', { winner, reason });
    this.emit('stateChanged', this.state);
  }

  /**
   * Player resigns.
   */
  resign(playerId: PlayerId): void {
    if (this.state.phase !== GamePhase.Playing) return;
    const winner: PlayerId = playerId === 0 ? 1 : 0;
    this.endGame(winner, GameEndReason.Resignation);
  }

  /**
   * Schedule AI move with a delay (for realism).
   */
  private scheduleAIMove(): void {
    const player = this.state.players[this.state.currentTurn];
    if (!player.isAI || !player.aiDifficulty) return;

    // Delay based on difficulty (feels more natural)
    const delays: Record<AIDifficulty, number> = {
      [AIDifficulty.Easy]: 500 + Math.random() * 500,
      [AIDifficulty.Medium]: 800 + Math.random() * 700,
      [AIDifficulty.Hard]: 1200 + Math.random() * 800,
    };

    const delay = delays[player.aiDifficulty];

    this.aiTimeout = setTimeout(() => {
      if (this.state.phase !== GamePhase.Playing) return;
      if (!this.state.players[this.state.currentTurn].isAI) return;

      const move = getAIMove(this.state, this.state.currentTurn, player.aiDifficulty!);
      this.makeMove(this.state.currentTurn, move);
    }, delay);
  }

  /**
   * Start the turn timer.
   */
  private startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state.phase !== GamePhase.Playing) {
        this.cleanup();
        return;
      }

      this.state.turnTimer--;
      this.emit('timerTick', { timer: this.state.turnTimer, currentTurn: this.state.currentTurn });

      if (this.state.turnTimer <= 0) {
        // Time's up — current player loses
        const loser = this.state.currentTurn;
        const winner: PlayerId = loser === 0 ? 1 : 0;
        this.endGame(winner, GameEndReason.Timeout);
      }
    }, 1000);
  }

  /**
   * Clean up timers.
   */
  private cleanup(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
      this.aiTimeout = null;
    }
  }

  /**
   * Get current game state (immutable reference).
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Event subscription.
   */
  on(event: GameEventType, callback: GameEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event.
   */
  private emit(event: GameEventType, data: unknown): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  /**
   * Destroy the manager (cleanup everything).
   */
  destroy(): void {
    this.cleanup();
    this.listeners.clear();
  }
}

// Singleton instance
let instance: GameManager | null = null;

export function getGameManager(): GameManager {
  if (!instance) {
    instance = new GameManager();
  }
  return instance;
}

export function resetGameManager(): GameManager {
  if (instance) {
    instance.destroy();
  }
  instance = new GameManager();
  return instance;
}
