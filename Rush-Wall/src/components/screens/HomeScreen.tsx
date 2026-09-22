// ============================================================
// Rush Wall — Home Screen
// ============================================================

import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { GameMode, AIDifficulty } from '../../game/types';
import { soundManager } from '../../audio/soundManager';
import { getPlayerRank } from '../../sdk/leaderboard';

export function HomeScreen() {
  const { state, dispatch, startGame, toggleTheme } = useGame();
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [onlineWins, setOnlineWins] = useState(0);
  const [onlineLosses, setOnlineLosses] = useState(0);
  const { profile } = state;

  useEffect(() => {
    getPlayerRank().then(({ onlineWins: w, onlineLosses: l }) => {
      setOnlineWins(w);
      setOnlineLosses(l);
    }).catch(() => {});
  }, []);

  const handleAIClick = () => {
    soundManager.init();
    soundManager.play('click');
    setShowDifficulty(true);
  };

  const handleStartAI = (difficulty: AIDifficulty) => {
    soundManager.play('click');
    startGame(GameMode.VsAI, difficulty);
  };

  const handleLocalPlay = () => {
    soundManager.init();
    soundManager.play('click');
    startGame(GameMode.Local);
  };

  const navigateTo = (screen: 'shop' | 'profile' | 'howToPlay' | 'matchmaking' | 'leaderboard') => {
    soundManager.init();
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen });
  };

  return (
    <div className="screen home-screen" style={{ position: 'relative' }}>
      {/* Theme Toggle */}
      <button 
        className="btn-icon" 
        onClick={toggleTheme}
        style={{ position: 'absolute', top: 16, right: 16, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        aria-label="Toggle Theme"
      >
        {state.theme === 'light' ? '🌙' : '☀️'}
      </button>

      {/* Logo Section */}
      <div className="home-logo-section" style={{ marginBottom: '16px' }}>
        <img src="./logo.png" alt="Rush Wall Logo" style={{ width: '180px', height: 'auto', borderRadius: '16px' }} />
      </div>

      {/* Stats Row */}
      <div className="home-stats-row">
        <div className="badge badge-amber">
          🪙 {profile.coins}
        </div>
        <div className="badge">
          🏆 {onlineWins}W / {onlineLosses}L
        </div>
      </div>

      {/* Main Menu */}
      {!showDifficulty ? (
        <>
          <div className="home-menu">
            <div className="menu-card" onClick={handleAIClick}>
              <div className="menu-card-icon">🤖</div>
              <div className="menu-card-text">
                <h3>Play vs AI</h3>
                <p>Choose difficulty & practice</p>
              </div>
              <span className="menu-card-arrow">›</span>
            </div>

            <div className="menu-card" onClick={handleLocalPlay}>
              <div className="menu-card-icon">👥</div>
              <div className="menu-card-text">
                <h3>Local 2P</h3>
                <p>Same device</p>
              </div>
              <span className="menu-card-arrow">›</span>
            </div>

            <div className="menu-card" onClick={() => navigateTo('matchmaking')}>
              <div className="menu-card-icon">🌐</div>
              <div className="menu-card-text">
                <h3>Online</h3>
                <p>Play vs World</p>
              </div>
              <span className="menu-card-arrow">›</span>
            </div>

            <div className="menu-card" onClick={() => navigateTo('howToPlay')}>
              <div className="menu-card-icon">📖</div>
              <div className="menu-card-text">
                <h3>How to Play</h3>
                <p>Learn the rules</p>
              </div>
              <span className="menu-card-arrow">›</span>
            </div>
          </div>
        </>
      ) : (
        /* Difficulty Picker */
        <div className="difficulty-picker">
          <h3 className="text-center mb-4" style={{ fontSize: '1.1rem' }}>
            Select Difficulty
          </h3>

          <div className="difficulty-btn" onClick={() => handleStartAI(AIDifficulty.Easy)}>
            <div>
              <div className="difficulty-label">Easy</div>
              <div className="difficulty-desc">Random moves, great for learning</div>
            </div>
            <div className="difficulty-stars">⭐</div>
          </div>

          <div className="difficulty-btn" onClick={() => handleStartAI(AIDifficulty.Medium)}>
            <div>
              <div className="difficulty-label">Medium</div>
              <div className="difficulty-desc">Strategic play, a fair challenge</div>
            </div>
            <div className="difficulty-stars">⭐⭐</div>
          </div>

          <div className="difficulty-btn" onClick={() => handleStartAI(AIDifficulty.Hard)}>
            <div>
              <div className="difficulty-label">Hard</div>
              <div className="difficulty-desc">Advanced AI, prepare yourself</div>
            </div>
            <div className="difficulty-stars">⭐⭐⭐</div>
          </div>

          <button
            className="btn btn-ghost btn-full mt-3"
            onClick={() => { soundManager.play('click'); setShowDifficulty(false); }}
          >
            ← Back
          </button>
        </div>
      )}

    </div>
  );
}
