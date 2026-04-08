import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isSupabaseServerConfigured } from '@/lib/supabase-env';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase-admin';

const GUEST_FREE_USES = Number(process.env.GUEST_FREE_USES) || 3;
const COOKIE_NAME = 'guest_uses';

export type UsageCheckResult = {
  allowed: boolean;
  reason?: 'guest_limit' | 'quota_exceeded' | 'blacklisted';
  userId?: string | null;
  isWhitelisted?: boolean;
  guestCount?: number;
};

export function getGuestUsageFromCookie(request: NextRequest): number {
  const val = request.cookies.get(COOKIE_NAME)?.value;
  const n = parseInt(val || '0', 10);
  return isNaN(n) ? 0 : n;
}

export function setGuestUsageCookie(headers: Headers, count: number) {
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${count}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`,
  );
}

export async function checkUsageLimit(request: NextRequest): Promise<UsageCheckResult> {
  // Try to get the logged-in user
  if (isSupabaseServerConfigured()) {
    try {
      const response = { cookies: { set: () => {} } };
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll() {},
          },
        },
      );
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Logged-in user: check whitelist and blacklist
        let isWhitelisted = false;
        if (isAdminConfigured()) {
          const admin = createAdminClient()!;
          const { data: profile } = await admin
            .from('user_profiles')
            .select('is_whitelisted, is_blacklisted')
            .eq('user_id', user.id)
            .single();
          if (profile?.is_blacklisted === true) {
            return { allowed: false, reason: 'blacklisted', userId: user.id };
          }
          isWhitelisted = profile?.is_whitelisted === true;
        }
        return { allowed: true, userId: user.id, isWhitelisted };
      }
    } catch {
      // Auth check failed, treat as guest
    }
  }

  // Guest user: check cookie-based usage count
  const guestCount = getGuestUsageFromCookie(request);
  if (guestCount >= GUEST_FREE_USES) {
    return { allowed: false, reason: 'guest_limit', guestCount };
  }

  return { allowed: true, userId: null, guestCount };
}

// qwen-turbo pricing (yuan per 1000 tokens)
const INPUT_PRICE = 0.0003;
const OUTPUT_PRICE = 0.0006;

export function estimateCostYuan(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1000) * INPUT_PRICE + (completionTokens / 1000) * OUTPUT_PRICE;
}

export async function recordUsage(
  userId: string | null | undefined,
  type: 'generation' | 'chat',
  tokens?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null,
) {
  if (!userId || !isAdminConfigured()) return;
  const admin = createAdminClient();
  if (!admin) return;

  const addTokens = tokens?.total_tokens ?? 0;
  const addCost = tokens
    ? estimateCostYuan(tokens.prompt_tokens, tokens.completion_tokens)
    : 0;

  try {
    const { data: existing } = await admin
      .from('user_profiles')
      .select('generation_count, chat_count, total_tokens, estimated_cost_yuan')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const updates: Record<string, unknown> = {
        total_tokens: (existing.total_tokens || 0) + addTokens,
        estimated_cost_yuan: parseFloat(
          ((parseFloat(existing.estimated_cost_yuan) || 0) + addCost).toFixed(4),
        ),
        updated_at: new Date().toISOString(),
      };
      if (type === 'generation') {
        updates.generation_count = (existing.generation_count || 0) + 1;
      } else {
        updates.chat_count = (existing.chat_count || 0) + 1;
      }
      await admin.from('user_profiles').update(updates).eq('user_id', userId);
    }
  } catch (e) {
    console.error('[usage] recordUsage failed:', e);
  }
}
