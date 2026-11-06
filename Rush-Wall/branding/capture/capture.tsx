// ============================================================
// Wall Duel — preview-video capture scene (dev only)
// Cover → real AI-vs-AI match drawn by the game's own components.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { GameBoard } from '../../src/components/game/GameBoard';
import { PlayerCard } from '../../src/components/game/PlayerCard';
import { getAIMove } from '../../src/game/ai/ai';
import { createEmptyBoard, getStartPosition, getGoalRow, placeWall } from '../../src/game/board';
import { validateMove, checkWinCondition, getAllValidPawnMoves, opponentOf } from '../../src/game/rules';
import { GamePhase, type GameState, type Move, type Player, type PlayerId, type AIProfile } from '../../src/game/types';

const params = new URLSearchParams(location.search);
const layout = params.get('layout') === 'portrait' ? 'portrait' : 'landscape';
const COVER = layout === 'portrait' ? '/branding/covers/cover_portrait_800x1200.png' : '/branding/covers/cover_landscape_1920x1080.png';

/** Timeline (ms): cover, crossfade, the match, then a short hold on the result. */
const COVER_MS = 1300;
const FADE_MS = 500;
const MATCH_MS = 14500;
const END_HOLD_MS = 1500;
const TOTAL_MS = COVER_MS + FADE_MS + MATCH_MS + END_HOLD_MS;

const HUMAN_NAME = 'You';
const RIVAL_NAME = 'Nova';

function freshState(): GameState {
  const mk = (id: PlayerId, name: string, pawnSkin: string, wallSkin: string, avatar: string): Player => ({
    id, name, pawnSkin, wallSkin, avatar, wallsRemaining: 10,
    position: getStartPosition(id), goalRow: getGoalRow(id), isAI: true,
  });
  return {
    phase: GamePhase.Playing, mode: 'vs_ai', board: createEmptyBoard(),
    players: [mk(0, HUMAN_NAME, 'pawn_blue', 'wall_ice', 'avatar_1'), mk(1, RIVAL_NAME, 'pawn_ruby', 'wall_fire', 'avatar_9')],
    currentTurn: 0, turnTimer: 60, moveHistory: [], winner: null, endReason: null, turnCount: 0,
  };
}

function apply(s: GameState, id: PlayerId, move: Move): GameState {
  const next: GameState = {
    ...s,
    players: [{ ...s.players[0] }, { ...s.players[1] }],
    board: { walls: [...s.board.walls], wallSet: new Set(s.board.wallSet) },
    moveHistory: [...s.moveHistory, move],
  };
  if (move.type === 'move') next.players[id].position = move.to;
  else { placeWall(next.board, { ...move.wall, placedBy: id }); next.players[id].wallsRemaining--; }
  const winner = checkWinCondition(next);
  if (winner !== null) { next.phase = GamePhase.Finished; next.winner = winner; next.endReason = 'goal_reached'; }
  else { next.currentTurn = opponentOf(id); next.turnCount++; }
  return next;
}

/** Play AI-vs-AI games until one looks good on video: lots of walls, the bottom player wins. */
function pickGame(): GameState[] {
  const profiles: [AIProfile, AIProfile] = [{ difficulty: 'hard', mistakeRate: 0.05 }, { difficulty: 'hard', mistakeRate: 0.15 }];
  let best: GameState[] | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 80; attempt++) {
    const states = [freshState()];
    let s = states[0];
    for (let ply = 0; ply < 70 && s.phase === GamePhase.Playing; ply++) {
      const id = s.currentTurn;
      const opening = ply < 2 ? getAllValidPawnMoves(s, id) : null;
      const move: Move = opening ? { type: 'move', to: opening[Math.floor(Math.random() * opening.length)] } : getAIMove(s, id, profiles[id]);
      if (validateMove(s, id, move)) break;
      s = apply(s, id, move);
      states.push(s);
    }
    if (s.winner !== 0) continue;
    const plies = states.length - 1;
    const walls = s.board.walls.length;
    if (plies < 26 || plies > 48) continue;
    const score = walls * 3 - Math.abs(plies - 36);
    if (score > bestScore) { bestScore = score; best = states; }
    if (walls >= 12) break;
  }
  return best ?? [freshState()];
}

function Scene() {
  const states = useMemo(() => pickGame(), []);
  const [elapsed, setElapsed] = useState(-1);

  useEffect(() => {
    (window as unknown as { __ready: boolean }).__ready = true;
    (window as unknown as { __start: () => void }).__start = () => {
      const t0 = performance.now();
      const tick = () => {
        const t = performance.now() - t0;
        setElapsed(t);
        if (t < TOTAL_MS) requestAnimationFrame(tick);
        else (window as unknown as { __done: boolean }).__done = true;
      };
      requestAnimationFrame(tick);
    };
    (window as unknown as { __info: object }).__info = { plies: states.length - 1, walls: states[states.length - 1].board.walls.length };
  }, [states]);

  const plies = states.length - 1;
  const matchT = Math.max(0, elapsed - COVER_MS - FADE_MS);
  const index = elapsed < 0 ? 0 : Math.min(plies, Math.floor((matchT / MATCH_MS) * plies) + (matchT > 0 ? 1 : 0));
  const gs = states[index];
  const coverOpacity = elapsed < COVER_MS ? 1 : Math.max(0, 1 - (elapsed - COVER_MS) / FADE_MS);
  const finished = gs.phase === GamePhase.Finished;
  const myTurn = gs.currentTurn === 0;
  // Keep the turn clock moving so the HUD looks alive.
  const plyStart = COVER_MS + FADE_MS + ((index - 1) / plies) * MATCH_MS;
  const timer = Math.max(1, 60 - Math.floor(Math.max(0, elapsed - plyStart) / 1000) - ((index * 7) % 5));

  return (
    <div className="app" style={{ position: 'relative' }}>
      <main className="app-main">
        <div className="screen game-screen">
          <header className="game-top">
            <button className="btn btn-ghost btn-sm">← Menu</button>
            <div className="game-top-title">Ladder · Brick League</div>
            <div className="game-top-actions"><button className="btn-icon">🔊</button><button className="btn btn-ghost btn-sm danger-text">Resign</button></div>
          </header>
          <div className="game-main">
            <PlayerCard className="area-opp" player={gs.players[1]} active={!finished && !myTurn} timer={!finished && !myTurn ? timer : null} emote={null} />
            <div className="area-board">
              <GameBoard
                gameState={gs}
                viewAs={0}
                interactive={!finished && myTurn}
                mode="move"
                orientation="horizontal"
                boardThemeId="board_galaxy"
                appTheme="dark"
                pendingWall={null}
                onPendingWallChange={() => undefined}
                onMove={() => false}
              />
            </div>
            <PlayerCard className="area-me" player={gs.players[0]} active={!finished && myTurn} timer={!finished && myTurn ? timer : null} emote={null} isMe />
            <div className="area-controls">
              <div className={`turn-banner ${myTurn || finished ? 'is-mine' : ''}`}>
                {finished ? 'Victory! You reached the far side' : myTurn ? 'Your turn' : `${RIVAL_NAME} is thinking…`}
              </div>
              <div className="mode-switch">
                <button className="on">● Move</button>
                <button>▬ Wall <span className="count">{gs.players[gs.currentTurn].wallsRemaining}</span></button>
                <button className="rotate"><span className="rotate-glyph">↻</span><span className="rotate-icon horizontal">▬</span></button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <img
        src={COVER}
        alt=""
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: coverOpacity, pointerEvents: 'none', zIndex: 100 }}
      />
    </div>
  );
}

document.documentElement.setAttribute('data-theme', 'dark');
document.documentElement.style.cursor = 'none';
createRoot(document.getElementById('root')!).render(<Scene />);
