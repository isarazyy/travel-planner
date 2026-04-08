-- 发布准备：多目的地、日期模式、trip_plans.mode 放宽（支持摩托/多方案等）
-- 在 Supabase SQL Editor 中执行（可与 001 分开执行）

alter table public.trips
  add column if not exists destinations text[] default array[]::text[];

alter table public.trips
  add column if not exists date_mode text default 'fixed';

alter table public.trip_plans drop constraint if exists trip_plans_mode_check;
