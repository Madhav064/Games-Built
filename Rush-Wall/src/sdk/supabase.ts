// ============================================================
// Wall Duel — Supabase client (loaded lazily, only for online
// play and the leaderboard, so the first load stays small).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let clientPromise: Promise<SupabaseClient> | null = null;

export const isOnlineConfigured = (): boolean => !!url && !!anonKey;

export function getSupabase(): Promise<SupabaseClient> {
  if (!isOnlineConfigured()) return Promise.reject(new Error('Online play is not configured (missing Supabase env vars).'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url!, anonKey!));
  return clientPromise;
}

/** Signs in anonymously if needed and returns the user id. */
export async function getUserId(): Promise<string> {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (data.user?.id) return data.user.id;

  // Anonymous auth disabled in the Supabase dashboard: fall back to a device id.
  console.warn('[Supabase] Anonymous sign-in failed, using a device id.', error);
  let localId = localStorage.getItem('wallduel_device_id');
  if (!localId) {
    localId = `device_${crypto.randomUUID()}`;
    localStorage.setItem('wallduel_device_id', localId);
  }
  return localId;
}
