// ============================================================
// Wall Duel — Global leaderboard (Supabase `leaderboard` table)
// ============================================================

import { getSupabase, getUserId } from './supabase';
import { loadProfile, resolveAvatar } from '../store/profile';

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

/** Create or refresh this player's row (name, avatar, coins) without touching wins/losses. */
export async function syncLeaderboardEntry(): Promise<void> {
  const [supabase, userId] = await Promise.all([getSupabase(), getUserId()]);
  const p = loadProfile();
  const fields = { username: p.username, coins: p.coins, avatar: resolveAvatar(p) };
  const { data } = await supabase.from('leaderboard').update(fields).eq('user_id', userId).select('id');
  if (!data?.length) {
    const { error } = await supabase.from('leaderboard').insert({ user_id: userId, wins: 0, losses: 0, ...fields });
    if (error) console.warn('[Leaderboard] insert failed', error.message);
  }
}

/** Add one online win or loss for this player. */
export async function recordOnlineResult(won: boolean): Promise<void> {
  const [supabase, userId] = await Promise.all([getSupabase(), getUserId()]);
  const p = loadProfile();
  const { data: existing } = await supabase
    .from('leaderboard').select('id, wins, losses').eq('user_id', userId).maybeSingle();

  const fields = {
    username: p.username,
    coins: p.coins,
    avatar: resolveAvatar(p),
    last_played_at: new Date().toISOString(),
  };
  if (existing) {
    await supabase.from('leaderboard').update({
      ...fields,
      wins: existing.wins + (won ? 1 : 0),
      losses: (existing.losses ?? 0) + (won ? 0 : 1),
    }).eq('id', existing.id);
  } else {
    await supabase.from('leaderboard').insert({ user_id: userId, wins: won ? 1 : 0, losses: won ? 0 : 1, ...fields });
  }
}

export async function getTopPlayers(limit = 50): Promise<LeaderboardEntry[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('coins', { ascending: false })
    .order('last_played_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Leaderboard] fetch failed', error.message);
    return [];
  }
  return data as LeaderboardEntry[];
}

export async function getMyStanding(): Promise<{ userId: string; rank: number | null; wins: number; losses: number }> {
  const [supabase, userId] = await Promise.all([getSupabase(), getUserId()]);
  const { data: mine } = await supabase
    .from('leaderboard').select('wins, losses, coins').eq('user_id', userId).maybeSingle();
  if (!mine) return { userId, rank: null, wins: 0, losses: 0 };

  const { count } = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .or(`wins.gt.${mine.wins},and(wins.eq.${mine.wins},coins.gt.${mine.coins})`);
  return { userId, rank: (count ?? 0) + 1, wins: mine.wins, losses: mine.losses ?? 0 };
}
