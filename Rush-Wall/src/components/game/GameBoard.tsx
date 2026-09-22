// ============================================================
// Rush Wall — Canvas Game Board Renderer
// ============================================================

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  type GameState,
  type Position,
  type PlayerId,
  type WallOrientation,
  type Coord,
  BOARD_SIZE,
  GamePhase,
} from '../../game/types';
import { getAllValidPawnMoves, validateMove } from '../../game/rules';
import { useGame } from '../../context/GameContext';
import { getCosmeticColor, COSMETICS } from '../../store/cosmetics';
// import { isMovementBlocked } from '../../game/board';

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba')) return hex;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Props {
  gameState: GameState;
  wallOrientation: WallOrientation;
  isInteractive: boolean;
  currentPlayerId: PlayerId;
}

// Visual constants
const PADDING = 8;
const CELL_GAP = 6; // Gap between cells (where walls go)

// Colors generator based on theme
const getColors = (theme: 'light' | 'dark') => {
  const isDark = theme === 'dark';
  return {
    boardBg: isDark ? '#0d0d24' : '#ffffff',
    cellLight: isDark ? 'rgba(30, 30, 75, 0.55)' : '#faf5e8',
    cellDark: isDark ? 'rgba(22, 22, 60, 0.55)' : '#f5f0e0',
    cellHover: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
    gridLine: isDark ? 'rgba(80, 80, 160, 0.1)' : '#e5e5e5',
    pawnBlue: '#00b4d8',
    pawnBlueGlow: isDark ? 'rgba(0, 180, 216, 0.5)' : 'transparent',
    pawnRed: '#ef4444',
    pawnRedGlow: isDark ? 'rgba(239, 68, 68, 0.5)' : 'transparent',
    wallBlue: '#0096c7',
    wallBlueGlow: isDark ? 'rgba(0, 150, 199, 0.4)' : 'transparent',
    wallRed: '#dc2626',
    wallRedGlow: isDark ? 'rgba(220, 38, 38, 0.4)' : 'transparent',
    validMoveBlue: isDark ? 'rgba(0, 180, 216, 0.35)' : 'rgba(0, 180, 216, 0.4)',
    validMoveStrokeBlue: 'rgba(0, 180, 216, 0.6)',
    validMoveRed: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.4)',
    validMoveStrokeRed: 'rgba(239, 68, 68, 0.6)',
    wallPreviewBlue: 'rgba(0, 180, 216, 0.3)',
    wallPreviewStrokeBlue: 'rgba(0, 180, 216, 0.5)',
    wallPreviewRed: 'rgba(239, 68, 68, 0.3)',
    wallPreviewStrokeRed: 'rgba(239, 68, 68, 0.5)',
    wallInvalid: 'rgba(255, 51, 102, 0.25)',
    goalRowBlue: 'rgba(0, 180, 216, 0.06)',
    goalRowRed: 'rgba(239, 68, 68, 0.06)',
  };
};

export function GameBoard({ gameState, wallOrientation, isInteractive, currentPlayerId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { makeMove, state: { theme } } = useGame();
  const COLORS = useMemo(() => getColors(theme), [theme]);

  const [hoverCell, setHoverCell] = useState<Position | null>(null);
  const [hoverWall, setHoverWall] = useState<{ row: number; col: number; orientation: WallOrientation } | null>(null);
  const [mode, setMode] = useState<'move' | 'wall'>('move');

  // Canvas sizing
  const [canvasSize, setCanvasSize] = useState(400);

  // Compute cell size
  const boardInner = canvasSize - PADDING * 2;
  const cellSize = (boardInner - CELL_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;

  // Get pixel position for a cell's top-left corner
  const getCellPos = useCallback((row: number, col: number) => {
    return {
      x: PADDING + col * (cellSize + CELL_GAP),
      y: PADDING + row * (cellSize + CELL_GAP),
    };
  }, [cellSize]);

  // Convert mouse/touch position to board coordinates
  const posToCell = useCallback((clientX: number, clientY: number): { row: number; col: number; inGap: boolean; gapH: boolean; gapV: boolean } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Convert to grid coordinates
    const gridX = x - PADDING;
    const gridY = y - PADDING;

    if (gridX < 0 || gridY < 0 || gridX >= boardInner || gridY >= boardInner) return null;

    const unitSize = cellSize + CELL_GAP;
    const col = Math.floor(gridX / unitSize);
    const row = Math.floor(gridY / unitSize);

    // Check if cursor is in the gap area (expand hitbox for easier mobile/mouse placement)
    const cellLocalX = gridX - col * unitSize;
    const cellLocalY = gridY - row * unitSize;
    const hitMargin = cellSize * 0.35; // Outer 35% of the cell acts as a wall trigger
    
    const inGapH = cellLocalY > (cellSize - hitMargin); // Below the cell = horizontal gap
    const inGapV = cellLocalX > (cellSize - hitMargin); // Right of cell = vertical gap

    return {
      row: Math.min(row, BOARD_SIZE - 1),
      col: Math.min(col, BOARD_SIZE - 1),
      inGap: inGapH || inGapV,
      gapH: inGapH,
      gapV: inGapV,
    };
  }, [cellSize, boardInner]);

  // Get valid pawn moves
  const validMoves = useMemo(() => {
    return isInteractive ? getAllValidPawnMoves(gameState, currentPlayerId) : [];
  }, [isInteractive, gameState, currentPlayerId]);

  // ================================================================
  // RENDERING
  // ================================================================

  // Draw a pawn
  const drawPawn = useCallback((ctx: CanvasRenderingContext2D, pos: Position, playerId: PlayerId, isActive: boolean) => {
    const { x, y } = getCellPos(pos.row, pos.col);
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;
    const radius = cellSize * 0.32;

    const playerSkin = gameState.players[playerId].pawnSkin;
    const defaultColor = playerId === 0 ? COLORS.pawnBlue : COLORS.pawnRed;
    const color = getCosmeticColor(playerSkin, defaultColor);
    const glowColor = hexToRgba(color, 0.5);

    // Glow
    if (isActive) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowBlur = 0;
    }

    // Gradient fill
    const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, hexToRgba(color, 0.8)); // slightly darker edge by alpha

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Reflection crescent (to match CSS glossy effect)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.75, Math.PI * 0.9, Math.PI * 1.4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = radius * 0.15;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw Icon if available
    const cosmeticItem = COSMETICS.find(c => c.id === playerSkin);
    if (cosmeticItem?.icon) {
      ctx.fillStyle = 'white';
      ctx.font = `${radius * 1.2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Slight vertical bump for optical alignment with emojis
      ctx.fillText(cosmeticItem.icon, cx, cy + radius * 0.1);
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }, [getCellPos, cellSize, COLORS, gameState.players]);

  // Draw a placed wall
  const drawWall = useCallback((
    ctx: CanvasRenderingContext2D,
    row: number, col: number,
    orientation: WallOrientation,
    placedBy: PlayerId
  ) => {
    const playerSkin = gameState.players[placedBy].pawnSkin;
    const defaultColor = placedBy === 0 ? COLORS.wallBlue : COLORS.wallRed;
    const color = getCosmeticColor(playerSkin, defaultColor);
    
    const glowColor = hexToRgba(color, 0.4);
    const { x: x1, y: y1 } = getCellPos(row, col);

    let wx: number, wy: number, ww: number, wh: number;

    if (orientation === 'horizontal') {
      wx = x1;
      wy = y1 + cellSize + 0.5;
      ww = cellSize * 2 + CELL_GAP;
      wh = CELL_GAP - 1;
    } else {
      wx = x1 + cellSize + 0.5;
      wy = y1;
      ww = CELL_GAP - 1;
      wh = cellSize * 2 + CELL_GAP;
    }

    // Glow
    if (glowColor !== 'transparent') {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 2);
    ctx.fill();

    // Bright edge
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }, [getCellPos, cellSize, COLORS, gameState.players]);

  // Draw wall preview (transparent overlay)
  const drawWallPreview = useCallback((
    ctx: CanvasRenderingContext2D,
    row: number, col: number,
    orientation: WallOrientation,
    isValid: boolean
  ) => {
    const { x: x1, y: y1 } = getCellPos(row, col);

    let wx: number, wy: number, ww: number, wh: number;

    if (orientation === 'horizontal') {
      wx = x1;
      wy = y1 + cellSize + 0.5;
      ww = cellSize * 2 + CELL_GAP;
      wh = CELL_GAP - 1;
    } else {
      wx = x1 + cellSize + 0.5;
      wy = y1;
      ww = CELL_GAP - 1;
      wh = cellSize * 2 + CELL_GAP;
    }

    const currentPlayerSkin = gameState.players[currentPlayerId].pawnSkin;
    const baseColor = getCosmeticColor(currentPlayerSkin, currentPlayerId === 0 ? COLORS.pawnBlue : COLORS.pawnRed);

    const previewFill = hexToRgba(baseColor, 0.3);
    const previewStroke = hexToRgba(baseColor, 0.5);

    ctx.fillStyle = isValid ? previewFill : COLORS.wallInvalid;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 2);
    ctx.fill();

    ctx.strokeStyle = isValid ? previewStroke : 'rgba(255, 51, 102, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [getCellPos, cellSize, currentPlayerId, COLORS, gameState.players]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Board background
    ctx.fillStyle = COLORS.boardBg;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 14);
    ctx.fill();

    // Subtle outer glow
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 14);
    ctx.stroke();

    // Draw cells
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { x, y } = getCellPos(r, c);

        // Goal row highlight
        if (r === 0) {
          ctx.fillStyle = COLORS.goalRowBlue;
          ctx.fillRect(x, y, cellSize, cellSize);
        } else if (r === BOARD_SIZE - 1) {
          ctx.fillStyle = COLORS.goalRowRed;
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Cell background
        ctx.fillStyle = (r + c) % 2 === 0 ? COLORS.cellLight : COLORS.cellDark;
        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 3);
        ctx.fill();

        // Hover highlight
        if (hoverCell && hoverCell.row === r && hoverCell.col === c && mode === 'move') {
          ctx.fillStyle = COLORS.cellHover;
          ctx.beginPath();
          ctx.roundRect(x, y, cellSize, cellSize, 3);
          ctx.fill();
        }
      }
    }

    // Draw goal row indicators (top = blue, bottom = red)
    const topY = PADDING;
    const botY = PADDING + (BOARD_SIZE - 1) * (cellSize + CELL_GAP);
    const rowWidth = BOARD_SIZE * cellSize + (BOARD_SIZE - 1) * CELL_GAP;

    // Top row accent line
    ctx.strokeStyle = COLORS.pawnBlue;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(PADDING, topY - 1);
    ctx.lineTo(PADDING + rowWidth, topY - 1);
    ctx.stroke();

    // Bottom row accent line
    ctx.strokeStyle = COLORS.pawnRed;
    ctx.beginPath();
    ctx.moveTo(PADDING, botY + cellSize + 1);
    ctx.lineTo(PADDING + rowWidth, botY + cellSize + 1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw valid move indicators
    if (isInteractive && mode === 'move') {
      for (const vm of validMoves) {
        const { x, y } = getCellPos(vm.row, vm.col);
        const cx = x + cellSize / 2;
        const cy = y + cellSize / 2;
        const dotR = cellSize * 0.15;

        const currentPlayerSkin = gameState.players[currentPlayerId].pawnSkin;
        const baseColor = getCosmeticColor(currentPlayerSkin, currentPlayerId === 0 ? COLORS.pawnBlue : COLORS.pawnRed);
        const vmFill = hexToRgba(baseColor, 0.4);
        const vmStroke = hexToRgba(baseColor, 0.6);

        ctx.fillStyle = vmFill;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = vmStroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw placed walls
    for (const wall of gameState.board.walls) {
      drawWall(ctx, wall.row, wall.col, wall.orientation, wall.placedBy);
    }

    // Draw wall preview
    if (hoverWall && isInteractive && mode === 'wall') {
      const isValid = validateMove(gameState, currentPlayerId, {
        type: 'wall',
        wall: hoverWall,
      }) === null;

      drawWallPreview(ctx, hoverWall.row, hoverWall.col, hoverWall.orientation, isValid);
    }

    // Draw pawns
    drawPawn(ctx, gameState.players[0].position, 0, gameState.currentTurn === 0);
    drawPawn(ctx, gameState.players[1].position, 1, gameState.currentTurn === 1);

  }, [gameState, hoverCell, hoverWall, validMoves, mode, isInteractive, currentPlayerId, getCellPos, cellSize, COLORS, drawPawn, drawWall, drawWallPreview]);

  // ================================================================
  // INTERACTION HANDLERS
  // ================================================================

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isInteractive) return;

    const result = posToCell(e.clientX, e.clientY);
    if (!result) {
      setHoverCell(null);
      setHoverWall(null);
      return;
    }

    const { row, col, inGap, gapH, gapV } = result;
    const currentPlayer = gameState.players[currentPlayerId];

    // Determine if player has walls and update mode
    if (inGap && currentPlayer.wallsRemaining > 0) {
      setMode('wall');
      setHoverCell(null);

      // Calculate wall anchor based on gap position
      let wallRow = row;
      let wallCol = col;
      let orient = wallOrientation;

      // If in horizontal gap (below cell), place horizontal wall
      // If in vertical gap (right of cell), place vertical wall
      if (gapH && !gapV) {
        orient = 'horizontal';
        wallCol = Math.max(0, Math.min(col, BOARD_SIZE - 2));
        wallRow = Math.min(row, BOARD_SIZE - 2);
      } else if (gapV && !gapH) {
        orient = 'vertical';
        wallRow = Math.max(0, Math.min(row, BOARD_SIZE - 2));
        wallCol = Math.min(col, BOARD_SIZE - 2);
      } else {
        // In corner gap — use selected orientation
        wallRow = Math.min(row, BOARD_SIZE - 2);
        wallCol = Math.min(col, BOARD_SIZE - 2);
      }

      setHoverWall({ row: wallRow, col: wallCol, orientation: orient });
    } else {
      setMode('move');
      setHoverWall(null);
      setHoverCell({ row: row as Coord, col: col as Coord });
    }
  }, [isInteractive, posToCell, gameState, currentPlayerId, wallOrientation]);

  const handlePointerLeave = useCallback(() => {
    setHoverCell(null);
    setHoverWall(null);
  }, []);

  const handleClick = useCallback((e: React.PointerEvent) => {
    if (!isInteractive || gameState.phase !== GamePhase.Playing) return;

    const result = posToCell(e.clientX, e.clientY);
    if (!result) return;

    const { row, col, inGap } = result;
    const currentPlayer = gameState.players[currentPlayerId];

    if (inGap && currentPlayer.wallsRemaining > 0 && hoverWall) {
      // Place wall
      const success = makeMove({
        type: 'wall',
        wall: hoverWall,
      });
      if (success) {
        setHoverWall(null);
      }
    } else {
      // Move pawn
      const target: Position = { row: row as Coord, col: col as Coord };
      const isValid = validMoves.some(m => m.row === target.row && m.col === target.col);

      if (isValid) {
        makeMove({ type: 'move', to: target });
      }
    }
  }, [isInteractive, gameState, posToCell, currentPlayerId, hoverWall, makeMove, validMoves]);

  // ================================================================
  // CANVAS SIZE MANAGEMENT
  // ================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const size = Math.floor(Math.min(width, height));
        setCanvasSize(size);
      }
    });

    observer.observe(container);
    // Initial size
    const rect = container.getBoundingClientRect();
    setCanvasSize(Math.floor(Math.min(rect.width, rect.height)));

    return () => observer.disconnect();
  }, []);

  // Re-draw on state change
  useEffect(() => {
    draw();
  }, [draw, canvasSize]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="game-board-canvas"
        style={{ width: canvasSize, height: canvasSize }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handleClick}
      />
    </div>
  );
}
