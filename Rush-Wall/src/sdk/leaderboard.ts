import { supabase, getCurrentUserId, ensureAuthenticated } from './supabase';
import { loadProfile } from '../store/cosmetics';

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  username: string;
  wins: number;
  losses: number;
  coins: number;
  avatar: string;
  last_played_at: string;
}

/**
 * Increments wins on the global leaderboard (called on online WIN).
 */
export async function updateLeaderboardWin() {
  await ensureAuthenticated();
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { data: existing } = await supabase
    .from('leaderboard')
    .select('id, wins')
    .eq('user_id', userId)
    .single();

  const profile = loadProfile();

  if (existing) {
    await supabase.from('leaderboard').update({
      username: profile.username,
      wins: existing.wins + 1,
      coins: profile.coins,
      avatar: profile.equippedAvatar,
      last_played_at: new Date().toISOString()
    }).eq('id', existing.id);
  } else {
    await supabase.from('leaderboard').insert({
      user_id: userId,
      username: profile.username,
      wins: 1,
      losses: 0,
      coins: profile.coins,
      avatar: profile.equippedAvatar
    });
  }
}

/**
 * Increments losses on the global leaderboard (called on online LOSS).
 */
export async function updateLeaderboardLoss() {
  await ensureAuthenticated();
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { data: existing } = await supabase
    .from('leaderboard')
    .select('id, losses')
    .eq('user_id', userId)
    .single();

  const profile = loadProfile();

  if (existing) {
    await supabase.from('leaderboard').update({
      username: profile.username,
      losses: (existing.losses || 0) + 1,
      coins: profile.coins,
      avatar: profile.equippedAvatar,
      last_played_at: new Date().toISOString()
    }).eq('id', existing.id);
  } else {
    await supabase.from('leaderboard').insert({
      user_id: userId,
      username: profile.username,
      wins: 0,
      losses: 1,
      coins: profile.coins,
      avatar: profile.equippedAvatar
    });
  }
}

/**
 * Ensures the player has a leaderboard entry and syncs their latest profile data (avatar/name).
 * Called when any online game starts.
 */
export async function ensureLeaderboardEntry() {
  await ensureAuthenticated();
  const userId = await getCurrentUserId();
  if (!userId) return;

  const profile = loadProfile();

  // 1. Try to update existing record with fresh profile data (without touching wins/losses)
  const { data, error } = await supabase
    .from('leaderboard')
    .update({
      username: profile.username,
      coins: profile.coins,
      avatar: profile.equippedAvatar,
    })
    .eq('user_id', userId)
    .select();

  // 2. If it doesn't exist, insert a fresh row with 0 wins/losses
  if (!data || data.length === 0) {
    const { error: insertError } = await supabase.from('leaderboard').insert({
      user_id: userId,
      username: profile.username,
      wins: 0,
      losses: 0,
      coins: profile.coins,
      avatar: profile.equippedAvatar,
    });
    
    if (insertError) {
      console.warn('ensureLeaderboardEntry insert:', (insertError as any).message);
    }
  } else if (error) {
    console.warn('ensureLeaderboardEntry update:', (error as any).message);
  }
}

/**
 * Retrieves the top 50 players by wins.
 */
export async function getTopPlayers(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('coins', { ascending: false }) // Secondary sort by coins
    .order('last_played_at', { ascending: false }) // Tertiary sort if coins are equal
    .limit(50);
    
  if (error) {
    console.error("Failed to fetch leaderboard:", error);
    return [];
  }
  
  return data as LeaderboardEntry[];
}

/**
 * Gets the current player's global rank and online stats.
 */
export async function getPlayerRank(): Promise<{ rank: number; onlineWins: number; onlineLosses: number }> {
  await ensureAuthenticated();
  const userId = await getCurrentUserId();
  
  const { data: myData } = await supabase
    .from('leaderboard')
    .select('wins, losses, coins')
    .eq('user_id', userId)
    .single();
    
  const onlineWins = myData?.wins || 0;
  const onlineLosses = myData?.losses || 0;
  const myCoins = myData?.coins || 0;

  // Rank is calculated by counting players who have:
  // 1. More wins OR
  // 2. Same wins AND more coins
  const { count, error } = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .or(`wins.gt.${onlineWins},and(wins.eq.${onlineWins},coins.gt.${myCoins})`);

  if (error) {
    console.error("Failed to fetch player rank:", error);
    return { rank: -1, onlineWins: 0, onlineLosses: 0 };
  }

  return { rank: (count || 0) + 1, onlineWins, onlineLosses };
}
