// ============================================================
// Wall Duel — Main navigation (bottom bar in portrait, side rail in landscape)
// ============================================================

import { useGame, type Screen } from '../../context/GameContext';

const ITEMS: { screen: Screen; icon: string; label: string }[] = [
  { screen: 'home', icon: '🏠', label: 'Play' },
  { screen: 'ladder', icon: '🪜', label: 'Ladder' },
  { screen: 'shop', icon: '🛍️', label: 'Shop' },
  { screen: 'leaderboard', icon: '🏆', label: 'Ranks' },
  { screen: 'profile', icon: '👤', label: 'Profile' },
];

export function NavBar() {
  const { state, navigate } = useGame();
  return (
    <nav className="nav-bar" aria-label="Main">
      {ITEMS.map(item => (
        <button
          key={item.screen}
          className={`nav-item ${state.screen === item.screen ? 'active' : ''}`}
          onClick={() => state.screen !== item.screen && navigate(item.screen)}
          aria-current={state.screen === item.screen ? 'page' : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
