/**
 * Creates the generation_jobs table via Supabase Management API.
 * Run: node scripts/create-jobs-table.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  form_data JSONB NOT NULL DEFAULT '{}',
  trip_id UUID,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='users_read_own_jobs') THEN
    CREATE POLICY "users_read_own_jobs" ON generation_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_jobs' AND policyname='service_role_jobs') THEN
    CREATE POLICY "service_role_jobs" ON generation_jobs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
if (error) {
  console.log('rpc exec_sql not available, trying direct approach...');
  // Fallback: try inserting a test row to verify table exists, create via fetch
  const resp = await fetch(`${url}/rest/v1/generation_jobs?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (resp.ok) {
    console.log('Table generation_jobs already exists!');
  } else {
    console.error('Table does not exist. Please run the following SQL in Supabase Dashboard SQL Editor:');
    console.log('\n' + sql + '\n');
    console.log('Go to: https://supabase.com/dashboard → SQL Editor → New Query → paste & run');
  }
} else {
  console.log('Table created successfully!');
}
