// ============================================================
// Wall Duel — Ladder: climb through 15 computer rivals
// ============================================================

import { useGame } from '../../context/GameContext';
import { LADDER, ALL_RIVALS, isRivalUnlocked, totalStars } from '../../progression/ladder';
import { avatarImage } from '../../store/cosmetics';
import { STAR_MARGINS } from '../../config/balance';
import { ProfileChips } from '../shared/ProfileChips';

export function LadderScreen() {
  const { state, startAIMatch } = useGame();
  const stars = state.profile.ladderStars;

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <h1 className="screen-title">Ladder</h1>
        <ProfileChips />
      </header>
      <p className="screen-sub">
        {totalStars(stars)} / {ALL_RIVALS.length * 3} ★ · Win for 1 star, win while your rival is {STAR_MARGINS.twoStars}+ squares from their goal for 2, {STAR_MARGINS.threeStars}+ for 3.
      </p>

      <div className="ladder">
        {LADDER.map(tier => (
          <section key={tier.id} className="ladder-tier">
            <h2 className="tier-name">{tier.name}</h2>
            <div className="rival-row">
              {tier.rivals.map(r => {
                const unlocked = isRivalUnlocked(r.id, stars);
                const s = stars[r.id] ?? 0;
                return (
                  <button
                    key={r.id}
                    className={`rival-card ${unlocked ? '' : 'locked'} ${s === 3 ? 'mastered' : ''}`}
                    disabled={!unlocked}
                    onClick={() => startAIMatch(r.ai.difficulty, r.id)}
                  >
                    <img src={avatarImage(r.avatar)} alt="" />
                    <span className="rival-name">{unlocked ? r.name : '???'}</span>
                    <span className="rival-tag">{unlocked ? r.tagline : 'Beat the previous rival'}</span>
                    <span className="rival-stars">{[1, 2, 3].map(i => <span key={i} className={i <= s ? 'on' : ''}>★</span>)}</span>
                    {!unlocked && <span className="lock">🔒</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
