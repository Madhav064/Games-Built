// ============================================================
// Rush Wall — Game Over Modal
// ============================================================

import { useGame } from '../../context/GameContext';
import { GameMode, GameEndReason, AIDifficulty } from '../../game/types';
import { soundManager } from '../../audio/soundManager';

export function GameOverModal() {
  const { state, dispatch, startGame, goHome } = useGame();
  const { gameState, coinsEarned } = state;

  if (!gameState || gameState.winner === null) return null;

  const winner = gameState.players[gameState.winner];
  const loser = gameState.players[gameState.winner === 0 ? 1 : 0];
  const playerWon = gameState.mode === 'local' 
    ? true  // In local mode, someone always wins — show 'win' banner
    : gameState.winner === state.localPlayerId;

  // In local mode, just show who won
  const isLocal = gameState.mode === GameMode.Local;

  const reasonText: Record<GameEndReason, string> = {
    [GameEndReason.GoalReached]: `${winner.name} reached the goal!`,
    [GameEndReason.Resignation]: `${loser.name} resigned`,
    [GameEndReason.Timeout]: `${loser.name} ran out of time`,
    [GameEndReason.Disconnect]: `${loser.name} disconnected`,
  };

  const handlePlayAgain = () => {
    soundManager.play('click');
    dispatch({ type: 'HIDE_GAME_OVER' });
    const difficulty = gameState.players[1].aiDifficulty || AIDifficulty.Medium;
    startGame(gameState.mode, difficulty);
  };

  const handleGoHome = () => {
    soundManager.play('click');
    goHome();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className={`game-over-banner ${playerWon || isLocal ? 'win' : 'lose'}`}>
          {isLocal
            ? `${winner.name} Wins!`
            : playerWon
              ? '🎉 Victory!'
              : '💀 Defeat'
          }
        </div>

        <div className="game-over-reason">
          {gameState.endReason ? reasonText[gameState.endReason] : ''}
        </div>

        <div className="game-over-stats">
          <div className="stat-card">
            <div className="stat-card-value">{gameState.moveHistory.length}</div>
            <div className="stat-card-label">Total Moves</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{gameState.board.walls.length}</div>
            <div className="stat-card-label">Walls Placed</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{gameState.turnCount}</div>
            <div className="stat-card-label">Turns Played</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">
              {Math.max(0, loser.wallsRemaining)}
            </div>
            <div className="stat-card-label">Loser Walls Left</div>
          </div>
        </div>

        <div className="coins-earned">
          <span className="coin-icon">🪙</span>
          +{coinsEarned} Coins Earned
        </div>

        <div className="game-over-actions">
          {gameState.mode !== 'online' && (
            <button className="btn btn-primary btn-full btn-lg" onClick={handlePlayAgain}>
              ⚔️ Play Again
            </button>
          )}
          <button className="btn btn-secondary btn-full" onClick={handleGoHome}>
            🏠 Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
