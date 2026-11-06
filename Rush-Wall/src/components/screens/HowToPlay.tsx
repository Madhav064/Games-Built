// ============================================================
// Wall Duel — Rules
// ============================================================

import { useGame } from '../../context/GameContext';
import { GAME_NAME } from '../../config/brand';
import { TURN_SECONDS } from '../../config/balance';

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: '🏁', title: 'Goal', text: 'Be the first to move your pawn to the far side of the 9×9 board.' },
  { icon: '👣', title: 'Move', text: 'On your turn, step one square up, down, left or right. Glowing dots show where you can go.' },
  { icon: '🧱', title: 'Or place a wall', text: 'Instead of moving, drop one of your 10 walls between squares. A wall is two squares long and blocks both pawns.' },
  { icon: '✖️', title: 'Crossing walls', text: `In ${GAME_NAME} walls may overlap halfway or cross each other, so you can build tight mazes.` },
  { icon: '🚪', title: 'Never shut a pawn in', text: "A wall can't cut off a pawn's last route to its goal. Both players must always have a way through." },
  { icon: '🦘', title: 'Jumping', text: "If your rival is right next to you, jump over them. If a wall is behind them, jump to either side instead." },
  { icon: '⏱️', title: 'Timer', text: `You have ${TURN_SECONDS} seconds per turn. Run out and you lose the match.` },
];

export function HowToPlay() {
  const { navigate, startTutorial } = useGame();
  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('home')}>← Back</button>
        <h1 className="screen-title">How to play</h1>
        <span />
      </header>
      <div className="rules-grid">
        {RULES.map(r => (
          <div key={r.title} className="card rule">
            <span className="rule-icon">{r.icon}</span>
            <div><strong>{r.title}</strong><p>{r.text}</p></div>
          </div>
        ))}
      </div>
      <div className="card controls-card">
        <strong>Controls</strong>
        <p><b>Mouse:</b> click a glowing dot to move. Point between squares to preview a wall, click to place. <b>W</b> switches to wall mode, <b>R</b> rotates.</p>
        <p><b>Touch:</b> tap a glowing dot to move. Tap <b>Wall</b>, tap between squares to aim, then tap <b>✓ Place wall</b>.</p>
      </div>
      <button className="btn btn-primary btn-lg" onClick={startTutorial}>Play the tutorial</button>
    </div>
  );
}
