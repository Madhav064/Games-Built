// ============================================================
// Wall Duel — Canvas board renderer & input
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GameState,
  type Position,
  type PlayerId,
  type WallOrientation,
  type Move,
  BOARD_SIZE,
  GamePhase,
} from '../../game/types';
import { getAllValidPawnMoves, validateMove } from '../../game/rules';
import { samePosition } from '../../game/board';
import { pawnSpec, wallSpec, boardSpec, type BoardSpec, type PawnSpec } from '../../store/cosmetics';

export type InputMode = 'move' | 'wall';
export interface WallAnchor { row: number; col: number; orientation: WallOrientation }

interface Props {
  gameState: GameState;
  /** Which player's side is drawn at the bottom. */
  viewAs: PlayerId;
  interactive: boolean;
  mode: InputMode;
  orientation: WallOrientation;
  boardThemeId: string;
  appTheme: 'light' | 'dark';
  /** Touch flow: a wall waiting for confirmation. */
  pendingWall: WallAnchor | null;
  onPendingWallChange(wall: WallAnchor | null): void;
  onMove(move: Move): boolean;
}

const MAX = BOARD_SIZE - 1;
const ANIM_MS = 170;

const CLASSIC: Record<'light' | 'dark', BoardSpec> = {
  light: { frame: '#e4d6b4', surface: '#efe4c8', cellA: '#fffaf0', cellB: '#f8efdb', goalTint: 0.18, edge: '#b89f6a' },
  dark: { frame: '#12143a', surface: '#1a1d4a', cellA: '#2a2e6e', cellB: '#252964', goalTint: 0.2, edge: '#818cf8' },
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface Anim { from: Position; to: Position; start: number }

export function GameBoard(props: Props) {
  const { gameState, viewAs, interactive, mode, orientation, boardThemeId, appTheme, pendingWall, onPendingWallChange, onMove } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(360);
  const [hoverCell, setHoverCell] = useState<Position | null>(null);
  const [hoverWall, setHoverWall] = useState<WallAnchor | null>(null);

  const flipped = viewAs === 1;
  const theme = useMemo(() => {
    const spec = boardSpec(boardThemeId);
    return spec.followsAppTheme ? CLASSIC[appTheme] : spec;
  }, [boardThemeId, appTheme]);
  const pawns = useMemo<[PawnSpec, PawnSpec]>(
    () => [pawnSpec(gameState.players[0].pawnSkin, 'pawn_blue'), pawnSpec(gameState.players[1].pawnSkin, 'pawn_red')],
    [gameState.players],
  );

  // Geometry --------------------------------------------------
  const pad = Math.round(size * 0.035);
  const gap = Math.max(5, Math.round(size * 0.018));
  const cell = (size - pad * 2 - gap * MAX) / BOARD_SIZE;
  const unit = cell + gap;

  const view = useCallback((r: number, c: number) => (flipped ? [MAX - r, MAX - c] : [r, c]), [flipped]);
  const cellXY = useCallback((r: number, c: number) => {
    const [vr, vc] = view(r, c);
    return { x: pad + vc * unit, y: pad + vr * unit };
  }, [view, pad, unit]);
  const wallRect = useCallback((w: WallAnchor) => {
    // Rotating the board 180° maps a wall anchor (r, c) to (7 - r, 7 - c).
    const r = flipped ? MAX - 1 - w.row : w.row;
    const c = flipped ? MAX - 1 - w.col : w.col;
    const x = pad + c * unit;
    const y = pad + r * unit;
    const thick = gap * 0.9;
    const long = cell * 2 + gap;
    return w.orientation === 'horizontal'
      ? { x, y: y + cell + (gap - thick) / 2, w: long, h: thick }
      : { x: x + cell + (gap - thick) / 2, y, w: thick, h: long };
  }, [flipped, pad, unit, gap, cell]);

  const validMoves = useMemo(
    () => (interactive ? getAllValidPawnMoves(gameState, gameState.currentTurn) : []),
    [interactive, gameState],
  );

  // Animations ------------------------------------------------
  const prevPositions = useRef<[Position, Position]>([gameState.players[0].position, gameState.players[1].position]);
  const prevWallCount = useRef(gameState.board.walls.length);
  const anims = useRef<(Anim | null)[]>([null, null]);
  const wallAnimStart = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    gameState.players.forEach((p, i) => {
      const prev = prevPositions.current[i];
      if (!samePosition(prev, p.position)) anims.current[i] = { from: prev, to: p.position, start: now };
      prevPositions.current[i] = p.position;
    });
    if (gameState.board.walls.length > prevWallCount.current) wallAnimStart.current = now;
    prevWallCount.current = gameState.board.walls.length;
  }, [gameState]);

  // Drawing ---------------------------------------------------
  const draw = useCallback((now: number): boolean => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    let animating = false;

    // Frame & surface
    ctx.fillStyle = theme.frame;
    roundRect(ctx, 0, 0, size, size, size * 0.04);
    ctx.fill();
    ctx.fillStyle = theme.surface;
    roundRect(ctx, pad * 0.45, pad * 0.45, size - pad * 0.9, size - pad * 0.9, size * 0.03);
    ctx.fill();

    // Cells (goal rows tinted with the colour of the player racing there)
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { x, y } = cellXY(r, c);
        ctx.fillStyle = (r + c) % 2 === 0 ? theme.cellA : theme.cellB;
        roundRect(ctx, x, y, cell, cell, cell * 0.16);
        ctx.fill();
        const goalOf: PlayerId | null = r === gameState.players[0].goalRow ? 0 : r === gameState.players[1].goalRow ? 1 : null;
        if (goalOf !== null) {
          ctx.fillStyle = rgba(pawns[goalOf].color, theme.goalTint);
          roundRect(ctx, x, y, cell, cell, cell * 0.16);
          ctx.fill();
        }
        if (hoverCell && hoverCell.row === r && hoverCell.col === c && validMoves.some(m => samePosition(m, hoverCell))) {
          ctx.fillStyle = rgba(pawns[gameState.currentTurn].color, 0.22);
          roundRect(ctx, x, y, cell, cell, cell * 0.16);
          ctx.fill();
        }
      }
    }

    // Legal move dots
    if (interactive && mode === 'move') {
      const color = pawns[gameState.currentTurn].color;
      for (const m of validMoves) {
        const { x, y } = cellXY(m.row, m.col);
        ctx.fillStyle = rgba(color, 0.35);
        ctx.strokeStyle = rgba(color, 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Walls (newest one drops in)
    const walls = gameState.board.walls;
    walls.forEach((w, i) => {
      let scale = 1;
      if (i === walls.length - 1 && wallAnimStart.current !== null) {
        const t = Math.min(1, (now - wallAnimStart.current) / 220);
        scale = 0.6 + 0.4 * easeOutBack(t);
        if (t < 1) animating = true;
        else wallAnimStart.current = null;
      }
      drawWall(ctx, wallRect(w), gameState.players[w.placedBy].wallSkin, pawns[w.placedBy], scale, i === walls.length - 1);
    });

    // Wall preview (hover on desktop, pending on touch)
    const preview = pendingWall ?? (interactive ? hoverWall : null);
    if (preview && interactive) {
      const ok = validateMove(gameState, gameState.currentTurn, { type: 'wall', wall: preview }) === null;
      const rect = wallRect(preview);
      ctx.save();
      ctx.globalAlpha = pendingWall ? 0.85 : 0.6;
      ctx.fillStyle = ok ? pawns[gameState.currentTurn].color : '#ef4444';
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) / 2);
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ok ? '#ffffff' : '#7f1d1d';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Pawns
    gameState.players.forEach((p, i) => {
      let pos = { r: p.position.row as number, c: p.position.col as number };
      const anim = anims.current[i];
      if (anim) {
        const t = Math.min(1, (now - anim.start) / ANIM_MS);
        const e = easeOutCubic(t);
        pos = { r: anim.from.row + (anim.to.row - anim.from.row) * e, c: anim.from.col + (anim.to.col - anim.from.col) * e };
        if (t < 1) animating = true;
        else anims.current[i] = null;
      }
      const [vr, vc] = flipped ? [MAX - pos.r, MAX - pos.c] : [pos.r, pos.c];
      const cx = pad + vc * unit + cell / 2;
      const cy = pad + vr * unit + cell / 2;
      drawPawn(ctx, cx, cy, cell * 0.33, pawns[i], gameState.currentTurn === i && gameState.phase === GamePhase.Playing);
    });

    return animating;
  }, [size, theme, pad, cell, unit, cellXY, wallRect, gameState, pawns, hoverCell, validMoves, interactive, mode, pendingWall, hoverWall, flipped]);

  useEffect(() => {
    const loop = (t: number) => {
      frame.current = draw(t) ? requestAnimationFrame(loop) : null;
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(loop);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [draw]);

  // Sizing ----------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize(Math.max(200, Math.floor(Math.min(r.width, r.height))));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  // Input -----------------------------------------------------
  /** Board-space point → cell, and the wall anchor nearest to the point. */
  const locate = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const gx = clientX - rect.left - pad;
    const gy = clientY - rect.top - pad;
    const inside = gx >= -gap && gy >= -gap && gx <= size - pad * 2 + gap && gy <= size - pad * 2 + gap;
    const vc = Math.min(MAX, Math.max(0, Math.floor(gx / unit)));
    const vr = Math.min(MAX, Math.max(0, Math.floor(gy / unit)));
    const [row, col] = flipped ? [MAX - vr, MAX - vc] : [vr, vc];

    const ar = Math.min(MAX - 1, Math.max(0, Math.round((gy - cell - gap / 2) / unit)));
    const ac = Math.min(MAX - 1, Math.max(0, Math.round((gx - cell - gap / 2) / unit)));
    const anchor = flipped ? { row: MAX - 1 - ar, col: MAX - 1 - ac } : { row: ar, col: ac };

    // Distance to the nearest inner gap line, horizontally and vertically.
    const lx = gx - vc * unit;
    const ly = gy - vr * unit;
    const distV = Math.min(Math.abs(lx - (cell + gap / 2)), vc > 0 ? Math.abs(lx + gap / 2) : Infinity);
    const distH = Math.min(Math.abs(ly - (cell + gap / 2)), vr > 0 ? Math.abs(ly + gap / 2) : Infinity);
    const nearGap = Math.min(distH, distV) < gap / 2 + cell * 0.2;
    const autoOrientation: WallOrientation = distH < distV ? 'horizontal' : 'vertical';

    return { inside, cell: { row, col } as Position, anchor, nearGap, autoOrientation };
  }, [pad, gap, size, unit, cell, flipped]);

  const canWall = interactive && gameState.players[gameState.currentTurn].wallsRemaining > 0;

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse') return;
    const hit = locate(e.clientX, e.clientY);
    if (!hit.inside) { setHoverCell(null); setHoverWall(null); return; }
    if (canWall && (mode === 'wall' || hit.nearGap)) {
      setHoverWall({ ...hit.anchor, orientation: mode === 'wall' ? orientation : hit.autoOrientation });
      setHoverCell(null);
    } else {
      setHoverWall(null);
      setHoverCell(hit.cell);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!interactive || gameState.phase !== GamePhase.Playing) return;
    const hit = locate(e.clientX, e.clientY);
    if (!hit.inside) return;

    if (e.pointerType === 'mouse') {
      if (hoverWall && canWall) {
        if (onMove({ type: 'wall', wall: hoverWall })) setHoverWall(null);
        return;
      }
      if (validMoves.some(m => samePosition(m, hit.cell))) onMove({ type: 'move', to: hit.cell });
      return;
    }

    // Touch / pen: walls need a second tap (or the ✓ button) to confirm.
    if (mode === 'wall' && canWall) {
      const tapped = { ...hit.anchor, orientation };
      if (pendingWall && pendingWall.row === tapped.row && pendingWall.col === tapped.col && pendingWall.orientation === tapped.orientation) {
        if (onMove({ type: 'wall', wall: pendingWall })) onPendingWallChange(null);
      } else {
        onPendingWallChange(tapped);
      }
      return;
    }
    if (validMoves.some(m => samePosition(m, hit.cell))) onMove({ type: 'move', to: hit.cell });
  };

  const onContextMenu = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div ref={wrapRef} className="board-wrap">
      <canvas
        ref={canvasRef}
        className="board-canvas"
        width={Math.round(size * (window.devicePixelRatio || 1))}
        height={Math.round(size * (window.devicePixelRatio || 1))}
        style={{ width: size, height: size, cursor: interactive ? 'pointer' : 'default' }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { setHoverCell(null); setHoverWall(null); }}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        aria-label="Game board"
        role="img"
      />
    </div>
  );
}

// ------------------------------------------------------------
// Drawing helpers
// ------------------------------------------------------------
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function drawPawn(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spec: PawnSpec, active: boolean) {
  ctx.save();
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.85, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (active) {
    ctx.shadowColor = spec.color;
    ctx.shadowBlur = r * 1.1;
  }
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, spec.color);
  if (spec.accent) g.addColorStop(0.7, spec.accent);
  g.addColorStop(1, spec.shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, r + ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (spec.icon) {
    ctx.font = `${r * 1.0}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.icon, cx, cy + r * 0.08);
  }
  ctx.restore();
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  skinId: string,
  placer: PawnSpec,
  scale: number,
  isLatest: boolean,
) {
  const spec = wallSpec(skinId);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * (rect.w > rect.h ? scale : 1);
  const h = rect.h * (rect.h > rect.w ? scale : 1);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const horizontal = rect.w > rect.h;

  ctx.save();
  let fill: string | CanvasGradient;
  if (spec.style === 'match') {
    fill = gradientAlong(ctx, x, y, w, h, horizontal, [placer.color, placer.shade]);
  } else if (spec.colors.length === 1) {
    fill = spec.colors[0];
  } else {
    fill = gradientAlong(ctx, x, y, w, h, horizontal, spec.colors);
  }
  const glow = spec.glow ?? (spec.style === 'match' ? placer.color : undefined);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = isLatest ? 14 : 8;
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Highlight edge for depth
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function gradientAlong(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, horizontal: boolean, colors: string[]) {
  const g = horizontal ? ctx.createLinearGradient(x, y, x + w, y) : ctx.createLinearGradient(x, y, x, y + h);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
