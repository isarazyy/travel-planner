import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let isConfigured = false;
try {
  if (supabaseUrl.length > 10 && supabaseKey.length > 10) {
    new URL(supabaseUrl);
    isConfigured = true;
  }
} catch {
  isConfigured = false;
}

export function createClient() {
  if (!isConfigured) return null;
  return createBrowserClient(supabaseUrl, supabaseKey);
}

export { isConfigured };
