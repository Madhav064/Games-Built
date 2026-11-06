// ============================================================
// Wall Duel — Game screen (responsive: portrait & 16:9 landscape)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { GameBoard, type InputMode, type WallAnchor } from '../game/GameBoard';
import { ResultsModal } from '../game/ResultsModal';
import { TutorialCoach } from '../game/TutorialCoach';
import { PlayerCard } from '../game/PlayerCard';
import { type Move, type WallOrientation, GamePhase, GameMode } from '../../game/types';
import { opponentOf } from '../../game/rules';
import { EMOTES } from '../../store/cosmetics';
import { ownsCosmetic } from '../../store/profile';
import { soundManager } from '../../audio/soundManager';
import { Modal } from '../shared/Modal';

export function GameScreen() {
  const { state, makeMove, resign, sendEmote, quitMatch, updateSettings } = useGame();
  const { gameState, profile, match, localPlayerId, emote, chatDisabled } = state;
  const [orientation, setOrientation] = useState<WallOrientation>('horizontal');
  const [confirm, setConfirm] = useState<'resign' | 'quit' | null>(null);
  // Mode and pending wall belong to one turn; a new turn starts back in move mode.
  const [input, setInput] = useState<{ turn: number; mode: InputMode; pending: WallAnchor | null }>({ turn: -1, mode: 'move', pending: null });
  const turn = gameState?.turnCount ?? 0;
  const mode: InputMode = input.turn === turn ? input.mode : 'move';
  const pendingWall = input.turn === turn ? input.pending : null;
  const setMode = useCallback((m: InputMode | ((prev: InputMode) => InputMode)) =>
    setInput(prev => {
      const current = prev.turn === turn ? prev.mode : 'move';
      return { turn, mode: typeof m === 'function' ? m(current) : m, pending: null };
    }), [turn]);
  const setPendingWall = useCallback((w: WallAnchor | null | ((prev: WallAnchor | null) => WallAnchor | null)) =>
    setInput(prev => {
      const current = prev.turn === turn ? prev.pending : null;
      return { turn, mode: prev.turn === turn ? prev.mode : 'move', pending: typeof w === 'function' ? w(current) : w };
    }), [turn]);

  const isLocal = gameState?.mode === GameMode.Local;
  const playing = gameState?.phase === GamePhase.Playing;
  const myTurn = !!gameState && (isLocal || gameState.currentTurn === localPlayerId);
  const interactive = !!playing && myTurn;
  const mover = gameState ? gameState.players[gameState.currentTurn] : null;
  const canWall = interactive && (mover?.wallsRemaining ?? 0) > 0;

  const onMove = useCallback((move: Move) => {
    const ok = makeMove(move);
    if (ok) setPendingWall(null);
    return ok;
  }, [makeMove, setPendingWall]);

  const toggleMode = useCallback(() => {
    if (!canWall && mode === 'move') return;
    soundManager.play('click');
    setMode(m => (m === 'move' ? 'wall' : 'move'));
  }, [canWall, mode, setMode]);

  const rotate = useCallback(() => {
    soundManager.play('click');
    setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'));
    setPendingWall(w => (w ? { ...w, orientation: w.orientation === 'horizontal' ? 'vertical' : 'horizontal' } : w));
  }, [setPendingWall]);

  // Keyboard: W = wall mode, R = rotate, Enter = place, Esc = cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!interactive || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'w') toggleMode();
      else if (k === 'r') rotate();
      else if (k === 'escape') { setPendingWall(null); setMode('move'); }
      else if (k === 'enter' && pendingWall) onMove({ type: 'wall', wall: pendingWall });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, toggleMode, rotate, pendingWall, onMove, setMode, setPendingWall]);

  const emotes = useMemo(() => EMOTES.filter(e => ownsCosmetic(profile, e)), [profile]);
  const showEmotes = !(match?.kind === 'online' && chatDisabled) && match?.kind !== 'tutorial';

  if (!gameState || !match) return null;

  const meId = isLocal ? 0 : localPlayerId;
  const oppId = opponentOf(meId);
  const me = gameState.players[meId];
  const opp = gameState.players[oppId];
  const timerOn = match.kind !== 'tutorial';

  const turnText = !playing
    ? 'Match over'
    : isLocal
      ? `${mover!.name}'s turn`
      : myTurn ? 'Your turn' : `${opp.name} is thinking…`;

  const title = match.kind === 'tutorial' ? 'Tutorial'
    : match.kind === 'online' ? 'Online match'
    : match.kind === 'local' ? 'Same device'
    : 'vs Computer';

  return (
    <div className="screen game-screen">
      <header className="game-top">
        <button className="btn btn-ghost btn-sm" onClick={() => (playing ? setConfirm('quit') : quitMatch())}>← Menu</button>
        <div className="game-top-title">{title}</div>
        <div className="game-top-actions">
          <button
            className="btn-icon"
            aria-label={profile.settings.soundOn ? 'Mute sound' : 'Unmute sound'}
            onClick={() => updateSettings({ soundOn: !profile.settings.soundOn })}
          >{profile.settings.soundOn ? '🔊' : '🔇'}</button>
          {playing && match.kind !== 'tutorial' && (
            <button className="btn btn-ghost btn-sm danger-text" onClick={() => setConfirm('resign')}>Resign</button>
          )}
        </div>
      </header>

      <div className="game-main">
        <PlayerCard
          className="area-opp"
          player={opp}
          active={playing && gameState.currentTurn === oppId}
          timer={timerOn && gameState.currentTurn === oppId ? gameState.turnTimer : null}
          emote={emote?.playerId === oppId ? emote : null}
        />

        <div className="area-board">
          <GameBoard
            gameState={gameState}
            viewAs={meId}
            interactive={interactive}
            mode={mode}
            orientation={orientation}
            boardThemeId={profile.equippedBoardTheme}
            appTheme={profile.settings.theme}
            pendingWall={pendingWall}
            onPendingWallChange={setPendingWall}
            onMove={onMove}
          />
        </div>

        <PlayerCard
          className="area-me"
          player={me}
          active={playing && gameState.currentTurn === meId}
          timer={timerOn && gameState.currentTurn === meId ? gameState.turnTimer : null}
          emote={emote?.playerId === meId ? emote : null}
          isMe
        />

        <div className="area-controls">
          {match.kind === 'tutorial' && playing && <TutorialCoach gameState={gameState} mode={mode} pendingWall={!!pendingWall} />}
          <div className={`turn-banner ${myTurn && playing ? 'is-mine' : ''}`}>{turnText}</div>

          <div className="mode-switch" role="group" aria-label="Action">
            <button className={mode === 'move' ? 'on' : ''} disabled={!interactive} onClick={() => mode !== 'move' && toggleMode()}>
              ● Move
            </button>
            <button
              className={mode === 'wall' ? 'on' : ''}
              disabled={!canWall}
              onClick={() => mode !== 'wall' && toggleMode()}
              data-tutorial="wall-button"
            >
              ▬ Wall <span className="count">{mover?.wallsRemaining ?? 0}</span>
            </button>
            <button className="rotate" disabled={!canWall || mode !== 'wall'} onClick={rotate} aria-label="Rotate wall" title="Rotate (R)">
              <span className="rotate-glyph">↻</span>
              <span className={`rotate-icon ${orientation}`}>▬</span>
            </button>
          </div>

          {pendingWall && (
            <div className="pending-actions">
              <button className="btn btn-primary btn-sm" onClick={() => onMove({ type: 'wall', wall: pendingWall })}>✓ Place wall</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPendingWall(null)}>✕</button>
            </div>
          )}

          {showEmotes && (
            <div className="emote-bar">
              {emotes.slice(0, 8).map(e => (
                <button key={e.id} className="emote-btn" onClick={() => sendEmote(e.emoji)} aria-label={e.name}>{e.emoji}</button>
              ))}
            </div>
          )}

          <p className="controls-hint">
            {mode === 'wall' ? 'Tap between squares to place · R rotates' : 'Tap a glowing dot to move · W for walls'}
          </p>
        </div>
      </div>

      {state.rewards && <ResultsModal />}

      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <h2 className="modal-title">{confirm === 'resign' ? 'Resign this match?' : 'Leave this match?'}</h2>
          <p className="modal-text">
            {confirm === 'resign'
              ? isLocal ? `${mover?.name} gives up and the other player wins.` : 'You will lose this match.'
              : match.kind === 'online' ? 'Leaving counts as a loss.' : 'Your progress in this match will be lost.'}
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep playing</button>
            <button
              className="btn btn-danger"
              onClick={() => { setConfirm(null); if (confirm === 'resign') resign(); else quitMatch(); }}
            >{confirm === 'resign' ? 'Resign' : 'Leave'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
