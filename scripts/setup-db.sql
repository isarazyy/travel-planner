-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- 1. User profiles table (usage tracking + whitelist)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  is_whitelisted BOOLEAN DEFAULT FALSE,
  generation_count INTEGER DEFAULT 0,
  chat_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (admin operations)
CREATE POLICY "service_role_full" ON user_profiles FOR ALL
  USING (true) WITH CHECK (true);

-- Allow users to read their own profile
CREATE POLICY "users_read_own" ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 1b. Add new columns (safe to run multiple times)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS estimated_cost_yuan NUMERIC(10,4) DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;

-- 2. Trips table (if not already created)
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  departure TEXT,
  destination TEXT,
  destinations TEXT[],
  date_mode TEXT,
  start_date TEXT,
  end_date TEXT,
  people_count INTEGER DEFAULT 1,
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_crud_own_trips" ON trips FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_trips" ON trips FOR ALL
  USING (true) WITH CHECK (true);

-- 3. Trip plans table (if not already created)
CREATE TABLE IF NOT EXISTS trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  mode TEXT,
  plan_name TEXT,
  plan_description TEXT,
  transport_detail TEXT,
  itinerary JSONB,
  attractions JSONB,
  accommodations JSONB,
  food_spots JSONB,
  cost_breakdown JSONB,
  estimated_total NUMERIC DEFAULT 0,
  tips JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_crud_own_plans" ON trip_plans FOR ALL
  USING (
    EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_plans.trip_id AND trips.user_id = auth.uid())
  );

CREATE POLICY "service_role_plans" ON trip_plans FOR ALL
  USING (true) WITH CHECK (true);

-- 4. Generation jobs table (async background generation)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  form_data JSONB NOT NULL DEFAULT '{}',
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_jobs" ON generation_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_jobs" ON generation_jobs FOR ALL
  USING (true) WITH CHECK (true);
