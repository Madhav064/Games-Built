import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Ensures the user is anonymously authenticated with Supabase.
 */
export async function ensureAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      console.error("Failed to sign in anonymously:", signInError);
    }
  }
}

/**
 * Get current user ID, falling back to a locally generated ID if auth is disabled
 */
export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;

  // Fallback if Supabase anonymous auth is not enabled in the dashboard
  let localId = localStorage.getItem('rw_local_uid');
  if (!localId) {
    localId = 'anon_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('rw_local_uid', localId);
  }
  return localId;
}
