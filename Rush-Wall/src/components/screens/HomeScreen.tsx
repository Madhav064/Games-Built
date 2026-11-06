// ============================================================
// Wall Duel — Home: one tap to the next rival, plus every mode
// ============================================================

import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { AIDifficulty } from '../../game/types';
import { GAME_NAME } from '../../config/brand';
import { LADDER, nextRival, totalStars, ALL_RIVALS } from '../../progression/ladder';
import { avatarImage } from '../../store/cosmetics';
import { ProfileChips } from '../shared/ProfileChips';

const DIFFICULTIES: { id: AIDifficulty; label: string; desc: string; stars: number }[] = [
  { id: AIDifficulty.Easy, label: 'Easy', desc: 'Relaxed, great for learning', stars: 1 },
  { id: AIDifficulty.Medium, label: 'Medium', desc: 'Races and blocks when behind', stars: 2 },
  { id: AIDifficulty.Hard, label: 'Hard', desc: 'Thinks a couple of moves ahead', stars: 3 },
  { id: AIDifficulty.Nightmare, label: 'Nightmare', desc: 'Deep search. Bring your best.', stars: 4 },
];

export function HomeScreen() {
  const { state, navigate, startAIMatch, startLocalMatch, updateSettings } = useGame();
  const { profile } = state;
  const [picker, setPicker] = useState(false);
  const rival = nextRival(profile.ladderStars);
  const tier = LADDER.find(t => t.rivals.some(r => r.id === rival.id))!;
  const stars = profile.ladderStars[rival.id] ?? 0;

  return (
    <div className="screen menu-screen home-screen">
      <header className="menu-header">
        <div className="brand">
          <img src="./icon.svg" alt="" className="brand-icon" />
          <span className="brand-name">{GAME_NAME}</span>
        </div>
        <ProfileChips />
        <button
          className="btn-icon"
          onClick={() => updateSettings({ theme: profile.settings.theme === 'light' ? 'dark' : 'light' })}
          aria-label="Toggle light or dark theme"
        >{profile.settings.theme === 'light' ? '🌙' : '☀️'}</button>
      </header>

      <div className="home-grid">
        <section className="hero-card">
          <div className="hero-label">{tier.name} · Next rival</div>
          <div className="hero-rival">
            <img src={avatarImage(rival.avatar)} alt="" />
            <div>
              <div className="hero-name">{rival.name}</div>
              <div className="hero-tagline">{rival.tagline}</div>
              <div className="hero-stars">{[1, 2, 3].map(i => <span key={i} className={i <= stars ? 'on' : ''}>★</span>)}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-lg btn-full play-btn" onClick={() => startAIMatch(rival.ai.difficulty, rival.id)}>
            ▶ Play
          </button>
          <button className="link-btn" onClick={() => navigate('ladder')}>
            Ladder progress: {totalStars(profile.ladderStars)} / {ALL_RIVALS.length * 3} ★
          </button>
        </section>

        <section className="mode-list">
          {!picker ? (
            <>
              <button className="mode-card" onClick={() => navigate('online')}>
                <span className="mode-icon">🌐</span>
                <span className="mode-text"><strong>Online</strong><small>Quick match or play a friend</small></span>
                <span className="mode-arrow">›</span>
              </button>
              <button className="mode-card" onClick={() => setPicker(true)}>
                <span className="mode-icon">🤖</span>
                <span className="mode-text"><strong>Quick vs Computer</strong><small>Pick a difficulty</small></span>
                <span className="mode-arrow">›</span>
              </button>
              <button className="mode-card" onClick={startLocalMatch}>
                <span className="mode-icon">👥</span>
                <span className="mode-text"><strong>Same device</strong><small>Pass and play with a friend</small></span>
                <span className="mode-arrow">›</span>
              </button>
              <button className="mode-card" onClick={() => navigate('howToPlay')}>
                <span className="mode-icon">📖</span>
                <span className="mode-text"><strong>How to play</strong><small>Rules, jumps and tips</small></span>
                <span className="mode-arrow">›</span>
              </button>
            </>
          ) : (
            <>
              <div className="picker-title">Choose a difficulty</div>
              {DIFFICULTIES.map(d => (
                <button key={d.id} className="mode-card" onClick={() => startAIMatch(d.id)}>
                  <span className="mode-text"><strong>{d.label}</strong><small>{d.desc}</small></span>
                  <span className="difficulty-stars">{'★'.repeat(d.stars)}</span>
                </button>
              ))}
              <button className="btn btn-ghost btn-full" onClick={() => setPicker(false)}>← Back</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
