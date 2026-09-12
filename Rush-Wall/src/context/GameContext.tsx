// ============================================================
// Rush Wall — Game Context (React State Management)
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import {
  type GameState,
  type Move,
  type PlayerId,
  type PlayerProfile,
  GamePhase,
  GameMode,
  AIDifficulty,
  DEFAULT_PROFILE,
} from '../game/types';
import { GameManager, resetGameManager } from '../game/gameManager';
import { loadProfile, recordGameResult } from '../store/cosmetics';
import { soundManager } from '../audio/soundManager';
import * as sdk from '../sdk/crazygames';

// ============================================================
// Types
// ============================================================

export type Screen = 'home' | 'game' | 'shop' | 'profile' | 'howToPlay';

interface AppState {
  screen: Screen;
  gameState: GameState | null;
  profile: PlayerProfile;
  sdkReady: boolean;
  wallOrientation: 'horizontal' | 'vertical';
  showGameOver: boolean;
  coinsEarned: number;
  theme: 'light' | 'dark';
}

type AppAction =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'SET_GAME_STATE'; state: GameState }
  | { type: 'SET_PROFILE'; profile: PlayerProfile }
  | { type: 'SET_SDK_READY'; ready: boolean }
  | { type: 'TOGGLE_WALL_ORIENTATION' }
  | { type: 'SET_WALL_ORIENTATION'; orientation: 'horizontal' | 'vertical' }
  | { type: 'SHOW_GAME_OVER'; coinsEarned: number }
  | { type: 'HIDE_GAME_OVER' }
  | { type: 'UPDATE_TIMER'; timer: number }
  | { type: 'TOGGLE_THEME' };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.screen };
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.state };
    case 'SET_PROFILE':
      return { ...state, profile: action.profile };
    case 'SET_SDK_READY':
      return { ...state, sdkReady: action.ready };
    case 'TOGGLE_WALL_ORIENTATION':
      return {
        ...state,
        wallOrientation: state.wallOrientation === 'horizontal' ? 'vertical' : 'horizontal',
      };
    case 'SET_WALL_ORIENTATION':
      return { ...state, wallOrientation: action.orientation };
    case 'SHOW_GAME_OVER':
      return { ...state, showGameOver: true, coinsEarned: action.coinsEarned };
    case 'HIDE_GAME_OVER':
      return { ...state, showGameOver: false, coinsEarned: 0 };
    case 'UPDATE_TIMER':
      if (!state.gameState) return state;
      return {
        ...state,
        gameState: { ...state.gameState, turnTimer: action.timer },
      };
    case 'TOGGLE_THEME': {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('rw_theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      return { ...state, theme: newTheme };
    }
    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

interface GameContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  gameManager: React.RefObject<GameManager | null>;
  startGame: (mode: GameMode, difficulty?: AIDifficulty) => void;
  makeMove: (move: Move) => boolean;
  resign: () => void;
  goHome: () => void;
  refreshProfile: () => void;
  toggleTheme: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function useGame(): GameContextType {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

// ============================================================
// Provider
// ============================================================

const initialState: AppState = {
  screen: 'home',
  gameState: null,
  profile: DEFAULT_PROFILE,
  sdkReady: false,
  wallOrientation: 'horizontal',
  showGameOver: false,
  coinsEarned: 0,
  theme: (localStorage.getItem('rw_theme') as 'light' | 'dark') || 'light',
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gmRef = useRef<GameManager | null>(null);

  // Initialize SDK, profile, and theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    async function init() {
      sdk.loadingStart();
      soundManager.init();
      const sdkOk = await sdk.initSDK();
      dispatch({ type: 'SET_SDK_READY', ready: sdkOk });

      const profile = loadProfile();
      dispatch({ type: 'SET_PROFILE', profile });

      sdk.loadingStop();
    }
    init();
  }, []);

  // Setup game manager event listeners
  const setupListeners = useCallback((gm: GameManager) => {
    gm.on('stateChanged', (data) => {
      dispatch({ type: 'SET_GAME_STATE', state: { ...(data as GameState) } });
    });

    gm.on('moveMade', (data) => {
      const { move } = data as { playerId: PlayerId; move: Move };
      if (move.type === 'move') {
        soundManager.play('pawnMove');
      } else {
        soundManager.play('wallPlace');
      }
    });

    gm.on('turnChanged', () => {
      soundManager.play('turnStart');
    });

    gm.on('timerTick', (data) => {
      const { timer } = data as { timer: number; currentTurn: PlayerId };
      dispatch({ type: 'UPDATE_TIMER', timer });

      if (timer <= 10 && timer > 0) {
        soundManager.play('timerUrgent');
      }
    });

    gm.on('gameOver', (data) => {
      const { winner } = data as { winner: PlayerId; reason: string };
      const gs = gm.getState();
      const playerWon = !gs.players[0].isAI && winner === 0;

      // Calculate coins earned
      let coinsEarned = 0;
      if (gs.mode === 'local') {
        if (winner === 0 || winner === 1) coinsEarned = 50;
      } else if (gs.mode === 'vs_ai' && playerWon) {
        const diff = gs.players[1].aiDifficulty;
        if (diff === 'easy') coinsEarned = 20;
        else if (diff === 'medium') coinsEarned = 60;
        else if (diff === 'hard') coinsEarned = 100;
      }

      // Record result
      const wallsPlaced = gs.board.walls.filter(w => w.placedBy === 0).length;
      const profile = recordGameResult(playerWon, gs.moveHistory.length, wallsPlaced, coinsEarned);
      dispatch({ type: 'SET_PROFILE', profile });

      if (playerWon) {
        soundManager.play('win');
        soundManager.play('coinEarn');
        sdk.happyTime();
      } else {
        soundManager.play('lose');
      }

      sdk.gameplayStop();
      dispatch({ type: 'SHOW_GAME_OVER', coinsEarned });

    });

    gm.on('invalidMove', () => {
      soundManager.play('invalidMove');
    });
  }, []);

  const startGame = useCallback((mode: GameMode, difficulty: AIDifficulty = AIDifficulty.Medium) => {
    const profile = loadProfile();
    const gm = resetGameManager();
    gmRef.current = gm;
    setupListeners(gm);

    const p2Name = mode === GameMode.Local ? 'Player 2' : undefined;
    gm.startGame(mode, difficulty, profile.username, p2Name, profile.equippedPawnSkin, profile.equippedWallSkin);

    dispatch({ type: 'SET_SCREEN', screen: 'game' });
    dispatch({ type: 'HIDE_GAME_OVER' });
    sdk.gameplayStart();
  }, [setupListeners]);

  const makeMove = useCallback((move: Move): boolean => {
    if (!gmRef.current) return false;
    const gs = gmRef.current.getState();
    return gmRef.current.makeMove(gs.currentTurn, move);
  }, []);

  const resign = useCallback(() => {
    if (!gmRef.current) return;
    gmRef.current.resign(0); // Player 0 is always the local player
  }, []);

  const goHome = useCallback(() => {
    if (gmRef.current) {
      const gs = gmRef.current.getState();
      if (gs.phase === GamePhase.Playing) {
        sdk.gameplayStop();
      }
      gmRef.current.destroy();
      gmRef.current = null;
    }
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
    dispatch({ type: 'SET_GAME_STATE', state: null as any });
    dispatch({ type: 'HIDE_GAME_OVER' });
  }, []);

  const refreshProfile = useCallback(() => {
    const profile = loadProfile();
    dispatch({ type: 'SET_PROFILE', profile });
  }, []);

  const toggleTheme = useCallback(() => {
    soundManager.play('click');
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  return (
    <GameContext.Provider
      value={{ state, dispatch, gameManager: gmRef, startGame, makeMove, resign, goHome, refreshProfile, toggleTheme }}
    >
      {children}
    </GameContext.Provider>
  );
}
