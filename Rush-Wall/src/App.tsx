// ============================================================
// Wall Duel — App shell
// ============================================================

import { GameProvider, useGame } from './context/GameContext';
import { HomeScreen } from './components/screens/HomeScreen';
import { GameScreen } from './components/screens/GameScreen';
import { LadderScreen } from './components/screens/LadderScreen';
import { ShopScreen } from './components/screens/ShopScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { HowToPlay } from './components/screens/HowToPlay';
import { OnlineScreen } from './components/screens/OnlineScreen';
import { LeaderboardScreen } from './components/screens/LeaderboardScreen';
import { PrivacyScreen } from './components/screens/PrivacyScreen';
import { NavBar } from './components/shared/NavBar';

const SCREENS = {
  home: HomeScreen,
  game: GameScreen,
  ladder: LadderScreen,
  shop: ShopScreen,
  profile: ProfileScreen,
  howToPlay: HowToPlay,
  online: OnlineScreen,
  leaderboard: LeaderboardScreen,
  privacy: PrivacyScreen,
} as const;

const WITH_NAV = new Set(['home', 'ladder', 'shop', 'profile', 'leaderboard']);

function Shell() {
  const { state } = useGame();
  if (!state.ready) {
    return (
      <div className="app splash">
        <img src="./icon.svg" alt="" className="splash-icon" />
      </div>
    );
  }
  const Screen = SCREENS[state.screen];
  const nav = WITH_NAV.has(state.screen);
  return (
    <div className={`app ${nav ? 'has-nav' : ''}`}>
      {nav && <NavBar />}
      <main className="app-main"><Screen /></main>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
