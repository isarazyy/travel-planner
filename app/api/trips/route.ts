import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseServerConfigured } from '@/lib/supabase-env';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* ignore */ }
        },
      },
    }
  );
}

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ source: 'local' });
  }

  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ source: 'local' });

    const { data: trips, error } = await supabase
      .from('trips')
      .select('*, trip_plans(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[api/trips] supabase error:', error.message);
      return NextResponse.json({ source: 'local' });
    }
    return NextResponse.json({ source: 'cloud', trips });
  } catch (e) {
    console.error('[api/trips] network error:', e);
    return NextResponse.json({ source: 'local' });
  }
}
