// ============================================================
// Wall Duel — Online multiplayer over Supabase Realtime broadcast
// No game server: both clients run the same rules engine and
// exchange moves. Quick match, friend rooms and in-game sync.
// ============================================================

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getUserId } from './supabase';
import type { Move, PlayerLook } from '../game/types';
import { CHANNELS } from '../config/brand';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from '../config/balance';

export interface OnlinePlayer extends PlayerLook {
  userId: string;
  name: string;
}

export interface MatchInfo {
  gameId: string;
  /** Host plays as player 0 (moves first). */
  isHost: boolean;
  opponent: OnlinePlayer;
}

export type SearchStatus = 'connecting' | 'searching' | 'waiting_for_friend' | 'matched' | 'error';

type MeInput = Omit<OnlinePlayer, 'userId'>;

interface Handshake {
  stop(): void;
}

const newGameId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

// ------------------------------------------------------------
// Quick match
// ------------------------------------------------------------
/**
 * Join the public lobby. Players announce themselves every second;
 * the one with the lower id hosts and confirms the match repeatedly
 * until the guest has surely received it.
 */
export async function startQuickMatch(
  me: MeInput,
  onMatched: (match: MatchInfo) => void,
  onStatus: (status: SearchStatus) => void,
): Promise<Handshake> {
  onStatus('connecting');
  let channel: RealtimeChannel | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let confirmTimer: ReturnType<typeof setInterval> | null = null;
  let matched = false;

  const stop = () => {
    if (pingTimer) clearInterval(pingTimer);
    if (confirmTimer) clearInterval(confirmTimer);
    pingTimer = confirmTimer = null;
    const c = channel;
    channel = null;
    if (c) setTimeout(() => void c.unsubscribe(), 600);
  };

  try {
    const [supabase, userId] = await Promise.all([getSupabase(), getUserId()]);
    const self: OnlinePlayer = { ...me, userId };
    channel = supabase.channel(CHANNELS.lobby);

    channel
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        const other = payload as OnlinePlayer;
        // The lower id hosts; ignore our own pings and players who will host us.
        if (matched || userId >= other.userId) return;
        // We host.
        matched = true;
        if (pingTimer) clearInterval(pingTimer);
        const gameId = newGameId();
        const confirm = { gameId, hostId: userId, guestId: other.userId, host: self };
        let sent = 0;
        const send = () => void channel?.send({ type: 'broadcast', event: 'match', payload: confirm });
        send();
        confirmTimer = setInterval(() => (++sent > 12 ? stop() : send()), 300);
        onStatus('matched');
        onMatched({ gameId, isHost: true, opponent: other });
      })
      .on('broadcast', { event: 'match' }, ({ payload }) => {
        const { gameId, guestId, host } = payload as { gameId: string; guestId: string; host: OnlinePlayer };
        if (matched || guestId !== userId) return;
        matched = true;
        stop();
        onStatus('matched');
        onMatched({ gameId, isHost: false, opponent: host });
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          onStatus('searching');
          const ping = () => { if (!matched) void channel?.send({ type: 'broadcast', event: 'ping', payload: self }); };
          ping();
          pingTimer = setInterval(ping, 1000);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onStatus('error');
        }
      });
  } catch (e) {
    console.warn('[Multiplayer] quick match failed', e);
    onStatus('error');
  }
  return { stop };
}

// ------------------------------------------------------------
// Friend rooms (invite link / room code)
// ------------------------------------------------------------
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(): string {
  return Array.from({ length: 5 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
}
export const normalizeRoomCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/** Host a private room and wait for a friend to join with the code. */
export async function hostRoom(
  code: string,
  me: MeInput,
  onMatched: (match: MatchInfo) => void,
  onStatus: (status: SearchStatus) => void,
): Promise<Handshake> {
  return roomHandshake(code, me, true, onMatched, onStatus);
}

/** Join a friend's room. */
export async function joinRoom(
  code: string,
  me: MeInput,
  onMatched: (match: MatchInfo) => void,
  onStatus: (status: SearchStatus) => void,
): Promise<Handshake> {
  return roomHandshake(code, me, false, onMatched, onStatus);
}

async function roomHandshake(
  code: string,
  me: MeInput,
  isHost: boolean,
  onMatched: (match: MatchInfo) => void,
  onStatus: (status: SearchStatus) => void,
): Promise<Handshake> {
  onStatus('connecting');
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let matched = false;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const c = channel;
    channel = null;
    if (c) setTimeout(() => void c.unsubscribe(), 600);
  };

  try {
    const [supabase, userId] = await Promise.all([getSupabase(), getUserId()]);
    const self: OnlinePlayer = { ...me, userId };
    channel = supabase.channel(CHANNELS.room(code));

    if (isHost) {
      channel.on('broadcast', { event: 'join' }, ({ payload }) => {
        const guest = payload as OnlinePlayer;
        if (matched || guest.userId === userId) return;
        matched = true;
        const start = { gameId: newGameId(), guestId: guest.userId, host: self };
        let sent = 0;
        const send = () => void channel?.send({ type: 'broadcast', event: 'start', payload: start });
        send();
        timer = setInterval(() => (++sent > 12 ? stop() : send()), 300);
        onStatus('matched');
        onMatched({ gameId: start.gameId, isHost: true, opponent: guest });
      });
    } else {
      channel.on('broadcast', { event: 'start' }, ({ payload }) => {
        const { gameId, guestId, host } = payload as { gameId: string; guestId: string; host: OnlinePlayer };
        if (matched || guestId !== userId) return;
        matched = true;
        stop();
        onStatus('matched');
        onMatched({ gameId, isHost: false, opponent: host });
      });
    }

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        onStatus(isHost ? 'waiting_for_friend' : 'searching');
        if (!isHost) {
          const join = () => { if (!matched) void channel?.send({ type: 'broadcast', event: 'join', payload: self }); };
          join();
          timer = setInterval(join, 1000);
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onStatus('error');
      }
    });
  } catch (e) {
    console.warn('[Multiplayer] room failed', e);
    onStatus('error');
  }
  return { stop };
}

// ------------------------------------------------------------
// In-game channel
// ------------------------------------------------------------
export interface GameChannelHandlers {
  onMove(move: Move): void;
  onEmote(emoji: string): void;
  onResign(): void;
  /** Opponent says they ran out of time. */
  onTimeout(): void;
  /** Opponent pressed Rematch on the results screen. */
  onRematch(): void;
  /** Opponent left on purpose or stopped responding. */
  onGone(): void;
}

/**
 * One connection between two players. It outlives a single match:
 * after a match both players can press Rematch and play again in the
 * same room ("rooms kept across rounds"). Each match is a numbered round.
 */
export class GameChannel {
  private channel: RealtimeChannel | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSeen = Date.now();
  private round = 1;
  private sentSeq = 0;
  private receivedSeq = 0;
  private gone = false;
  private readonly onPageHide = () => this.leave();
  private readonly gameId: string;
  private handlers: GameChannelHandlers;

  constructor(gameId: string, handlers: GameChannelHandlers) {
    this.gameId = gameId;
    this.handlers = handlers;
  }

  get isGone(): boolean {
    return this.gone;
  }

  /** Point events at the current match (a rematch creates a new match). */
  setHandlers(handlers: GameChannelHandlers): void {
    this.handlers = handlers;
  }

  /** Start the next round: move numbering restarts and old-round messages are ignored. */
  nextRound(): void {
    this.round++;
    this.sentSeq = 0;
    this.receivedSeq = 0;
  }

  async connect(): Promise<void> {
    const supabase = await getSupabase();
    const channel = supabase.channel(CHANNELS.game(this.gameId));
    this.channel = channel;

    const seen = () => { this.lastSeen = Date.now(); };
    const current = (payload: unknown) => (payload as { round?: number }).round === this.round;
    channel
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        seen();
        const { seq, move } = payload as { seq: number; move: Move };
        if (!current(payload) || seq <= this.receivedSeq) return; // other round or duplicate
        this.receivedSeq = seq;
        this.handlers.onMove(move);
      })
      .on('broadcast', { event: 'emote' }, ({ payload }) => { seen(); this.handlers.onEmote((payload as { emoji: string }).emoji); })
      .on('broadcast', { event: 'resign' }, ({ payload }) => { seen(); if (current(payload)) this.handlers.onResign(); })
      .on('broadcast', { event: 'timeout' }, ({ payload }) => { seen(); if (current(payload)) this.handlers.onTimeout(); })
      .on('broadcast', { event: 'rematch' }, ({ payload }) => { seen(); if (current(payload)) this.handlers.onRematch(); })
      .on('broadcast', { event: 'hb' }, seen)
      .on('broadcast', { event: 'leave' }, () => this.markGone())
      .subscribe(status => {
        if (status === 'SUBSCRIBED') this.startHeartbeat();
      });

    window.addEventListener('pagehide', this.onPageHide);
  }

  sendMove(move: Move): void {
    this.send('move', { round: this.round, seq: ++this.sentSeq, move });
  }
  sendEmote(emoji: string): void { this.send('emote', { emoji }); }
  sendResign(): void { this.send('resign', { round: this.round }); }
  sendTimeout(): void { this.send('timeout', { round: this.round }); }
  /** Ask for a rematch of the round that just ended. */
  sendRematch(): void { this.send('rematch', { round: this.round }); }

  /** Tell the opponent we're leaving, then disconnect. */
  leave(): void {
    if (!this.channel) return;
    this.send('leave', {});
    this.close();
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    window.removeEventListener('pagehide', this.onPageHide);
    const c = this.channel;
    this.channel = null;
    if (c) setTimeout(() => void c.unsubscribe(), 300);
  }

  private startHeartbeat(): void {
    this.lastSeen = Date.now();
    this.heartbeat = setInterval(() => {
      this.send('hb', {});
      if (Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) this.markGone();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private markGone(): void {
    if (this.gone) return;
    this.gone = true;
    this.handlers.onGone();
  }

  private send(event: string, payload: object): void {
    void this.channel?.send({ type: 'broadcast', event, payload });
  }
}
