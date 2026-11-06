// ============================================================
// Wall Duel — App state: screens, matches, rewards, ads
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import {
  type GameState,
  type Move,
  type PlayerId,
  type PlayerProfile,
  type PlayerSettings,
  type PlayerLook,
  GameMode,
  GamePhase,
  GameEndReason,
  AIDifficulty,
  createDefaultProfile,
} from '../game/types';
import { GameManager, type PlayerSetup } from '../game/gameManager';
import { opponentOf } from '../game/rules';
import { shortestPathLength } from '../game/pathfinding';
import { loadProfile, updateProfile, recordMatch, addCoins, linkCrazyGamesAccount, resolveAvatar, type MatchKind, type MatchRewards } from '../store/profile';
import { findRival, rivalAfter, type LadderRival } from '../progression/ladder';
import { soundManager } from '../audio/soundManager';
import * as sdk from '../sdk/crazygames';
import type { MatchInfo, GameChannel } from '../sdk/multiplayer';
import { MATCHES_PER_BREAK_AD, REWARDED_COIN_MULTIPLIER } from '../config/balance';

export type Screen = 'home' | 'game' | 'ladder' | 'shop' | 'profile' | 'leaderboard' | 'online' | 'howToPlay' | 'privacy';

/** What kind of match is running, for rewards and the results screen. */
export type ActiveMatch = MatchKind & { online?: MatchInfo };

export interface Emote { playerId: PlayerId; emoji: string; at: number }

interface AppState {
  ready: boolean;
  screen: Screen;
  /** Screen to return to from pages like Privacy. */
  previousScreen: Screen;
  profile: PlayerProfile;
  gameState: GameState | null;
  match: ActiveMatch | null;
  localPlayerId: PlayerId;
  rewards: MatchRewards | null;
  bonusClaimed: boolean;
  emote: Emote | null;
  chatDisabled: boolean;
  /** Room code from an invite link, consumed by the online screen. */
  pendingRoomCode: string | null;
}

type Action =
  | { type: 'READY'; profile: PlayerProfile; chatDisabled: boolean; pendingRoomCode: string | null }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'PROFILE'; profile: PlayerProfile }
  | { type: 'MATCH_STARTED'; match: ActiveMatch; localPlayerId: PlayerId }
  | { type: 'GAME_STATE'; gameState: GameState }
  | { type: 'TIMER'; timer: number }
  | { type: 'RESULTS'; rewards: MatchRewards }
  | { type: 'BONUS_CLAIMED'; profile: PlayerProfile }
  | { type: 'MATCH_CLOSED' }
  | { type: 'EMOTE'; emote: Emote }
  | { type: 'CHAT_DISABLED'; value: boolean }
  | { type: 'ROOM_CODE_USED' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'READY':
      return { ...state, ready: true, profile: action.profile, chatDisabled: action.chatDisabled, pendingRoomCode: action.pendingRoomCode };
    case 'SCREEN':
      return { ...state, screen: action.screen, previousScreen: state.screen };
    case 'PROFILE':
      return { ...state, profile: action.profile };
    case 'MATCH_STARTED':
      return { ...state, screen: 'game', match: action.match, localPlayerId: action.localPlayerId, rewards: null, bonusClaimed: false, emote: null };
    case 'GAME_STATE':
      return { ...state, gameState: action.gameState };
    case 'TIMER':
      return state.gameState ? { ...state, gameState: { ...state.gameState, turnTimer: action.timer } } : state;
    case 'RESULTS':
      return { ...state, rewards: action.rewards, profile: action.rewards.profile };
    case 'BONUS_CLAIMED':
      return { ...state, bonusClaimed: true, profile: action.profile };
    case 'MATCH_CLOSED':
      return { ...state, gameState: null, match: null, rewards: null, emote: null };
    case 'EMOTE':
      return { ...state, emote: action.emote };
    case 'CHAT_DISABLED':
      return { ...state, chatDisabled: action.value };
    case 'ROOM_CODE_USED':
      return { ...state, pendingRoomCode: null };
  }
}

interface GameContextValue {
  state: AppState;
  navigate(screen: Screen): void;
  startTutorial(): void;
  startAIMatch(difficulty: AIDifficulty, rivalId?: string): void;
  startLocalMatch(): void;
  startOnlineMatch(info: MatchInfo): void;
  /** Play a move for whoever is to move on this device. */
  makeMove(move: Move): boolean;
  resign(): void;
  sendEmote(emoji: string): void;
  /** Leave the results screen: rematch, next ladder rival, or home. Shows the paced break ad. */
  continueAfterMatch(next: 'rematch' | 'next' | 'home'): Promise<void>;
  /** Leave a match in progress (counts as a loss online). */
  quitMatch(): void;
  claimRewardedBonus(): Promise<boolean>;
  setProfile(profile: PlayerProfile): void;
  updateSettings(settings: Partial<PlayerSettings>): void;
  consumeRoomCode(): void;
  /** Open the CrazyGames log-in popup (guests only). */
  loginWithCrazyGames(): Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

const TUTORIAL_COACH: PlayerSetup = {
  name: 'Coach',
  avatar: 'avatar_2',
  pawnSkin: 'pawn_red',
  wallSkin: 'wall_default',
  ai: { difficulty: AIDifficulty.Easy, mistakeRate: 0.5 },
};

const QUICK_AI_NAMES: Record<AIDifficulty, string> = {
  easy: 'Bot · Easy',
  medium: 'Bot · Medium',
  hard: 'Bot · Hard',
  nightmare: 'Bot · Nightmare',
};

/** Keep the two pawns visually distinct when both players picked the same skin. */
function distinctLooks(mine: PlayerLook, theirs: PlayerLook): PlayerLook {
  if (mine.pawnSkin !== theirs.pawnSkin) return theirs;
  return { ...theirs, pawnSkin: mine.pawnSkin === 'pawn_red' ? 'pawn_blue' : 'pawn_red' };
}

const myLook = (p: PlayerProfile): PlayerLook => ({ pawnSkin: p.equippedPawnSkin, wallSkin: p.equippedWallSkin, avatar: resolveAvatar(p) });

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    ready: false,
    screen: 'home',
    previousScreen: 'home',
    // The real profile is read after the SDK is ready (it may live in the CrazyGames Data module).
    profile: createDefaultProfile(),
    gameState: null,
    match: null,
    localPlayerId: 0,
    rewards: null,
    bonusClaimed: false,
    emote: null,
    chatDisabled: false,
    pendingRoomCode: null,
  });

  const gmRef = useRef<GameManager | null>(null);
  const channelRef = useRef<GameChannel | null>(null);
  const matchRef = useRef<ActiveMatch | null>(null);
  const localIdRef = useRef<PlayerId>(0);
  const finishedMatchesRef = useRef(0);
  const chatDisabledRef = useRef(false);
  useEffect(() => { chatDisabledRef.current = state.chatDisabled; }, [state.chatDisabled]);

  // ----------------------------------------------------------
  // Boot: SDK → profile → land in gameplay for new players
  // ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sdk.initSDK();
      sdk.loadingStart();
      let profile = loadProfile();
      // Logged-in CrazyGames players play under their account name and picture.
      const crazyUser = await sdk.getCrazyUser();
      if (crazyUser) profile = linkCrazyGamesAccount(crazyUser);
      sdk.onCrazyLogin(user => {
        if (user) dispatch({ type: 'PROFILE', profile: linkCrazyGamesAccount(user) });
      });
      applyTheme(profile.settings.theme);
      soundManager.setMuted('player', !profile.settings.soundOn);

      const platform = sdk.getPlatformSettings();
      soundManager.setMuted('platform', platform.muteAudio);
      sdk.onPlatformSettingsChange(s => {
        soundManager.setMuted('platform', s.muteAudio);
        dispatch({ type: 'CHAT_DISABLED', value: s.disableChat });
      });
      sdk.onAdPlayback(playing => soundManager.setMuted('ad', playing));

      const roomCode = sdk.getInviteParam('room');
      sdk.loadingStop();
      if (cancelled) return;
      dispatch({ type: 'READY', profile, chatDisabled: platform.disableChat, pendingRoomCode: roomCode });

      if (roomCode) dispatch({ type: 'SCREEN', screen: 'online' });
      else if (!profile.tutorialDone) startTutorialRef.current();
    })();

    // Browsers only allow audio after a user gesture.
    const unlock = () => soundManager.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ----------------------------------------------------------
  // Match lifecycle
  // ----------------------------------------------------------
  const closeMatch = useCallback(() => {
    gmRef.current?.destroy();
    gmRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    matchRef.current = null;
    sdk.gameplayStop();
  }, []);

  const handleGameOver = useCallback((gm: GameManager, winner: PlayerId, reason: GameEndReason) => {
    const gs = gm.getState();
    const match = matchRef.current;
    if (!match) return;
    const localId = localIdRef.current;
    // Same-device matches always count as a win for this device (as in the original game).
    const won = match.kind === 'local' ? true : winner === localId;
    const rival = gs.players[opponentOf(localId)];

    if (match.kind === 'online') {
      if (reason === GameEndReason.Timeout && winner !== localId) channelRef.current?.sendTimeout();
      void import('../sdk/leaderboard').then(m => m.recordOnlineResult(won)).catch(e => console.warn('[Leaderboard]', e));
      // Keep the channel a moment so final messages arrive, then close it.
      const channel = channelRef.current;
      channelRef.current = null;
      setTimeout(() => channel?.close(), 1500);
    }

    const rewards = recordMatch({
      match,
      won,
      movesPlayed: gs.moveHistory.length,
      wallsPlaced: gs.board.walls.filter(w => w.placedBy === localId).length,
      rivalStepsLeft: Math.max(0, shortestPathLength(gs.board, rival.position, rival.goalRow)),
    });

    sdk.gameplayStop();
    finishedMatchesRef.current++;
    soundManager.play(won || match.kind === 'local' ? 'win' : 'lose');
    if (rewards.coins > 0) setTimeout(() => soundManager.play('coinEarn'), 500);
    if (rewards.levelAfter > rewards.levelBefore) setTimeout(() => soundManager.play('levelUp'), 900);
    if (rewards.newStars > 0 || rewards.newRank || match.kind === 'tutorial') sdk.happyTime();
    dispatch({ type: 'RESULTS', rewards });
  }, []);

  const launch = useCallback((options: { match: ActiveMatch; mode: GameMode; players: [PlayerSetup, PlayerSetup]; localPlayers: PlayerId[]; localPlayerId: PlayerId; timer?: boolean }) => {
    closeMatch();
    const gm = new GameManager({ mode: options.mode, players: options.players, localPlayers: options.localPlayers, timerEnabled: options.timer ?? true });
    gmRef.current = gm;
    matchRef.current = options.match;
    localIdRef.current = options.localPlayerId;

    gm.on('stateChanged', gameState => dispatch({ type: 'GAME_STATE', gameState }));
    gm.on('timerTick', ({ timer, currentTurn }) => {
      dispatch({ type: 'TIMER', timer });
      if (timer > 0 && timer <= 10 && options.localPlayers.includes(currentTurn)) soundManager.play('timerUrgent');
    });
    gm.on('moveMade', ({ move }) => soundManager.play(move.type === 'move' ? 'pawnMove' : 'wallPlace'));
    gm.on('invalidMove', () => soundManager.play('invalidMove'));
    gm.on('gameOver', ({ winner, reason }) => handleGameOver(gm, winner, reason));

    dispatch({ type: 'MATCH_STARTED', match: options.match, localPlayerId: options.localPlayerId });
    gm.start();
    sdk.gameplayStart();
  }, [closeMatch, handleGameOver]);

  const startTutorial = useCallback(() => {
    const p = loadProfile();
    const me: PlayerSetup = { name: p.username, ...myLook(p) };
    launch({
      match: { kind: 'tutorial' },
      mode: GameMode.VsAI,
      players: [me, { ...TUTORIAL_COACH, ...distinctLooks(myLook(p), TUTORIAL_COACH) }],
      localPlayers: [0],
      localPlayerId: 0,
      timer: false,
    });
  }, [launch]);
  const startTutorialRef = useRef(startTutorial);
  useEffect(() => { startTutorialRef.current = startTutorial; }, [startTutorial]);

  const startAIMatch = useCallback((difficulty: AIDifficulty, rivalId?: string) => {
    const p = loadProfile();
    const rival: LadderRival | undefined = rivalId ? findRival(rivalId) : undefined;
    const ai = rival?.ai ?? { difficulty, mistakeRate: 0 };
    const look: PlayerLook = rival
      ? { pawnSkin: rival.pawnSkin, wallSkin: rival.wallSkin, avatar: rival.avatar }
      : { pawnSkin: 'pawn_red', wallSkin: 'wall_default', avatar: 'avatar_7' };
    launch({
      match: { kind: 'ai', difficulty: ai.difficulty, rivalId },
      mode: GameMode.VsAI,
      players: [
        { name: p.username, ...myLook(p) },
        { name: rival?.name ?? QUICK_AI_NAMES[ai.difficulty], ai, ...distinctLooks(myLook(p), look) },
      ],
      localPlayers: [0],
      localPlayerId: 0,
    });
  }, [launch]);

  const startLocalMatch = useCallback(() => {
    const p = loadProfile();
    launch({
      match: { kind: 'local' },
      mode: GameMode.Local,
      players: [
        { name: p.username, ...myLook(p) },
        { name: 'Player 2', ...distinctLooks(myLook(p), { pawnSkin: 'pawn_red', wallSkin: 'wall_default', avatar: 'avatar_2' }) },
      ],
      localPlayers: [0, 1],
      localPlayerId: 0,
    });
  }, [launch]);

  const startOnlineMatch = useCallback((info: MatchInfo) => {
    const p = loadProfile();
    const localId: PlayerId = info.isHost ? 0 : 1;
    const remoteId = opponentOf(localId);
    const me: PlayerSetup = { name: p.username, ...myLook(p) };
    const them: PlayerSetup = { name: info.opponent.name || 'Opponent', ...distinctLooks(myLook(p), info.opponent) };
    const players: [PlayerSetup, PlayerSetup] = info.isHost ? [me, them] : [them, me];

    launch({ match: { kind: 'online', online: info }, mode: GameMode.Online, players, localPlayers: [localId], localPlayerId: localId });

    void import('../sdk/multiplayer').then(({ GameChannel }) => {
      const gm = gmRef.current;
      if (!gm) return;
      const channel = new GameChannel(info.gameId, {
        onMove: move => {
          if (!gm.makeMove(remoteId, move)) console.warn('[Online] rejected remote move (out of sync?)', move);
        },
        onEmote: emoji => {
          if (!chatDisabledRef.current) dispatch({ type: 'EMOTE', emote: { playerId: remoteId, emoji, at: Date.now() } });
        },
        onResign: () => gm.forceEnd(localId, GameEndReason.Resignation),
        onTimeout: () => gm.forceEnd(localId, GameEndReason.Timeout),
        onGone: () => gm.forceEnd(localId, GameEndReason.Disconnect),
      });
      channelRef.current = channel;
      void channel.connect();
      void import('../sdk/leaderboard').then(m => m.syncLeaderboardEntry()).catch(() => undefined);
    });
  }, [launch]);

  // ----------------------------------------------------------
  // In-match actions
  // ----------------------------------------------------------
  const makeMove = useCallback((move: Move): boolean => {
    const gm = gmRef.current;
    const match = matchRef.current;
    if (!gm || !match) return false;
    const gs = gm.getState();
    const mover = gs.currentTurn;
    if (match.kind !== 'local' && mover !== localIdRef.current) return false;
    const ok = gm.makeMove(mover, move);
    if (ok && match.kind === 'online') channelRef.current?.sendMove(move);
    return ok;
  }, []);

  const resign = useCallback(() => {
    const gm = gmRef.current;
    if (!gm) return;
    const match = matchRef.current;
    // In local mode, the player whose turn it is resigns.
    const loser = match?.kind === 'local' ? gm.getState().currentTurn : localIdRef.current;
    if (match?.kind === 'online') channelRef.current?.sendResign();
    gm.resign(loser);
  }, []);

  const sendEmote = useCallback((emoji: string) => {
    const gs = gmRef.current?.getState();
    if (!gs) return;
    const from = matchRef.current?.kind === 'local' ? gs.currentTurn : localIdRef.current;
    soundManager.play('emote');
    dispatch({ type: 'EMOTE', emote: { playerId: from, emoji, at: Date.now() } });
    if (matchRef.current?.kind === 'online') channelRef.current?.sendEmote(emoji);
  }, []);

  const quitMatch = useCallback(() => {
    const gm = gmRef.current;
    if (gm && gm.getState().phase === GamePhase.Playing && matchRef.current?.kind === 'online') {
      channelRef.current?.leave();
      void import('../sdk/leaderboard').then(m => m.recordOnlineResult(false)).catch(() => undefined);
    }
    closeMatch();
    dispatch({ type: 'MATCH_CLOSED' });
    dispatch({ type: 'SCREEN', screen: 'home' });
  }, [closeMatch]);

  const continueAfterMatch = useCallback(async (next: 'rematch' | 'next' | 'home') => {
    const match = state.match;
    if (finishedMatchesRef.current > 0 && finishedMatchesRef.current % MATCHES_PER_BREAK_AD === 0) {
      finishedMatchesRef.current = 0;
      await sdk.requestBreakAd();
    }
    closeMatch();
    dispatch({ type: 'MATCH_CLOSED' });

    if (next === 'home' || !match) {
      dispatch({ type: 'SCREEN', screen: 'home' });
      return;
    }
    if (match.kind === 'local') startLocalMatch();
    else if (match.kind === 'tutorial') dispatch({ type: 'SCREEN', screen: 'home' });
    else if (match.kind === 'online') dispatch({ type: 'SCREEN', screen: 'online' });
    else if (match.kind === 'ai') {
      const rivalId = next === 'next' ? nextRivalId(match.rivalId) : match.rivalId;
      const rival = rivalId ? findRival(rivalId) : undefined;
      startAIMatch(rival?.ai.difficulty ?? match.difficulty, rivalId);
    }
  }, [state.match, closeMatch, startLocalMatch, startAIMatch]);

  const claimRewardedBonus = useCallback(async () => {
    const rewards = state.rewards;
    if (!rewards || state.bonusClaimed || rewards.matchCoins <= 0) return false;
    const watched = await sdk.requestRewardedAd();
    if (!watched) return false;
    const profile = addCoins(rewards.matchCoins * (REWARDED_COIN_MULTIPLIER - 1));
    soundManager.play('coinEarn');
    dispatch({ type: 'BONUS_CLAIMED', profile });
    return true;
  }, [state.rewards, state.bonusClaimed]);

  // ----------------------------------------------------------
  // Profile & navigation
  // ----------------------------------------------------------
  const navigate = useCallback((screen: Screen) => {
    soundManager.play('click');
    dispatch({ type: 'SCREEN', screen });
  }, []);

  const setProfile = useCallback((profile: PlayerProfile) => dispatch({ type: 'PROFILE', profile }), []);

  const updateSettings = useCallback((settings: Partial<PlayerSettings>) => {
    const profile = updateProfile({ settings: { ...loadProfile().settings, ...settings } });
    applyTheme(profile.settings.theme);
    soundManager.setMuted('player', !profile.settings.soundOn);
    dispatch({ type: 'PROFILE', profile });
  }, []);

  const consumeRoomCode = useCallback(() => dispatch({ type: 'ROOM_CODE_USED' }), []);

  const loginWithCrazyGames = useCallback(async () => {
    const user = await sdk.showCrazyLogin();
    if (user) dispatch({ type: 'PROFILE', profile: linkCrazyGamesAccount(user) });
  }, []);

  const value: GameContextValue = {
    state, navigate, startTutorial, startAIMatch, startLocalMatch, startOnlineMatch,
    makeMove, resign, sendEmote, continueAfterMatch, quitMatch, claimRewardedBonus,
    setProfile, updateSettings, consumeRoomCode, loginWithCrazyGames,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

function nextRivalId(currentId?: string): string | undefined {
  return currentId ? rivalAfter(currentId)?.id ?? currentId : undefined;
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}
