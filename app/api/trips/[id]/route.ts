import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id.startsWith('local_')) {
    return NextResponse.json({ source: 'local', id });
  }

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ source: 'local', id });
  }

  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ source: 'local', id });
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .select('*, trip_plans(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !trip) return NextResponse.json({ error: '行程不存在' }, { status: 404 });
    return NextResponse.json(trip);
  } catch {
    return NextResponse.json({ source: 'local', id });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id.startsWith('local_')) {
    return NextResponse.json({ source: 'local', id });
  }

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ source: 'local', id });
  }

  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ source: 'local', id });

    const { error } = await supabase
      .from('trips')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ source: 'local', id });
  }
}
