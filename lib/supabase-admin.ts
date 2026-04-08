import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function isAdminConfigured(): boolean {
  return supabaseUrl.length > 10 && serviceRoleKey.length > 10;
}

export function createAdminClient() {
  if (!isAdminConfigured()) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
