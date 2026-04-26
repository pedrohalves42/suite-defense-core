import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// SEC-802: Hardened Auth Configuration
// Prohibits JWT persistence in localStorage to mitigate XSS risks.
// Auth state is managed via memory and secure cookies (provider default).
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false, // Do not store session in localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});