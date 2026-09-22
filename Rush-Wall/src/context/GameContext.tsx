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
import { updateLeaderboardWin, updateLeaderboardLoss, ensureLeaderboardEntry } from '../sdk/leaderboard';
import { soundManager } from '../audio/soundManager';
import * as sdk from '../sdk/crazygames';

// ============================================================
// Types
// ============================================================

export type Screen = 'home' | 'game' | 'shop' | 'profile' | 'howToPlay' | 'matchmaking' | 'leaderboard';

interface AppState {
  screen: Screen;
  gameState: GameState | null;
  profile: PlayerProfile;
  sdkReady: boolean;
  wallOrientation: 'horizontal' | 'vertical';
  showGameOver: boolean;
  coinsEarned: number;
  theme: 'light' | 'dark';
  localPlayerId: PlayerId;
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
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_LOCAL_PLAYER_ID'; playerId: PlayerId };

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
    case 'SET_LOCAL_PLAYER_ID':
      return { ...state, localPlayerId: action.playerId };
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
  startOnlineGame: (matchInfo: import('../sdk/multiplayer').MatchInfo) => void;
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
  localPlayerId: 0,
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gmRef = useRef<GameManager | null>(null);
  const localPlayerIdRef = useRef<PlayerId>(0);

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
      const currentLocalId = localPlayerIdRef.current;
      const playerWon = winner === currentLocalId;

      // Calculate coins earned
      let coinsEarned = 0;
      if (gs.mode === 'local') {
        if (winner === 0 || winner === 1) coinsEarned = 50;
      } else if (gs.mode === 'vs_ai' && playerWon) {
        const diff = gs.players[1].aiDifficulty;
        if (diff === 'easy') coinsEarned = 20;
        else if (diff === 'medium') coinsEarned = 60;
        else if (diff === 'hard') coinsEarned = 100;
      } else if (gs.mode === 'online' && playerWon) {
        coinsEarned = 80;
      }

      // Record result
      const wallsPlaced = gs.board.walls.filter(w => w.placedBy === 0).length;
      const profile = recordGameResult(playerWon, gs.moveHistory.length, wallsPlaced, coinsEarned);
      dispatch({ type: 'SET_PROFILE', profile });

      // Update global leaderboard for online games
      if (gs.mode === GameMode.Online) {
        if (playerWon) {
          updateLeaderboardWin().catch(err => console.error('Failed to update leaderboard:', err));
        } else {
          updateLeaderboardLoss().catch(err => console.error('Failed to update leaderboard:', err));
        }
      }

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
    gm.startGame(
      mode, 
      difficulty, 
      profile.username, 
      p2Name, 
      profile.equippedPawnSkin, 
      profile.equippedWallSkin,
      undefined,
      undefined,
      profile.equippedAvatar,
      'avatar_1'
    );

    localPlayerIdRef.current = 0;
    dispatch({ type: 'SET_LOCAL_PLAYER_ID', playerId: 0 });
    dispatch({ type: 'SET_SCREEN', screen: 'game' });
    dispatch({ type: 'HIDE_GAME_OVER' });
    sdk.gameplayStart();
  }, [setupListeners]);

  const startOnlineGame = useCallback((matchInfo: import('../sdk/multiplayer').MatchInfo) => {
    const profile = loadProfile();
    const gm = resetGameManager();
    gmRef.current = gm;
    setupListeners(gm);

    // Host is always Player 0, Guest is always Player 1
    const localPlayerId: PlayerId = matchInfo.isHost ? 0 : 1;
    const opponentName = matchInfo.opponentName || 'Opponent';

    // Set up names: Player 0 is host, Player 1 is guest
    const p0Name = matchInfo.isHost ? profile.username : opponentName;
    const p1Name = matchInfo.isHost ? opponentName : profile.username;

    // Set up skins: Player 0 skins belong to host, Player 1 skins belong to guest
    const p0PawnSkin = matchInfo.isHost ? profile.equippedPawnSkin : (matchInfo.opponentPawnSkin || 'pawn_red');
    const p0WallSkin = matchInfo.isHost ? profile.equippedWallSkin : (matchInfo.opponentWallSkin || 'wall_default');
    const p1PawnSkin = matchInfo.isHost ? (matchInfo.opponentPawnSkin || 'pawn_red') : profile.equippedPawnSkin;
    const p1WallSkin = matchInfo.isHost ? (matchInfo.opponentWallSkin || 'wall_default') : profile.equippedWallSkin;
    const p0Avatar = matchInfo.isHost ? profile.equippedAvatar : (matchInfo.opponentAvatar || 'avatar_1');
    const p1Avatar = matchInfo.isHost ? (matchInfo.opponentAvatar || 'avatar_1') : profile.equippedAvatar;

    gm.startGame(
      GameMode.Online, 
      undefined, 
      p0Name, 
      p1Name, 
      p0PawnSkin, 
      p0WallSkin, 
      p1PawnSkin, 
      p1WallSkin,
      p0Avatar,
      p1Avatar
    );

    localPlayerIdRef.current = localPlayerId;
    dispatch({ type: 'SET_LOCAL_PLAYER_ID', playerId: localPlayerId });
    dispatch({ type: 'SET_SCREEN', screen: 'game' });
    dispatch({ type: 'HIDE_GAME_OVER' });
    sdk.gameplayStart();

    // Ensure this player has a leaderboard entry (even with 0 wins)
    ensureLeaderboardEntry().catch(err => console.warn('Leaderboard entry:', err));

    // The opponent's PlayerId from our perspective
    const remotePlayerId: PlayerId = matchInfo.isHost ? 1 : 0;

    import('../sdk/multiplayer').then(({ joinGameChannel, leaveGameChannel }) => {
      joinGameChannel(matchInfo.gameId, (remoteMove) => {
        // Apply opponent's move directly — no mirroring needed.
        // Both clients share the same board layout. The move coordinates
        // are absolute board positions.
        if (gmRef.current) {
          gmRef.current.makeMove(remotePlayerId, remoteMove);
        }
      }, () => {
        // Opponent disconnected — they forfeit
        if (gmRef.current) {
          const gs = gmRef.current.getState();
          if (gs.phase === GamePhase.Playing) {
            gmRef.current.resign(remotePlayerId);
          }
        }
      });

      // Cleanup when destroying manager
      const oldDestroy = gm.destroy.bind(gm);
      gm.destroy = () => {
        leaveGameChannel();
        oldDestroy();
      };
    });
  }, [setupListeners]);

  const makeMove = useCallback((move: Move): boolean => {
    if (!gmRef.current) return false;
    const gs = gmRef.current.getState();
    const success = gmRef.current.makeMove(gs.currentTurn, move);
    if (success && gs.mode === GameMode.Online) {
      import('../sdk/multiplayer').then(({ sendMove }) => {
        sendMove(move);
      });
    }
    return success;
  }, []);

  const resign = useCallback(() => {
    if (!gmRef.current) return;
    gmRef.current.resign(state.localPlayerId);
  }, [state.localPlayerId]);

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
      value={{ state, dispatch, gameManager: gmRef, startGame, startOnlineGame, makeMove, resign, goHome, refreshProfile, toggleTheme }}
    >
      {children}
    </GameContext.Provider>
  );
}
