// ============================================================
// Wall Duel — Online: quick match (with computer fallback) and
// private rooms shared by invite link or code.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { AIDifficulty } from '../../game/types';
import { QUICK_MATCH_OFFER_AI_AFTER_SECONDS } from '../../config/balance';
import { isOnlineConfigured } from '../../sdk/supabase';
import { createInviteLink } from '../../sdk/crazygames';
import type { MatchInfo, SearchStatus } from '../../sdk/multiplayer';
import { soundManager } from '../../audio/soundManager';
import { resolveAvatar } from '../../store/profile';

type View = 'menu' | 'quick' | 'host' | 'join';

export function OnlineScreen() {
  const { state, navigate, startOnlineMatch, startAIMatch, consumeRoomCode } = useGame();
  const { profile, pendingRoomCode } = state;
  const [view, setView] = useState<View>('menu');
  const [status, setStatus] = useState<SearchStatus>('connecting');
  const [seconds, setSeconds] = useState(0);
  const [offerAI, setOfferAI] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const me = {
    name: profile.username,
    pawnSkin: profile.equippedPawnSkin,
    wallSkin: profile.equippedWallSkin,
    avatar: resolveAvatar(profile),
  };

  const stopSearch = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => stopSearch, [stopSearch]);

  const onMatched = useCallback((info: MatchInfo) => {
    soundManager.play('turnStart');
    stopRef.current = null;
    setTimeout(() => startOnlineMatch(info), 400);
  }, [startOnlineMatch]);

  const startQuick = useCallback(async () => {
    setView('quick');
    setSeconds(0);
    setOfferAI(false);
    const mp = await import('../../sdk/multiplayer');
    const handle = await mp.startQuickMatch(me, onMatched, setStatus);
    stopRef.current = handle.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMatched, profile]);

  const startHost = useCallback(async () => {
    const mp = await import('../../sdk/multiplayer');
    const code = mp.newRoomCode();
    setRoomCode(code);
    setView('host');
    const handle = await mp.hostRoom(code, me, onMatched, setStatus);
    stopRef.current = handle.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMatched, profile]);

  const startJoin = useCallback(async (code: string) => {
    const mp = await import('../../sdk/multiplayer');
    const clean = mp.normalizeRoomCode(code);
    if (clean.length < 5) return;
    setRoomCode(clean);
    setView('join');
    const handle = await mp.joinRoom(clean, me, onMatched, setStatus);
    stopRef.current = handle.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMatched, profile]);

  // Arrived through a friend's invite link.
  useEffect(() => {
    if (!pendingRoomCode) return;
    consumeRoomCode();
    void startJoin(pendingRoomCode);
  }, [pendingRoomCode, consumeRoomCode, startJoin]);

  // Searching clock + computer fallback offer.
  useEffect(() => {
    if (view !== 'quick' || status !== 'searching') return;
    const t = setInterval(() => setSeconds(s => {
      if (s + 1 >= QUICK_MATCH_OFFER_AI_AFTER_SECONDS) setOfferAI(true);
      return s + 1;
    }), 1000);
    return () => clearInterval(t);
  }, [view, status]);

  const back = () => {
    stopSearch();
    if (view === 'menu') navigate('home');
    else setView('menu');
  };

  const copyLink = async () => {
    const link = createInviteLink({ room: roomCode });
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this invite link:', link);
    }
  };

  if (!isOnlineConfigured()) {
    return (
      <div className="screen menu-screen center-screen">
        <div className="card online-card">
          <h1 className="screen-title">Online</h1>
          <p className="muted">Online play isn't available in this build.</p>
          <button className="btn btn-secondary btn-full" onClick={() => navigate('home')}>← Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen menu-screen center-screen">
      <div className="card online-card">
        <h1 className="screen-title">Online</h1>

        {view === 'menu' && (
          <>
            <button className="btn btn-primary btn-lg btn-full" onClick={startQuick}>⚡ Quick match</button>
            <button className="btn btn-secondary btn-full" onClick={startHost}>🔗 Invite a friend</button>
            <div className="join-row">
              <input
                placeholder="Room code"
                value={joinCode}
                maxLength={5}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && startJoin(joinCode)}
                aria-label="Room code"
              />
              <button className="btn btn-secondary" disabled={joinCode.length < 5} onClick={() => startJoin(joinCode)}>Join</button>
            </div>
            <p className="privacy-note">
              Online play shares your name and avatar with your opponent and saves your online wins and losses on the public leaderboard.{' '}
              <button className="link-btn small" onClick={() => navigate('privacy')}>Privacy policy</button>
            </p>
          </>
        )}

        {view === 'quick' && (
          <div className="searching">
            <div className={`radar ${status === 'matched' ? 'found' : ''}`}><span /><span /><span /></div>
            <p className="search-status">
              {status === 'connecting' && 'Connecting…'}
              {status === 'searching' && `Looking for an opponent · ${seconds}s`}
              {status === 'matched' && 'Opponent found!'}
              {status === 'error' && "Couldn't reach the game server. Check your connection."}
            </p>
            {offerAI && status === 'searching' && (
              <div className="offer-ai">
                <p>Nobody's around right now. Play the computer while you wait?</p>
                <button className="btn btn-primary btn-full" onClick={() => { stopSearch(); startAIMatch(AIDifficulty.Medium); }}>
                  🤖 Play vs Computer
                </button>
                <button className="btn btn-ghost btn-full" onClick={() => { setOfferAI(false); setSeconds(0); }}>Keep searching</button>
              </div>
            )}
          </div>
        )}

        {view === 'host' && (
          <div className="room">
            <p className="muted">Share this code or link with a friend:</p>
            <div className="room-code">{roomCode}</div>
            <button className="btn btn-primary btn-full" onClick={copyLink}>{copied ? '✓ Link copied' : 'Copy invite link'}</button>
            <p className="search-status">
              {status === 'connecting' && 'Opening room…'}
              {status === 'waiting_for_friend' && 'Waiting for your friend to join…'}
              {status === 'matched' && 'Friend joined!'}
              {status === 'error' && "Couldn't open the room. Try again."}
            </p>
          </div>
        )}

        {view === 'join' && (
          <div className="room">
            <div className="room-code">{roomCode}</div>
            <p className="search-status">
              {status === 'connecting' && 'Connecting…'}
              {status === 'searching' && 'Joining your friend… (they must have the room open)'}
              {status === 'matched' && 'Joined!'}
              {status === 'error' && "Couldn't join. Check the code and try again."}
            </p>
          </div>
        )}

        <button className="btn btn-ghost btn-full" onClick={back}>{view === 'menu' ? '← Back' : 'Cancel'}</button>
      </div>
    </div>
  );
}
