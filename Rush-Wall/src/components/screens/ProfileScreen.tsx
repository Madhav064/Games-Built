// ============================================================
// Rush Wall — Profile Screen
// ============================================================

import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { soundManager } from '../../audio/soundManager';
import { updateProfile, COSMETICS } from '../../store/cosmetics';
import { getPlayerRank } from '../../sdk/leaderboard';

export function ProfileScreen() {
  const { state, dispatch } = useGame();
  const { profile } = state;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.username);
  const [onlineWins, setOnlineWins] = useState(0);
  const [onlineLosses, setOnlineLosses] = useState(0);

  useEffect(() => {
    getPlayerRank().then(({ onlineWins: w, onlineLosses: l }) => {
      setOnlineWins(w);
      setOnlineLosses(l);
    }).catch(() => {});
  }, []);

  const avatarItem = COSMETICS.find(c => c.id === profile.equippedAvatar);
  const avatarImg = avatarItem?.preview || '/avatars/avatar_1.jpg';

  const totalOnline = onlineWins + onlineLosses;
  const winRate = totalOnline > 0
    ? Math.round((onlineWins / totalOnline) * 100)
    : 0;

  const goBack = () => {
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
  };

  const handleSaveName = () => {
    if (editName.trim() && editName !== profile.username) {
      const updated = updateProfile({ username: editName.trim() });
      dispatch({ type: 'SET_PROFILE', profile: updated });
    } else {
      setEditName(profile.username);
    }
    setIsEditing(false);
    soundManager.play('click');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    }
  };

  return (
    <div className="screen profile-screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '420px', marginBottom: '20px' }}>
        <button className="btn btn-ghost" onClick={goBack}>← Back</button>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>Profile</h2>
        <div style={{ width: '60px' }} />
      </div>

      <div className="profile-card glass-card">
        <div className="profile-avatar" style={{ padding: 0, overflow: 'hidden' }}>
          <img src={avatarImg} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        
        {isEditing ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
            <input 
              type="text" 
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveName}
              autoFocus
              className="text-center"
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                padding: '4px 8px',
                borderRadius: '8px',
                border: '2px solid var(--color-blue)',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                width: '200px',
                outline: 'none'
              }}
              maxLength={15}
            />
          </div>
        ) : (
          <div 
            className="profile-name font-heading" 
            onClick={() => setIsEditing(true)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            title="Click to edit name"
          >
            {profile.username}
            <span style={{ fontSize: '1rem', opacity: 0.5 }}>✏️</span>
          </div>
        )}

        <div className="profile-stats-grid">
          <div className="profile-stat">
            <div className="profile-stat-value">{totalOnline}</div>
            <div className="profile-stat-label">Online Games</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-value" style={{ color: 'var(--color-emerald)' }}>
              {onlineWins}
            </div>
            <div className="profile-stat-label">Wins</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-value" style={{ color: 'var(--color-danger)' }}>
              {onlineLosses}
            </div>
            <div className="profile-stat-label">Losses</div>
          </div>
        </div>

        <div className="profile-extra-stats">
          <div className="profile-extra-stat">
            <span>Win Rate</span>
            <span>{winRate}%</span>
          </div>
          <div className="profile-extra-stat">
            <span>Win Streak</span>
            <span>{profile.winStreak}</span>
          </div>
          <div className="profile-extra-stat">
            <span>Best Streak</span>
            <span>{profile.bestWinStreak}</span>
          </div>
          <div className="profile-extra-stat">
            <span>Coins</span>
            <span style={{ color: 'var(--color-amber)' }}>🪙 {profile.coins}</span>
          </div>
          <div className="profile-extra-stat">
            <span>Walls Placed</span>
            <span>{profile.totalWallsPlaced}</span>
          </div>
          <div className="profile-extra-stat">
            <span>Total Moves</span>
            <span>{profile.totalMovesPlayed}</span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '420px' }}>
        <p className="text-center text-muted text-xs" style={{ marginTop: '8px' }}>
          Member since {new Date(profile.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
