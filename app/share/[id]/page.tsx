import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import SharePlanView from './SharePlanView';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function loadSharedPlan(id: string) {
  if (supabaseUrl.length < 10 || serviceKey.length < 10) return null;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.storage
    .from('shared-plans')
    .download(`${id}.json`);
  if (error || !data) return null;
  try {
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const plan = await loadSharedPlan(id);
  if (!plan) notFound();

  return <SharePlanView data={plan} />;
}

export const dynamic = 'force-dynamic';
