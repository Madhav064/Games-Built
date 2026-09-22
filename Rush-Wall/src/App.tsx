// ============================================================
// Rush Wall — Main App Component
// ============================================================

import { GameProvider, useGame } from './context/GameContext';
import { HomeScreen } from './components/screens/HomeScreen';
import { GameScreen } from './components/screens/GameScreen';
import { ShopScreen } from './components/screens/ShopScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { HowToPlay } from './components/screens/HowToPlay';
import { MatchmakingScreen } from './components/screens/MatchmakingScreen';
import { LeaderboardScreen } from './components/screens/LeaderboardScreen';
import { BottomNav } from './components/shared/BottomNav';
import './App.css';

function AppContent() {
  const { state } = useGame();

  const showBottomNav = ['home', 'shop', 'profile', 'leaderboard'].includes(state.screen);

  return (
    <div className="app-container" style={{ paddingBottom: showBottomNav ? '80px' : '0' }}>
      <div className="app-bg" />
      {state.screen === 'home' && <HomeScreen />}
      {state.screen === 'game' && <GameScreen />}
      {state.screen === 'shop' && <ShopScreen />}
      {state.screen === 'profile' && <ProfileScreen />}
      {state.screen === 'howToPlay' && <HowToPlay />}
      {state.screen === 'matchmaking' && <MatchmakingScreen />}
      {state.screen === 'leaderboard' && <LeaderboardScreen />}

      {showBottomNav && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}

export default App;
