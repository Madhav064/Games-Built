// ============================================================
// Wall Duel — Global leaderboard (online wins)
// ============================================================

import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { avatarImage } from '../../store/cosmetics';
import { isOnlineConfigured } from '../../sdk/supabase';
import type { LeaderboardEntry } from '../../sdk/leaderboard';

type Load =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; players: LeaderboardEntry[]; userId: string; rank: number | null; wins: number; losses: number };

export function LeaderboardScreen() {
  const { navigate } = useGame();
  const [data, setData] = useState<Load>(() => (isOnlineConfigured() ? { state: 'loading' } : { state: 'error' }));

  useEffect(() => {
    if (!isOnlineConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const lb = await import('../../sdk/leaderboard');
        const [players, me] = await Promise.all([lb.getTopPlayers(), lb.getMyStanding()]);
        if (!cancelled) setData({ state: 'ready', players, ...me });
      } catch (e) {
        console.warn('[Leaderboard]', e);
        if (!cancelled) setData({ state: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <h1 className="screen-title">Leaderboard</h1>
      </header>
      <p className="screen-sub">
        Ranked by online wins. Names, avatars and online results are public.{' '}
        <button className="link-btn small" onClick={() => navigate('privacy')}>Privacy policy</button>
      </p>

      {data.state === 'loading' && <div className="card muted center">Loading…</div>}
      {data.state === 'error' && (
        <div className="card center">
          <p className="muted">The leaderboard isn't available right now.</p>
          <button className="btn btn-secondary" onClick={() => navigate('home')}>← Home</button>
        </div>
      )}
      {data.state === 'ready' && (
        <>
          <div className="card my-standing">
            <div>
              <div className="muted small">Your rank</div>
              <div className="standing-rank">{data.rank ? `#${data.rank}` : 'Unranked'}</div>
            </div>
            <div className="standing-record">{data.wins}W · {data.losses}L</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('online')}>Play online</button>
          </div>
          <ol className="lb-list">
            {data.players.map((p, i) => (
              <li key={p.id} className={`lb-row ${p.user_id === data.userId ? 'me' : ''}`}>
                <span className={`lb-pos pos-${i + 1}`}>{i + 1}</span>
                <img src={avatarImage(p.avatar)} alt="" />
                <span className="lb-name">{p.username}</span>
                <span className="lb-wins">{p.wins} W</span>
              </li>
            ))}
            {data.players.length === 0 && <li className="muted center">No online matches yet. Be the first!</li>}
          </ol>
        </>
      )}
    </div>
  );
}
