import { useGame } from '../../context/GameContext';
import { soundManager } from '../../audio/soundManager';

export function BottomNav() {
  const { state, dispatch } = useGame();

  const navigateTo = (screen: 'home' | 'shop' | 'profile' | 'leaderboard') => {
    if (state.screen === screen) return;
    soundManager.init();
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen });
  };

  return (
    <div className="global-bottom-nav">
      <div className={`nav-item ${state.screen === 'home' ? 'active' : ''}`} onClick={() => navigateTo('home')}>
        <span>🏠</span>
        <span>Home</span>
      </div>
      <div className={`nav-item ${state.screen === 'leaderboard' ? 'active' : ''}`} onClick={() => navigateTo('leaderboard')}>
        <span>🏆</span>
        <span>Leaders</span>
      </div>
      <div className={`nav-item ${state.screen === 'shop' ? 'active' : ''}`} onClick={() => navigateTo('shop')}>
        <span>🛍️</span>
        <span>Shop</span>
      </div>
      <div className={`nav-item ${state.screen === 'profile' ? 'active' : ''}`} onClick={() => navigateTo('profile')}>
        <span>👤</span>
        <span>Profile</span>
      </div>
    </div>
  );
}
