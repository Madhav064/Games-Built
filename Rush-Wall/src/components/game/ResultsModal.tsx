// ============================================================
// Wall Duel — Match results: stars, XP, coins, rewarded bonus
// ============================================================

import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { GameEndReason, GameMode } from '../../game/types';
import { opponentOf } from '../../game/rules';
import { levelProgress, rankForLevel } from '../../progression/xp';
import { findRival, rivalAfter } from '../../progression/ladder';
import { REWARDED_COIN_MULTIPLIER } from '../../config/balance';
import { Modal } from '../shared/Modal';

export function ResultsModal() {
  const { state, continueAfterMatch, claimRewardedBonus } = useGame();
  const { gameState, rewards, match, localPlayerId, bonusClaimed } = state;
  const [busy, setBusy] = useState(false);
  const [xpShown, setXpShown] = useState(0);

  useEffect(() => {
    if (!rewards) return;
    const t = setTimeout(() => setXpShown(levelProgress(rewards.levelAfter, rewards.xpAfter)), 250);
    return () => clearTimeout(t);
  }, [rewards]);

  if (!gameState || !rewards || !match || gameState.winner === null) return null;

  const isLocal = gameState.mode === GameMode.Local;
  const winner = gameState.players[gameState.winner];
  const loser = gameState.players[opponentOf(gameState.winner)];
  const won = isLocal || gameState.winner === localPlayerId;
  const rival = match.kind === 'ai' && match.rivalId ? findRival(match.rivalId) : undefined;
  const nextRival = rival && won ? rivalAfter(rival.id) : undefined;
  const leveledUp = rewards.levelAfter > rewards.levelBefore;
  const rank = rankForLevel(rewards.levelAfter);

  const reason: Record<GameEndReason, string> = {
    goal_reached: `${winner.name} reached the far side`,
    resignation: `${loser.name} resigned`,
    timeout: `${loser.name} ran out of time`,
    disconnect: `${loser.name} left the match`,
  };

  const go = async (next: 'rematch' | 'next' | 'home') => {
    setBusy(true);
    await continueAfterMatch(next);
  };

  const watchAd = async () => {
    setBusy(true);
    await claimRewardedBonus();
    setBusy(false);
  };

  return (
    <Modal>
      <div className={`result-banner ${won ? 'win' : 'lose'}`}>
        {isLocal ? `${winner.name} wins!` : match.kind === 'tutorial' ? (won ? 'Tutorial complete!' : 'Good try!') : won ? 'Victory!' : 'Defeat'}
      </div>
      <p className="result-reason">{gameState.endReason ? reason[gameState.endReason] : ''}</p>

      {rival && won && (
        <div className="result-stars" aria-label={`${rewards.stars} of 3 stars`}>
          {[1, 2, 3].map(i => (
            <span key={i} className={i <= rewards.stars ? 'star on' : 'star'} style={{ animationDelay: `${i * 0.15}s` }}>★</span>
          ))}
          <div className="stars-hint">Win while {rival.name} is still far from their goal to earn more stars.</div>
        </div>
      )}

      <div className="result-xp">
        <div className="xp-row">
          <span className="rank-chip" style={{ color: rank.color }}>{rank.icon} {rank.name}</span>
          <span>Level {rewards.levelAfter}</span>
          <span className="xp-gain">+{rewards.xpGained} XP</span>
        </div>
        <div className="xp-bar"><div className="xp-fill" style={{ width: `${Math.round(xpShown * 100)}%` }} /></div>
        {leveledUp && <div className="level-up">⬆ Level up!{rewards.newRank ? ` You reached ${rewards.newRank.name}!` : ''}</div>}
      </div>

      {rewards.lines.length > 0 && (
        <ul className="reward-lines">
          {rewards.lines.map((l, i) => (
            <li key={i}><span>{l.label}</span><span className="coin-amount">+{l.coins} 🪙</span></li>
          ))}
          {bonusClaimed && (
            <li className="bonus"><span>Ad bonus</span><span className="coin-amount">+{rewards.matchCoins * (REWARDED_COIN_MULTIPLIER - 1)} 🪙</span></li>
          )}
        </ul>
      )}

      {rewards.matchCoins > 0 && !bonusClaimed && (
        <button className="btn btn-reward btn-full" disabled={busy} onClick={watchAd}>
          ▶ Watch an ad: {REWARDED_COIN_MULTIPLIER}× coins (+{rewards.matchCoins * (REWARDED_COIN_MULTIPLIER - 1)})
        </button>
      )}

      <div className="result-actions">
        {match.kind === 'tutorial' && <button className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={() => go('home')}>Continue</button>}
        {nextRival && <button className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={() => go('next')}>Next rival: {nextRival.name} ▶</button>}
        {match.kind === 'online' && <button className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={() => go('rematch')}>Find a new match</button>}
        {(match.kind === 'ai' || match.kind === 'local') && (
          <button className={`btn ${nextRival ? 'btn-secondary' : 'btn-primary btn-lg'} btn-full`} disabled={busy} onClick={() => go('rematch')}>
            {rival ? (won ? 'Replay for more stars' : 'Try again') : 'Play again'}
          </button>
        )}
        {match.kind !== 'tutorial' && <button className="btn btn-ghost btn-full" disabled={busy} onClick={() => go('home')}>Home</button>}
      </div>
    </Modal>
  );
}
