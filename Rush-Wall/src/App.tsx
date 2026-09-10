// ============================================================
// Rush Wall — Main App Component
// ============================================================

import { GameProvider, useGame } from './context/GameContext';
import { HomeScreen } from './components/screens/HomeScreen';
import { GameScreen } from './components/screens/GameScreen';
import { ShopScreen } from './components/screens/ShopScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { HowToPlay } from './components/screens/HowToPlay';
import './App.css';

function AppContent() {
  const { state } = useGame();

  return (
    <div className="app-container">
      <div className="app-bg" />
      {state.screen === 'home' && <HomeScreen />}
      {state.screen === 'game' && <GameScreen />}
      {state.screen === 'shop' && <ShopScreen />}
      {state.screen === 'profile' && <ProfileScreen />}
      {state.screen === 'howToPlay' && <HowToPlay />}
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
