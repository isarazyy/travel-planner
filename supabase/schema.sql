-- Supabase Schema for Travel Planner
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Trips table
create table if not exists public.trips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  departure text not null,
  destination text not null,
  destinations text[] default array[]::text[],
  date_mode text default 'fixed',
  start_date date not null,
  end_date date not null,
  people_count int not null default 1,
  preferences jsonb not null default '{}',
  created_at timestamptz default now() not null
);

-- Trip plans table (one per travel mode per trip)
create table if not exists public.trip_plans (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  mode text not null,
  transport_detail text default '',
  itinerary jsonb not null default '[]',
  attractions jsonb not null default '[]',
  accommodations jsonb not null default '[]',
  food_spots jsonb not null default '[]',
  cost_breakdown jsonb not null default '{}',
  estimated_total int not null default 0,
  tips jsonb not null default '[]',
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_trips_created_at on public.trips(created_at desc);
create index if not exists idx_trip_plans_trip_id on public.trip_plans(trip_id);

-- Row Level Security
alter table public.trips enable row level security;
alter table public.trip_plans enable row level security;

-- Trips policies: users can only access their own trips（可重复执行）
drop policy if exists "Users can view own trips" on public.trips;
drop policy if exists "Users can create own trips" on public.trips;
drop policy if exists "Users can delete own trips" on public.trips;
drop policy if exists "Users can view own trip plans" on public.trip_plans;
drop policy if exists "Users can create own trip plans" on public.trip_plans;
drop policy if exists "Users can delete own trip plans" on public.trip_plans;

create policy "Users can view own trips"
  on public.trips for select
  using (auth.uid() = user_id);

create policy "Users can create own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own trips"
  on public.trips for delete
  using (auth.uid() = user_id);

-- Trip plans policies: users can access plans for their own trips
create policy "Users can view own trip plans"
  on public.trip_plans for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_plans.trip_id
      and trips.user_id = auth.uid()
    )
  );

create policy "Users can create own trip plans"
  on public.trip_plans for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_plans.trip_id
      and trips.user_id = auth.uid()
    )
  );

create policy "Users can delete own trip plans"
  on public.trip_plans for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_plans.trip_id
      and trips.user_id = auth.uid()
    )
  );
