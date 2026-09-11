// ============================================================
// Rush Wall — How to Play Screen
// ============================================================

import { useGame } from '../../context/GameContext';
import { soundManager } from '../../audio/soundManager';

export function HowToPlay() {
  const { dispatch } = useGame();

  const goBack = () => {
    soundManager.play('click');
    dispatch({ type: 'SET_SCREEN', screen: 'home' });
  };

  return (
    <div className="screen htp-screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '500px', marginBottom: '16px' }}>
        <button className="btn btn-ghost" onClick={goBack}>← Back</button>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>How to Play</h2>
        <div style={{ width: '60px' }} />
      </div>

      <div className="htp-content">
        <div className="htp-section">
          <h3>🎯 Objective</h3>
          <p>
            Be the first to move your pawn from your starting row to the opposite side of the 9×9 board.
            The <span className="text-blue">Blue</span> player starts at the bottom and must reach the top row.
            The <span className="text-red">Red</span> player starts at the top and must reach the bottom row.
          </p>
        </div>

        <div className="htp-section">
          <h3>🏃 Moving Your Pawn</h3>
          <ul>
            <li>On your turn, click on a highlighted cell to move your pawn</li>
            <li>Pawns can move one square up, down, left, or right</li>
            <li>You cannot move through walls</li>
            <li>If your opponent is adjacent, you can <strong>jump over</strong> them</li>
            <li>If a jump is blocked by a wall or the board edge, you can move <strong>diagonally</strong> past them</li>
          </ul>
        </div>

        <div className="htp-section">
          <h3>🧱 Placing Walls</h3>
          <ul>
            <li>Each player starts with <strong>10 walls</strong></li>
            <li>Instead of moving, hover over the gaps between cells to place a wall</li>
            <li>Walls are 2 cells long and block movement</li>
            <li>Walls cannot overlap with existing walls</li>
            <li><strong className="text-danger">Critical rule:</strong> You can never completely block a player's path to their goal — there must always be a route!</li>
          </ul>
        </div>

        <div className="htp-section">
          <h3>⏱️ Timer & Controls</h3>
          <ul>
            <li>Each turn has a <strong>60-second</strong> timer</li>
            <li>If time runs out, you lose the game</li>
            <li>Use the wall orientation toggle to switch between horizontal and vertical walls</li>
            <li>You can resign at any time from the game menu</li>
          </ul>
        </div>

        <div className="htp-section">
          <h3>💡 Strategy Tips</h3>
          <ul>
            <li>Don't waste walls early — save them for when they'll create the longest detours</li>
            <li>Try to place walls that block your opponent while keeping your own path open</li>
            <li>Control the center of the board for maximum flexibility</li>
            <li>Watch your opponent's wall count — once they're out, they can only move!</li>
            <li>Jump over your opponent to save a turn when possible</li>
          </ul>
        </div>

        <div className="htp-section">
          <h3>🪙 Coins & Shop</h3>
          <ul>
            <li>Earn coins by playing games (more for wins!)</li>
            <li>Spend coins in the Shop to unlock pawn skins, wall styles, board themes, and emotes</li>
            <li>Your progress is automatically saved</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
