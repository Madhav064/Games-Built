// ============================================================
// Wall Duel — Privacy policy (shown in-game, as CrazyGames allows)
// Keep this in sync with what the game actually stores.
// ============================================================

import { useGame } from '../../context/GameContext';
import { GAME_NAME } from '../../config/brand';

export const PRIVACY_CONTACT_EMAIL = 'madhav70sharma@gmail.com';
const LAST_UPDATED = '6 November 2026';

export function PrivacyScreen() {
  const { state, navigate } = useGame();
  return (
    <div className="screen menu-screen privacy">
      <header className="menu-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(state.previousScreen === 'privacy' ? 'home' : state.previousScreen)}>← Back</button>
        <h1 className="screen-title">Privacy policy</h1>
        <span />
      </header>

      <div className="card policy">
        <p className="muted small">Last updated: {LAST_UPDATED}</p>

        <h2>Who we are</h2>
        <p>{GAME_NAME} is made by an independent developer. Questions or requests: <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>.</p>

        <h2>Playing offline</h2>
        <p>
          Matches against the computer and on one device don't send anything to us. Your progress (coins, level, items, ladder stars,
          settings) is saved through CrazyGames' save system, or in your browser's storage when you play elsewhere.
        </p>

        <h2>What we store when you play online or open the leaderboard</h2>
        <ul>
          <li>A random anonymous player ID (no email, password or real name).</li>
          <li>Your in-game name, or your CrazyGames username if you're logged in to CrazyGames.</li>
          <li>Your avatar: the one you picked, or your CrazyGames profile picture.</li>
          <li>Your number of online wins and losses, your coin total, and when you last played online.</li>
        </ul>
        <p>This is shown on the public leaderboard.</p>

        <h2>During an online match</h2>
        <p>
          Your name, avatar, pawn and wall style, moves and emotes are sent to your opponent so the match can be played.
          These messages pass through our server provider and are not saved.
        </p>

        <h2>Who processes the data</h2>
        <p>
          Online data is hosted by Supabase, our database and real-time server provider. We don't sell or share your data with anyone else.
          Ads are shown by CrazyGames under the CrazyGames privacy policy; we don't receive any ad data.
        </p>

        <h2>How long we keep it, and deleting it</h2>
        <p>
          We keep leaderboard data until you ask us to remove it. To have your online data deleted, email us with your in-game name
          (and roughly when you last played online), and we'll delete it.
        </p>

        <h2>Children</h2>
        <p>The game is meant for players aged 13 and over and doesn't ask for personal details.</p>

        <h2>Changes</h2>
        <p>If this policy changes, the new version will be shown here with a new date.</p>
      </div>
    </div>
  );
}
