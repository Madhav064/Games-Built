// ============================================================
// Rush Wall — Cosmetics Store & Player Profile
// ============================================================

import { type CosmeticItem, type PlayerProfile, DEFAULT_PROFILE } from '../game/types';
import { saveData, loadData } from '../sdk/crazygames';

const PROFILE_KEY = 'player_profile';

// ============================================================
// Cosmetics Catalog
// ============================================================

export const COSMETICS: CosmeticItem[] = [
  // === PAWN SKINS (default unlocked) ===
  { id: 'pawn_blue', name: 'Sapphire Blue', type: 'pawn', price: 0, preview: '#2563eb', unlocked: true },
  { id: 'pawn_red', name: 'Crimson Red', type: 'pawn', price: 0, preview: '#ef4444', unlocked: true },

  // === PAWN SKINS (purchasable) ===
  { id: 'pawn_cyan', name: 'Cyan Crystal', type: 'pawn', price: 100, preview: '#00d4ff', unlocked: false },
  { id: 'pawn_amber', name: 'Amber Gem', type: 'pawn', price: 100, preview: '#ffc857', unlocked: false },
  { id: 'pawn_emerald', name: 'Emerald Blaze', type: 'pawn', price: 150, preview: '#00ff88', unlocked: false },
  { id: 'pawn_ruby', name: 'Ruby Fire', type: 'pawn', price: 150, preview: '#ff3366', icon: '🔥', unlocked: false },
  { id: 'pawn_violet', name: 'Violet Storm', type: 'pawn', price: 200, preview: '#9b59b6', icon: '⚡', unlocked: false },
  { id: 'pawn_gold', name: 'Golden Crown', type: 'pawn', price: 500, preview: '#f7d000', icon: '👑', unlocked: false },
  { id: 'pawn_diamond', name: 'Diamond Prism', type: 'pawn', price: 1000, preview: 'linear-gradient(135deg, #ff9eb5, #a8edea)', icon: '♦️', unlocked: false },
  { id: 'pawn_nebula', name: 'Nebula Core', type: 'pawn', price: 800, preview: '#302b63', icon: '🪐', unlocked: false },

  // === WALL SKINS ===
  { id: 'wall_default', name: 'Match Pawn', type: 'wall', price: 0, preview: 'linear-gradient(135deg, #00b4d8 50%, #ef4444 50%)', unlocked: true },
  { id: 'wall_classic', name: 'Classic Wall', type: 'wall', price: 0, preview: '#4a9eff', unlocked: true },
  { id: 'wall_neon_green', name: 'Neon Green', type: 'wall', price: 200, preview: '#39ff14', unlocked: false },
  { id: 'wall_fire', name: 'Firewall', type: 'wall', price: 300, preview: 'linear-gradient(180deg, #ff4500, #ff8c00)', unlocked: false },
  { id: 'wall_ice', name: 'Ice Barrier', type: 'wall', price: 300, preview: 'linear-gradient(180deg, #00bfff, #87ceeb)', unlocked: false },
  { id: 'wall_rainbow', name: 'Rainbow Wall', type: 'wall', price: 750, preview: 'linear-gradient(90deg, #ff0000, #ff7700, #ffff00, #00ff00, #0000ff, #8b00ff)', unlocked: false },
  { id: 'wall_shadow', name: 'Shadow Gate', type: 'wall', price: 500, preview: 'linear-gradient(180deg, #2c3e50, #000000)', unlocked: false },

  // === BOARD THEMES ===
  { id: 'board_default', name: 'Classic Dark', type: 'board', price: 0, preview: '#1a1a2e', unlocked: true },
  { id: 'board_ocean', name: 'Deep Ocean', type: 'board', price: 400, preview: 'linear-gradient(180deg, #0c3547, #134e5e)', unlocked: false },
  { id: 'board_forest', name: 'Enchanted Forest', type: 'board', price: 400, preview: 'linear-gradient(180deg, #1a2a1a, #2d4a2d)', unlocked: false },
  { id: 'board_crimson', name: 'Crimson Arena', type: 'board', price: 400, preview: 'linear-gradient(180deg, #2e1a1a, #4a2d2d)', unlocked: false },
  { id: 'board_galaxy', name: 'Galaxy Board', type: 'board', price: 800, preview: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', unlocked: false },

  // === EMOTES ===
  { id: 'emote_smile', name: 'Smile Emote', type: 'emote', price: 0, preview: '😊', unlocked: true },
  { id: 'emote_gg', name: '\"GG\" Emote', type: 'emote', price: 50, preview: '🤝', unlocked: false },
  { id: 'emote_fire', name: 'Fire Emote', type: 'emote', price: 50, preview: '🔥', unlocked: false },
  { id: 'emote_heart', name: 'Heart Emote', type: 'emote', price: 50, preview: '❤️', unlocked: false },
  { id: 'emote_thumbs_up', name: 'Thumbs Up', type: 'emote', price: 50, preview: '👍', unlocked: false },
  { id: 'emote_think', name: 'Thinking Emote', type: 'emote', price: 75, preview: '🤔', unlocked: false },
  { id: 'emote_laugh', name: 'Laugh Emote', type: 'emote', price: 75, preview: '😂', unlocked: false },
  { id: 'emote_cool', name: 'Cool Emote', type: 'emote', price: 75, preview: '😎', unlocked: false },
  { id: 'emote_angry', name: 'Angry Emote', type: 'emote', price: 75, preview: '😡', unlocked: false },
  { id: 'emote_mind_blown', name: 'Mind Blown', type: 'emote', price: 100, preview: '🤯', unlocked: false },
  { id: 'emote_ghost', name: 'Ghost Emote', type: 'emote', price: 150, preview: '👻', unlocked: false },
  { id: 'emote_crown', name: 'Crown Emote', type: 'emote', price: 200, preview: '👑', unlocked: false },
  { id: 'emote_diamond', name: 'Diamond Emote', type: 'emote', price: 250, preview: '💎', unlocked: false },

  // === AVATARS ===
  { id: 'avatar_1', name: 'Avatar 1', type: 'avatar', price: 0, preview: './avatars/avatar_1.png', unlocked: true },
  { id: 'avatar_2', name: 'Avatar 2', type: 'avatar', price: 0, preview: './avatars/avatar_2.png', unlocked: true },
  { id: 'avatar_3', name: 'Avatar 3', type: 'avatar', price: 0, preview: './avatars/avatar_3.png', unlocked: true },
  { id: 'avatar_4', name: 'Avatar 4', type: 'avatar', price: 0, preview: './avatars/avatar_4.png', unlocked: true },
  { id: 'avatar_5', name: 'Avatar 5', type: 'avatar', price: 0, preview: './avatars/avatar_5.png', unlocked: true },
  { id: 'avatar_6', name: 'Avatar 6', type: 'avatar', price: 0, preview: './avatars/avatar_6.png', unlocked: true },
  { id: 'avatar_7', name: 'Avatar 7', type: 'avatar', price: 100, preview: './avatars/avatar_7.png', unlocked: false },
  { id: 'avatar_8', name: 'Avatar 8', type: 'avatar', price: 100, preview: './avatars/avatar_8.png', unlocked: false },
  { id: 'avatar_9', name: 'Avatar 9', type: 'avatar', price: 150, preview: './avatars/avatar_9.png', unlocked: false },
  { id: 'avatar_10', name: 'Avatar 10', type: 'avatar', price: 150, preview: './avatars/avatar_10.png', unlocked: false },
  { id: 'avatar_11', name: 'Avatar 11', type: 'avatar', price: 200, preview: './avatars/avatar_11.png', unlocked: false },
  { id: 'avatar_12', name: 'Avatar 12', type: 'avatar', price: 200, preview: './avatars/avatar_12.png', unlocked: false },
  { id: 'avatar_13', name: 'Avatar 13', type: 'avatar', price: 250, preview: './avatars/avatar_13.png', unlocked: false },
  { id: 'avatar_14', name: 'Avatar 14', type: 'avatar', price: 250, preview: './avatars/avatar_14.png', unlocked: false },
  { id: 'avatar_15', name: 'Avatar 15', type: 'avatar', price: 300, preview: './avatars/avatar_15.png', unlocked: false },
  { id: 'avatar_16', name: 'Avatar 16', type: 'avatar', price: 300, preview: './avatars/avatar_16.png', unlocked: false },
  { id: 'avatar_17', name: 'Avatar 17', type: 'avatar', price: 350, preview: './avatars/avatar_17.png', unlocked: false },
  { id: 'avatar_18', name: 'Avatar 18', type: 'avatar', price: 350, preview: './avatars/avatar_18.png', unlocked: false },
  { id: 'avatar_19', name: 'Avatar 19', type: 'avatar', price: 400, preview: './avatars/avatar_19.png', unlocked: false },
  { id: 'avatar_20', name: 'Avatar 20', type: 'avatar', price: 400, preview: './avatars/avatar_20.png', unlocked: false },
  { id: 'avatar_21', name: 'Avatar 21', type: 'avatar', price: 500, preview: './avatars/avatar_21.png', unlocked: false },
];

// ============================================================
// Profile Management
// ============================================================

/**
 * Helper to extract a solid color from a cosmetic preview (e.g., gradient string).
 */
export function getCosmeticColor(itemId: string, fallback: string): string {
  const item = COSMETICS.find(c => c.id === itemId);
  if (!item) return fallback;
  const match = item.preview.match(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/);
  return match ? match[0] : fallback;
}

let cachedProfile: PlayerProfile | null = null;

/**
 * Load the player profile from storage.
 */
export function loadProfile(): PlayerProfile {
  if (cachedProfile) return cachedProfile;

  const raw = loadData(PROFILE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PlayerProfile;
      // Merge with defaults to handle new fields
      cachedProfile = { ...DEFAULT_PROFILE, ...parsed };
      return cachedProfile;
    } catch (e) {
      console.warn('Failed to parse saved profile:', e);
    }
  }

  cachedProfile = { ...DEFAULT_PROFILE, createdAt: Date.now(), lastPlayedAt: Date.now() };
  saveProfile(cachedProfile);
  return cachedProfile;
}

/**
 * Save the player profile to storage.
 */
export function saveProfile(profile: PlayerProfile): void {
  cachedProfile = profile;
  saveData(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Update specific fields of the profile.
 */
export function updateProfile(updates: Partial<PlayerProfile>): PlayerProfile {
  const profile = loadProfile();
  const updated = { ...profile, ...updates, lastPlayedAt: Date.now() };
  saveProfile(updated);
  return updated;
}

/**
 * Add coins to the player's balance.
 */
export function addCoins(amount: number): PlayerProfile {
  const profile = loadProfile();
  return updateProfile({ coins: profile.coins + amount });
}

/**
 * Attempt to purchase a cosmetic item.
 * Returns true if successful, false if insufficient funds or already owned.
 */
export function purchaseCosmetic(itemId: string): { success: boolean; message: string } {
  const profile = loadProfile();
  const item = COSMETICS.find(c => c.id === itemId);

  if (!item) {
    return { success: false, message: 'Item not found' };
  }

  if (profile.unlockedCosmetics.includes(itemId)) {
    return { success: false, message: 'Already owned' };
  }

  if (profile.coins < item.price) {
    return { success: false, message: `Not enough coins (need ${item.price - profile.coins} more)` };
  }

  updateProfile({
    coins: profile.coins - item.price,
    unlockedCosmetics: [...profile.unlockedCosmetics, itemId],
  });

  return { success: true, message: 'Purchase successful!' };
}

/**
 * Equip a cosmetic item.
 */
export function equipCosmetic(itemId: string): boolean {
  const profile = loadProfile();
  const item = COSMETICS.find(c => c.id === itemId);

  if (!item || !profile.unlockedCosmetics.includes(itemId)) {
    return false;
  }

  switch (item.type) {
    case 'pawn':
      updateProfile({ equippedPawnSkin: itemId });
      break;
    case 'wall':
      updateProfile({ equippedWallSkin: itemId });
      break;
    case 'board':
      updateProfile({ equippedBoardTheme: itemId });
      break;
    case 'avatar':
      updateProfile({ equippedAvatar: itemId });
      break;
    default:
      break;
  }

  return true;
}

/**
 * Record a game result and award coins.
 */
export function recordGameResult(won: boolean, movesPlayed: number, wallsPlaced: number, coinsEarned: number): PlayerProfile {
  const profile = loadProfile();

  const updates: Partial<PlayerProfile> = {
    gamesPlayed: profile.gamesPlayed + 1,
    gamesWon: won ? profile.gamesWon + 1 : profile.gamesWon,
    gamesLost: won ? profile.gamesLost : profile.gamesLost + 1,
    winStreak: won ? profile.winStreak + 1 : 0,
    bestWinStreak: won
      ? Math.max(profile.bestWinStreak, profile.winStreak + 1)
      : profile.bestWinStreak,
    coins: profile.coins + coinsEarned,
    totalMovesPlayed: profile.totalMovesPlayed + movesPlayed,
    totalWallsPlaced: profile.totalWallsPlaced + wallsPlaced,
  };

  return updateProfile(updates);
}

/**
 * Get cosmetics list with unlock status from profile.
 */
export function getCosmeticsWithStatus(): CosmeticItem[] {
  const profile = loadProfile();
  return COSMETICS.map(item => ({
    ...item,
    unlocked: profile.unlockedCosmetics.includes(item.id),
  }));
}
