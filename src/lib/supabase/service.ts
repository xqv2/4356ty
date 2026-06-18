// src/lib/supabase/service.ts
// Supabase client using the service role key. Bypasses RLS.
// Server-side only — never import from client components.

import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getAdminUserId(): string {
  const id = process.env.ADMIN_USER_ID;
  if (!id) throw new Error('ADMIN_USER_ID env var is not set');
  return id;
}
