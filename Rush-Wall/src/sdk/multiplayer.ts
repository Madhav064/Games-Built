import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, getCurrentUserId, ensureAuthenticated } from './supabase';
import type { Move } from '../game/types';

export type MatchStatus = 'idle' | 'searching' | 'matched' | 'error';

export interface MatchInfo {
  gameId: string;
  opponentId: string;
  isHost: boolean;
  opponentName: string;
  opponentPawnSkin: string;
  opponentWallSkin: string;
  opponentAvatar: string;
}

let matchmakingChannel: RealtimeChannel | null = null;
let gameChannel: RealtimeChannel | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let matchBroadcastInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Robust matchmaking using ONLY broadcasts with retries.
 * No Supabase Presence — it has timing issues.
 *
 * Flow:
 * 1. Both players join "matchmaking_lobby" channel.
 * 2. Both send "ping" every 1s with their userId + profile.
 * 3. On receiving a ping, store the opponent info.
 *    - The player with the LOWER userId is the host.
 *    - The host generates a gameId, calls onMatched immediately,
 *      and keeps broadcasting "match_made" every 500ms so the guest gets it.
 * 4. The guest receives "match_made", calls onMatched.
 * 5. Retries ensure no messages are lost.
 */
export async function joinQueue(
  profile: any,
  onMatched: (match: MatchInfo) => void,
  onStatusChange: (status: MatchStatus) => void
) {
  await ensureAuthenticated();
  const userId = await getCurrentUserId();
  if (!userId) {
    onStatusChange('error');
    return;
  }

  onStatusChange('searching');
  cleanupMatchmaking();

  const myProfile = {
    userId,
    username: profile.username,
    equippedPawnSkin: profile.equippedPawnSkin,
    equippedWallSkin: profile.equippedWallSkin,
    equippedAvatar: profile.equippedAvatar,
  };

  let isMatched = false;
  let matchGameId: string | null = null;

  matchmakingChannel = supabase.channel('matchmaking_lobby');

  matchmakingChannel
    .on('broadcast', { event: 'ping' }, ({ payload: sender }) => {
      if (isMatched || sender.userId === userId) return;

      // Am I the host? (lower userId)
      if (userId < sender.userId && !matchGameId) {
        matchGameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        isMatched = true;
        stopIntervals();

        // Keep sending match_made so the guest definitely gets it
        let sendCount = 0;
        matchBroadcastInterval = setInterval(() => {
          if (!matchmakingChannel || sendCount > 15) {
            if (matchBroadcastInterval) { clearInterval(matchBroadcastInterval); matchBroadcastInterval = null; }
            if (matchmakingChannel) { matchmakingChannel.unsubscribe(); matchmakingChannel = null; }
            return;
          }
          matchmakingChannel.send({
            type: 'broadcast',
            event: 'match_made',
            payload: { gameId: matchGameId, hostId: userId, guestId: sender.userId, hostProfile: myProfile },
          });
          sendCount++;
        }, 300);

        // Also send first one immediately
        matchmakingChannel?.send({
          type: 'broadcast',
          event: 'match_made',
          payload: { gameId: matchGameId, hostId: userId, guestId: sender.userId, hostProfile: myProfile },
        });

        onMatched({
          gameId: matchGameId,
          opponentId: sender.userId,
          isHost: true,
          opponentName: sender.username || 'Opponent',
          opponentPawnSkin: sender.equippedPawnSkin || 'pawn_red',
          opponentWallSkin: sender.equippedWallSkin || 'wall_default',
          opponentAvatar: sender.equippedAvatar || 'avatar_1',
        });
        onStatusChange('matched');
      }
    })
    .on('broadcast', { event: 'match_made' }, ({ payload: data }) => {
      if (isMatched) return;
      if (data.guestId !== userId) return;

      isMatched = true;
      stopIntervals();

      setTimeout(() => {
        if (matchmakingChannel) { matchmakingChannel.unsubscribe(); matchmakingChannel = null; }
      }, 1000);

      onMatched({
        gameId: data.gameId,
        opponentId: data.hostId,
        isHost: false,
        opponentName: data.hostProfile?.username || 'Opponent',
        opponentPawnSkin: data.hostProfile?.equippedPawnSkin || 'pawn_red',
        opponentWallSkin: data.hostProfile?.equippedWallSkin || 'wall_default',
        opponentAvatar: data.hostProfile?.equippedAvatar || 'avatar_1',
      });
      onStatusChange('matched');
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Send first ping immediately
        matchmakingChannel!.send({ type: 'broadcast', event: 'ping', payload: myProfile });

        // Keep pinging every 1s so the other player discovers us
        pingInterval = setInterval(() => {
          if (isMatched || !matchmakingChannel) return;
          matchmakingChannel.send({ type: 'broadcast', event: 'ping', payload: myProfile });
        }, 1000);
      }
    });
}

function stopIntervals() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

function cleanupMatchmaking() {
  stopIntervals();
  if (matchBroadcastInterval) { clearInterval(matchBroadcastInterval); matchBroadcastInterval = null; }
  if (matchmakingChannel) { matchmakingChannel.unsubscribe(); matchmakingChannel = null; }
}

export function cancelQueue() {
  cleanupMatchmaking();
}

// ============================================================
// In-Game Communication
// ============================================================

export function joinGameChannel(
  gameId: string,
  onMoveReceived: (move: Move) => void,
  onOpponentDisconnected: () => void
) {
  if (gameChannel) { gameChannel.unsubscribe(); }

  gameChannel = supabase.channel(gameId);
  gameChannel
    .on('broadcast', { event: 'game_move' }, ({ payload }) => {
      onMoveReceived(payload.move as Move);
    })
    .on('broadcast', { event: 'player_left' }, () => {
      onOpponentDisconnected();
    })
    .subscribe();
}

export function sendMove(move: Move) {
  if (gameChannel) {
    gameChannel.send({ type: 'broadcast', event: 'game_move', payload: { move } });
  }
}

export function leaveGameChannel() {
  if (gameChannel) {
    gameChannel.send({ type: 'broadcast', event: 'player_left', payload: {} });
    setTimeout(() => {
      if (gameChannel) { gameChannel.unsubscribe(); gameChannel = null; }
    }, 200);
  }
}
