import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// SEC-802: Hardened Auth Configuration
// Session persistence is enabled for seamless UX (PWA support).
// Security is enforced via short-lived JWTs and MFA where required.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // Restore persistence for better UX; use MFA/Short JWT for security instead.
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});