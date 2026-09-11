// ============================================================
// Rush Wall — Game Screen
// ============================================================

import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { GameBoard } from '../game/GameBoard';
import { GameOverModal } from '../game/GameOverModal';
import { GamePhase, WALLS_PER_PLAYER } from '../../game/types';
import { soundManager } from '../../audio/soundManager';
import { getCosmeticColor, COSMETICS } from '../../store/cosmetics';

export function GameScreen() {
  const { state, dispatch, resign, goHome } = useGame();
  const { gameState, wallOrientation, showGameOver } = state;
  const [showResignModal, setShowResignModal] = useState(false);
  const [activeEmote, setActiveEmote] = useState<{ emoji: string, timestamp: number } | null>(null);

  // Auto-close resign modal if the game ends (e.g. via timeout)
  useEffect(() => {
    if (showGameOver) {
      setShowResignModal(false);
    }
  }, [showGameOver]);

  if (!gameState) return null;

  const player0 = gameState.players[0];
  const player1 = gameState.players[1];
  const isMyTurn = gameState.currentTurn === 0;
  const isPlaying = gameState.phase === GamePhase.Playing;

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleResign = () => {
    if (!isPlaying) return;
    soundManager.play('click');
    setShowResignModal(true);
  };

  const toggleOrientation = () => {
    soundManager.play('click');
    dispatch({ type: 'TOGGLE_WALL_ORIENTATION' });
  };

  const handleEmote = (emoji: string) => {
    soundManager.play('emote');
    setActiveEmote({ emoji, timestamp: Date.now() });
  };

  useEffect(() => {
    if (activeEmote) {
      const timer = setTimeout(() => setActiveEmote(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [activeEmote]);

  // Determine timer display for the active player
  const timer = gameState.turnTimer;
  const isUrgent = timer <= 10;

  // Get available emotes
  const availableEmotes = COSMETICS.filter(
    item => item.type === 'emote' && (item.unlocked || state.profile.unlockedCosmetics.includes(item.id))
  );

  return (
    <div className="screen game-screen">
      {/* Header */}
      <div className="game-header">
        <button className="btn btn-ghost btn-sm" onClick={goHome}>
          ← Menu
        </button>
        <div className="game-title">Rush Wall</div>
        {isPlaying && (
          <button className="btn btn-ghost btn-sm" onClick={handleResign} style={{ color: 'var(--color-danger)' }}>
            🏳️ Resign
          </button>
        )}
        {!isPlaying && <div />}
      </div>

      {/* Opponent Bar (Player 1 - top) */}
      <div className={`player-bar player-bar-bg opponent ${gameState.currentTurn === 1 ? 'active' : ''}`}>
        <div 
          className="player-pawn" 
          style={{ background: getCosmeticColor(player1.pawnSkin, 'var(--color-red)') }} 
        />
        <div className="player-info">
          <div className="player-name">{player1.name}</div>
          <div className="player-walls">
            {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
              <div
                key={i}
                className={`wall-pip opponent-pip ${i >= player1.wallsRemaining ? 'used' : ''}`}
                style={{ background: i >= player1.wallsRemaining ? undefined : getCosmeticColor(player1.wallSkin, 'var(--color-red)') }}
              />
            ))}
          </div>
        </div>
        <div className={`player-timer ${gameState.currentTurn === 1 && isUrgent ? 'urgent' : ''}`}>
          {gameState.currentTurn === 1 ? formatTime(timer) : '--:--'}
        </div>
      </div>

      {/* Game Board */}
      <div className="game-board-area">
        <div className="game-board-wrapper">
          <GameBoard
            gameState={gameState}
            wallOrientation={wallOrientation}
            isInteractive={isPlaying && (isMyTurn || gameState.mode === 'local')}
            currentPlayerId={gameState.currentTurn}
          />
        </div>
      </div>

      {/* Player Bar (Player 0 - bottom) */}
      <div className={`player-bar player-bar-bg ${gameState.currentTurn === 0 ? 'active' : ''}`} style={{ position: 'relative' }}>
        {activeEmote && (
          <div 
            style={{ 
              position: 'absolute', 
              top: '-40px', 
              left: '20px', 
              fontSize: '2.5rem', 
              animation: 'bounceIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))',
              zIndex: 10
            }}
          >
            {activeEmote.emoji}
          </div>
        )}
        <div 
          className="player-pawn" 
          style={{ background: getCosmeticColor(player0.pawnSkin, 'var(--color-blue)') }} 
        />
        <div className="player-info">
          <div className="player-name">{player0.name}</div>
          <div className="player-walls">
            {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
              <div
                key={i}
                className={`wall-pip ${i >= player0.wallsRemaining ? 'used' : ''}`}
                style={{ background: i >= player0.wallsRemaining ? undefined : getCosmeticColor(player0.wallSkin, 'var(--color-blue)') }}
              />
            ))}
          </div>
        </div>
        <div className={`player-timer ${gameState.currentTurn === 0 && isUrgent ? 'urgent' : ''}`}>
          {gameState.currentTurn === 0 ? formatTime(timer) : '--:--'}
        </div>
      </div>

      {/* Controls */}
      <div className="game-controls">
        <div className="wall-orientation-toggle" onClick={toggleOrientation}>
          <span className={`wall-orient-icon ${wallOrientation === 'vertical' ? 'vertical' : ''}`}>
            ━━
          </span>
          <span>{wallOrientation === 'horizontal' ? 'H-Wall' : 'V-Wall'}</span>
        </div>

        <div className={`turn-indicator ${gameState.currentTurn === 1 ? 'opponent-turn' : ''}`}>
          {!isPlaying
            ? 'Game Over'
            : gameState.currentTurn === 0
              ? gameState.mode === 'local' ? 'Player 1 Turn' : 'Your Turn'
              : gameState.mode === 'local' ? 'Player 2 Turn' : 'Opponent\'s Turn'
          }
        </div>

        <div className="emote-bar">
          {availableEmotes.map(emote => (
            <button key={emote.id} className="emote-btn" onClick={() => handleEmote(emote.preview)}>
              {emote.preview}
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showGameOver && <GameOverModal />}
      
      {showResignModal && (
        <div className="modal-overlay">
          <div className="modal-content text-center">
            <h2 style={{ marginBottom: '16px', fontSize: '1.5rem', color: 'var(--color-text-primary)', letterSpacing: '-1px' }}>
              Resign Game?
            </h2>
            <p style={{ marginBottom: '24px', opacity: 0.8 }}>
              Are you sure you want to surrender? You will lose this match.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => {
                  soundManager.play('click');
                  setShowResignModal(false);
                }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  soundManager.play('click');
                  setShowResignModal(false);
                  resign();
                }}
                style={{ background: 'var(--color-danger)', color: '#fff', border: 'none' }}
              >
                Yes, Resign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
