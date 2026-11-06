// ============================================================
// Wall Duel — Brand constants (single place to rename the game)
// ============================================================

export const GAME_NAME = 'Wall Duel';

/** Prefix for every key the game stores (CrazyGames Data module or localStorage). */
export const STORAGE_PREFIX = 'wallduel_';

/** Key prefix used by the previous build ("Rush Wall"), migrated on first load. */
export const LEGACY_STORAGE_PREFIX = 'rushwall_';

/** Supabase Realtime channel names. */
export const CHANNELS = {
  lobby: 'wallduel_lobby',
  room: (code: string) => `wallduel_room_${code}`,
  game: (gameId: string) => `wallduel_game_${gameId}`,
};
