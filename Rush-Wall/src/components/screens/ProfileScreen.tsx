// ============================================================
// Wall Duel — Profile: name, level & rank, stats, settings
// ============================================================

import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { avatarImage } from '../../store/cosmetics';
import { setUsername, resolveAvatar } from '../../store/profile';
import { isAccountSystemAvailable } from '../../sdk/crazygames';
import { rankForLevel, levelProgress, RANKS } from '../../progression/xp';
import { totalStars, ALL_RIVALS } from '../../progression/ladder';
import { xpToNextLevel } from '../../config/balance';

export function ProfileScreen() {
  const { state, setProfile, updateSettings, startTutorial, navigate, loginWithCrazyGames } = useGame();
  const { profile } = state;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.username);
  const rank = rankForLevel(profile.level);
  const nextRank = RANKS.find(r => r.minLevel > profile.level);
  const winRate = profile.gamesPlayed ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0;

  const saveName = () => {
    setProfile(setUsername(name));
    setEditing(false);
  };

  const stats: [string, string | number][] = [
    ['Matches', profile.gamesPlayed],
    ['Wins', profile.gamesWon],
    ['Win rate', `${winRate}%`],
    ['Best streak', profile.bestWinStreak],
    ['Ladder stars', `${totalStars(profile.ladderStars)} / ${ALL_RIVALS.length * 3}`],
    ['Walls placed', profile.totalWallsPlaced],
  ];

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <h1 className="screen-title">Profile</h1>
      </header>

      <div className="profile-grid">
        <section className="card profile-card">
          <button className="profile-avatar" onClick={() => navigate('shop')} title="Change avatar in the shop">
            <img src={avatarImage(resolveAvatar(profile))} alt="Your avatar" />
          </button>
          {profile.crazyGames ? (
            <div className="profile-name locked" title="Your CrazyGames username">{profile.username}</div>
          ) : editing ? (
            <div className="name-edit">
              <input
                value={name}
                maxLength={16}
                autoFocus
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                aria-label="Your name"
              />
              <button className="btn btn-primary btn-sm" onClick={saveName}>Save</button>
            </div>
          ) : (
            <button className="profile-name" onClick={() => { setName(profile.username); setEditing(true); }}>
              {profile.username} <span className="edit-icon">✎</span>
            </button>
          )}
          {profile.crazyGames && <div className="muted small">Signed in with CrazyGames · progress saved to your account</div>}
          {!profile.crazyGames && isAccountSystemAvailable() && (
            <button className="btn btn-secondary btn-sm" onClick={loginWithCrazyGames}>Log in with CrazyGames to save progress</button>
          )}
          <div className="rank-badge" style={{ borderColor: rank.color, color: rank.color }}>{rank.icon} {rank.name}</div>
          <div className="xp-block">
            <div className="xp-row"><span>Level {profile.level}</span><span>{profile.xp} / {xpToNextLevel(profile.level)} XP</span></div>
            <div className="xp-bar"><div className="xp-fill" style={{ width: `${Math.round(levelProgress(profile.level, profile.xp) * 100)}%` }} /></div>
            {nextRank && <div className="muted small">{nextRank.icon} {nextRank.name} at level {nextRank.minLevel}</div>}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Stats</h2>
          <div className="stat-grid">
            {stats.map(([label, value]) => (
              <div key={label} className="stat"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Settings</h2>
          <label className="setting">
            <span>Sound</span>
            <input type="checkbox" checked={profile.settings.soundOn} onChange={e => updateSettings({ soundOn: e.target.checked })} />
          </label>
          <label className="setting">
            <span>Dark theme</span>
            <input type="checkbox" checked={profile.settings.theme === 'dark'} onChange={e => updateSettings({ theme: e.target.checked ? 'dark' : 'light' })} />
          </label>
          <button className="btn btn-secondary btn-full" onClick={startTutorial}>Replay tutorial</button>
          <button className="link-btn small privacy-link" onClick={() => navigate('privacy')}>Privacy policy</button>
        </section>
      </div>
    </div>
  );
}
