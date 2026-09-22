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

  useEffect(() => {
    if (activeEmote) {
      const timer = setTimeout(() => setActiveEmote(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [activeEmote]);

  if (!gameState) return null;

  const localId = state.localPlayerId;
  const opponentId: 0 | 1 = localId === 0 ? 1 : 0;

  // "me" is always shown at the bottom, "opponent" at the top
  const me = gameState.players[localId];
  const opponent = gameState.players[opponentId];

  const isMyTurn = gameState.currentTurn === localId;
  const timer = gameState.turnTimer;
  const isUrgent = timer <= 10;
  const isPlaying = gameState.phase === GamePhase.Playing;
  
  const opponentAvatarImg = COSMETICS.find(c => c.id === opponent.avatar)?.preview || '/avatars/avatar_1.jpg';
  const myAvatarImg = COSMETICS.find(c => c.id === me.avatar)?.preview || '/avatars/avatar_1.jpg';

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

      {/* Opponent Bar (top) */}
      <div className={`player-bar player-bar-bg opponent ${gameState.currentTurn === opponentId ? 'active' : ''}`}>
        <div 
          className="player-pawn" 
          style={{ 
            backgroundImage: `url(${opponentAvatarImg})`,
            backgroundSize: 'cover',
            border: `3px solid ${getCosmeticColor(opponent.pawnSkin, 'var(--color-red)')}`
          }} 
        />
        <div className="player-info">
          <div className="player-name">{opponent.name}</div>
          <div className="player-walls">
            {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
              <div
                key={i}
                className={`wall-pip opponent-pip ${i >= opponent.wallsRemaining ? 'used' : ''}`}
                style={{ background: i >= opponent.wallsRemaining ? undefined : getCosmeticColor(opponent.wallSkin, 'var(--color-red)') }}
              />
            ))}
          </div>
        </div>
        <div className={`player-timer ${gameState.currentTurn === opponentId && isUrgent ? 'urgent' : ''}`}>
          {gameState.currentTurn === opponentId ? formatTime(timer) : '--:--'}
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

      {/* My Bar (bottom) */}
      <div className={`player-bar player-bar-bg ${gameState.currentTurn === localId ? 'active' : ''}`} style={{ position: 'relative' }}>
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
          style={{ 
            backgroundImage: `url(${myAvatarImg})`,
            backgroundSize: 'cover',
            border: `3px solid ${getCosmeticColor(me.pawnSkin, 'var(--color-blue)')}`
          }} 
        />
        <div className="player-info">
          <div className="player-name">{me.name}</div>
          <div className="player-walls">
            {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
              <div
                key={i}
                className={`wall-pip ${i >= me.wallsRemaining ? 'used' : ''}`}
                style={{ background: i >= me.wallsRemaining ? undefined : getCosmeticColor(me.wallSkin, 'var(--color-blue)') }}
              />
            ))}
          </div>
        </div>
        <div className={`player-timer ${gameState.currentTurn === localId && isUrgent ? 'urgent' : ''}`}>
          {gameState.currentTurn === localId ? formatTime(timer) : '--:--'}
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

        <div className={`turn-indicator ${!isMyTurn ? 'opponent-turn' : ''}`}>
          {!isPlaying
            ? 'Game Over'
            : isMyTurn
              ? gameState.mode === 'local' ? `Player ${localId + 1} Turn` : 'Your Turn'
              : gameState.mode === 'local' ? `Player ${opponentId + 1} Turn` : 'Opponent\'s Turn'
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
