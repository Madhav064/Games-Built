// ============================================================
// Wall Duel — Guided first match
// Hints follow what the player has actually done so far.
// ============================================================

import { useState } from 'react';
import type { GameState } from '../../game/types';
import type { InputMode } from './GameBoard';

interface Props {
  gameState: GameState;
  mode: InputMode;
  pendingWall: boolean;
}

/** How many turns the final tip stays on screen after the first wall. */
const FINAL_TIP_TURNS = 4;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export function TutorialCoach({ gameState, mode, pendingWall }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  // Player 0 (the learner) moves on even turns.
  const history = gameState.moveHistory;
  const myMoves = history.filter((_, i) => i % 2 === 0);
  const firstWallIndex = history.findIndex((m, i) => i % 2 === 0 && m.type === 'wall');
  const myTurn = gameState.currentTurn === 0;
  const touch = isTouch();

  let text: string;
  if (myMoves.length === 0) {
    text = 'Welcome to Wall Duel! Tap a glowing dot to step toward the top row.';
  } else if (firstWallIndex === -1) {
    if (!myTurn) text = 'Your rival is racing to the bottom row…';
    else if (mode !== 'wall') text = 'Walls slow your rival down. Tap the Wall button.';
    else if (touch) text = pendingWall
      ? 'Tap ✓ Place wall (or tap the same spot again) to drop it. The rotate button turns it.'
      : "Tap between two squares just in front of your rival's pawn to aim a wall.";
    else text = "Point between two squares just in front of your rival's pawn and click to drop a wall. R rotates it.";
  } else {
    if (history.length - firstWallIndex > FINAL_TIP_TURNS * 2) return null;
    text = `Nice wall! Your rival now has to walk around it. You have ${gameState.players[0].wallsRemaining} walls left. Reach the top row first to win!`;
  }

  return (
    <div className="coach" role="status">
      <span className="coach-icon">🎓</span>
      <p>{text}</p>
      <button className="btn btn-ghost btn-sm" onClick={() => setHidden(true)} aria-label="Hide tips">Hide</button>
    </div>
  );
}
