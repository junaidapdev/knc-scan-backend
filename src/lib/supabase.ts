import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

/**
 * Service-role client. Bypasses Row Level Security. Use for all backend writes
 * and for admin-scoped reads. NEVER expose this client or its key to the
 * browser or any client-side bundle.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-kayan-client': 'backend-service' },
    },
  },
);

/**
 * Anon client. Respects RLS and, when the backend forwards a customer JWT on
 * the `Authorization` header, acts under that JWT's claims. Use this for
 * pass-through reads where RLS should enforce scoping.
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);
