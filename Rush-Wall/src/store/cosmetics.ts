// ============================================================
// Wall Duel — Cosmetics catalog
// Every item carries render data used by BOTH the canvas board
// and the shop previews, so they can never disagree.
// ============================================================

import type { CosmeticItem, Rarity } from '../game/types';

// ------------------------------------------------------------
// Render specs
// ------------------------------------------------------------
export interface PawnSpec {
  /** Main colour and darker shade for the glossy sphere. */
  color: string;
  shade: string;
  /** Optional second colour for two-tone pawns. */
  accent?: string;
  icon?: string;
}

export type WallStyle = 'match' | 'solid' | 'gradient' | 'rainbow';
export interface WallSpec {
  style: WallStyle;
  /** Colours along the wall (ignored by 'match', which copies the pawn colour). */
  colors: string[];
  glow?: string;
}

export interface BoardSpec {
  /** Classic theme follows the app's light/dark mode. */
  followsAppTheme?: boolean;
  frame: string;
  surface: string;
  cellA: string;
  cellB: string;
  /** Tint of each player's goal row. */
  goalTint: number;
  edge: string;
}

export interface PawnItem extends CosmeticItem { type: 'pawn'; spec: PawnSpec }
export interface WallItem extends CosmeticItem { type: 'wall'; spec: WallSpec }
export interface BoardItem extends CosmeticItem { type: 'board'; spec: BoardSpec }
export interface EmoteItem extends CosmeticItem { type: 'emote'; emoji: string }
export interface AvatarItem extends CosmeticItem { type: 'avatar'; image: string }
export type AnyCosmetic = PawnItem | WallItem | BoardItem | EmoteItem | AvatarItem;

// ------------------------------------------------------------
// Catalog (ids are kept from earlier builds so saved profiles still match)
// ------------------------------------------------------------
const pawn = (id: string, name: string, price: number, rarity: Rarity, spec: PawnSpec, free = false): PawnItem =>
  ({ id, name, type: 'pawn', price, rarity, spec, free });
const wall = (id: string, name: string, price: number, rarity: Rarity, spec: WallSpec, free = false): WallItem =>
  ({ id, name, type: 'wall', price, rarity, spec, free });
const board = (id: string, name: string, price: number, rarity: Rarity, spec: BoardSpec, free = false): BoardItem =>
  ({ id, name, type: 'board', price, rarity, spec, free });
const emote = (id: string, name: string, price: number, rarity: Rarity, emoji: string, free = false): EmoteItem =>
  ({ id, name, type: 'emote', price, rarity, emoji, free });

export const PAWNS: PawnItem[] = [
  pawn('pawn_blue', 'Sapphire', 0, 'common', { color: '#2f8cff', shade: '#1450b8' }, true),
  pawn('pawn_red', 'Crimson', 0, 'common', { color: '#f04848', shade: '#a81c2c' }, true),
  pawn('pawn_cyan', 'Cyan Crystal', 100, 'common', { color: '#22d3ee', shade: '#0e7490' }),
  pawn('pawn_amber', 'Amber Gem', 100, 'common', { color: '#fbbf24', shade: '#b45309' }),
  pawn('pawn_emerald', 'Emerald', 150, 'rare', { color: '#34d399', shade: '#047857' }),
  pawn('pawn_ruby', 'Ruby Fire', 150, 'rare', { color: '#fb3a6b', shade: '#9f1239', icon: '🔥' }),
  pawn('pawn_violet', 'Violet Storm', 200, 'rare', { color: '#a855f7', shade: '#6b21a8', icon: '⚡' }),
  pawn('pawn_gold', 'Golden Crown', 500, 'epic', { color: '#facc15', shade: '#a16207', icon: '👑' }),
  pawn('pawn_nebula', 'Nebula Core', 800, 'epic', { color: '#6366f1', shade: '#1e1b4b', accent: '#ec4899', icon: '🪐' }),
  pawn('pawn_diamond', 'Diamond Prism', 1000, 'legendary', { color: '#a5f3fc', shade: '#6d28d9', accent: '#f9a8d4', icon: '💎' }),
];

export const WALLS: WallItem[] = [
  wall('wall_default', 'Match Pawn', 0, 'common', { style: 'match', colors: [] }, true),
  wall('wall_classic', 'Oak', 0, 'common', { style: 'gradient', colors: ['#d6a46a', '#a86b32'] }, true),
  wall('wall_neon_green', 'Neon Green', 200, 'rare', { style: 'solid', colors: ['#39ff14'], glow: '#39ff14' }),
  wall('wall_fire', 'Firewall', 300, 'rare', { style: 'gradient', colors: ['#ff3d00', '#ffb300'], glow: '#ff6d00' }),
  wall('wall_ice', 'Ice Barrier', 300, 'rare', { style: 'gradient', colors: ['#e0f7ff', '#38bdf8'], glow: '#7dd3fc' }),
  wall('wall_shadow', 'Shadow Gate', 500, 'epic', { style: 'gradient', colors: ['#64748b', '#0f172a'], glow: '#a855f7' }),
  wall('wall_rainbow', 'Rainbow', 750, 'epic', { style: 'rainbow', colors: ['#ff3b3b', '#ff9f1c', '#ffe14d', '#3ddc84', '#3b82f6', '#a855f7'] }),
  wall('wall_gold', 'Gold Bar', 1200, 'legendary', { style: 'gradient', colors: ['#fff7c2', '#f5b301', '#a16207'], glow: '#facc15' }),
];

export const BOARDS: BoardItem[] = [
  board('board_default', 'Classic', 0, 'common', {
    followsAppTheme: true, frame: '', surface: '', cellA: '', cellB: '', goalTint: 0.16, edge: '',
  }, true),
  board('board_ocean', 'Deep Ocean', 400, 'rare', {
    frame: '#08303f', surface: '#0b4257', cellA: '#13627c', cellB: '#105770', goalTint: 0.22, edge: '#5eead4',
  }),
  board('board_forest', 'Enchanted Forest', 400, 'rare', {
    frame: '#1b2e1b', surface: '#22391f', cellA: '#35552c', cellB: '#2f4d27', goalTint: 0.22, edge: '#bef264',
  }),
  board('board_crimson', 'Crimson Arena', 400, 'rare', {
    frame: '#2b1013', surface: '#3a151a', cellA: '#5a2128', cellB: '#4f1c23', goalTint: 0.22, edge: '#fda4af',
  }),
  board('board_sand', 'Desert Sand', 500, 'epic', {
    frame: '#8a5a2b', surface: '#c08a4f', cellA: '#f1d29b', cellB: '#e8c487', goalTint: 0.25, edge: '#fff1c9',
  }),
  board('board_galaxy', 'Galaxy', 800, 'epic', {
    frame: '#0b0a24', surface: '#15123a', cellA: '#2a2466', cellB: '#231e58', goalTint: 0.26, edge: '#c4b5fd',
  }),
  board('board_marble', 'Royal Marble', 1200, 'legendary', {
    frame: '#3b2f1a', surface: '#d9d4c7', cellA: '#f8f6f0', cellB: '#ece8de', goalTint: 0.2, edge: '#d4af37',
  }),
];

export const EMOTES: EmoteItem[] = [
  emote('emote_smile', 'Smile', 0, 'common', '😊', true),
  emote('emote_gg', 'GG', 50, 'common', '🤝'),
  emote('emote_fire', 'Fire', 50, 'common', '🔥'),
  emote('emote_heart', 'Heart', 50, 'common', '❤️'),
  emote('emote_thumbs_up', 'Thumbs Up', 50, 'common', '👍'),
  emote('emote_think', 'Thinking', 75, 'rare', '🤔'),
  emote('emote_laugh', 'Laugh', 75, 'rare', '😂'),
  emote('emote_cool', 'Cool', 75, 'rare', '😎'),
  emote('emote_angry', 'Angry', 75, 'rare', '😡'),
  emote('emote_mind_blown', 'Mind Blown', 100, 'rare', '🤯'),
  emote('emote_ghost', 'Ghost', 150, 'epic', '👻'),
  emote('emote_crown', 'Crown', 200, 'epic', '👑'),
  emote('emote_diamond', 'Diamond', 250, 'legendary', '💎'),
];

const AVATAR_PRICES = [0, 0, 0, 0, 0, 0, 100, 100, 150, 150, 200, 200, 250, 250, 300, 300, 350, 350, 400, 400, 500];
export const AVATARS: AvatarItem[] = AVATAR_PRICES.map((price, i) => ({
  id: `avatar_${i + 1}`,
  name: `Avatar ${i + 1}`,
  type: 'avatar',
  price,
  rarity: price === 0 ? 'common' : price < 250 ? 'rare' : price < 400 ? 'epic' : 'legendary',
  image: `./avatars/avatar_${i + 1}.png`,
  free: price === 0,
}));

export const COSMETICS: AnyCosmetic[] = [...PAWNS, ...WALLS, ...BOARDS, ...EMOTES, ...AVATARS];

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

// ------------------------------------------------------------
// Lookups
// ------------------------------------------------------------
export function findCosmetic(id: string): AnyCosmetic | undefined {
  return COSMETICS.find(c => c.id === id);
}

export function pawnSpec(id: string, fallbackId = 'pawn_blue'): PawnSpec {
  return (PAWNS.find(p => p.id === id) ?? PAWNS.find(p => p.id === fallbackId)!).spec;
}

export function wallSpec(id: string): WallSpec {
  return (WALLS.find(w => w.id === id) ?? WALLS[0]).spec;
}

export function boardSpec(id: string): BoardSpec {
  return (BOARDS.find(b => b.id === id) ?? BOARDS[0]).spec;
}

/** Avatar id meaning "use my CrazyGames profile picture". */
export const CRAZYGAMES_AVATAR_ID = 'avatar_cg';

/** Image for an avatar id, or the URL itself (CrazyGames pictures are shared as URLs). */
export function avatarImage(id: string): string {
  if (/^https:\/\//.test(id)) return id;
  return (AVATARS.find(a => a.id === id) ?? AVATARS[0]).image;
}

/** CSS background for a wall skin preview in the shop. */
export function wallPreviewCss(spec: WallSpec, pawnColor: string): string {
  if (spec.style === 'match') return pawnColor;
  if (spec.colors.length === 1) return spec.colors[0];
  return `linear-gradient(90deg, ${spec.colors.join(', ')})`;
}

/** CSS background for a pawn preview in the shop / HUD. */
export function pawnPreviewCss(spec: PawnSpec): string {
  const mid = spec.accent ? `${spec.color} 45%, ${spec.accent} 75%` : `${spec.color} 45%`;
  return `radial-gradient(circle at 32% 28%, #ffffff 0%, ${mid}, ${spec.shade} 100%)`;
}
