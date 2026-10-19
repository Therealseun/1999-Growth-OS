import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';

// Used for Auth (sign up, log in, refresh) only. Data access goes through lib/db.js.
// A fresh client per call, with sessions switched off, so one user's session can never leak into another request.
export function authClient() {
  const cfg = getConfig();
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function authAdminClient() {
  const cfg = getConfig();
  if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for Supabase admin operations');
  }
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
