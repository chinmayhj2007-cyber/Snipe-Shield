import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeRole } from '@/lib/auth/validation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'recovery',
  'invite',
  'magiclink',
  'email_change',
  'email',
]);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const flow = requestUrl.searchParams.get('flow');
  const oauthError = requestUrl.searchParams.get('error');
  const requestedRole = requestUrl.searchParams.get('role');

  const invalidRedirect = new URL('/login', requestUrl.origin);
  invalidRedirect.searchParams.set('notice', 'link-invalid');

  if (oauthError) {
    return NextResponse.redirect(invalidRedirect);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    const demoRedirect = new URL('/login', requestUrl.origin);
    demoRedirect.searchParams.set('notice', 'demo');
    return NextResponse.redirect(demoRedirect);
  }

  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type && ALLOWED_OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    verified = !error;
  }

  if (!verified) {
    return NextResponse.redirect(invalidRedirect);
  }

  const isRecovery = type === 'recovery' || flow === 'recovery';

  // Ensure the profile row exists on initial signup/OAuth without ever overwriting existing roles
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(invalidRedirect);
  }

  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Auth callback profile lookup error:', profileError.message);
  } else if (!existingProfile) {
    const rawRole = requestedRole ?? user.user_metadata?.role ?? 'bidder';
    const resolvedRole = normalizeRole(rawRole);
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      '';
    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ??
      (user.user_metadata?.picture as string | undefined) ??
      null;

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email ?? user.phone ?? '',
      phone: user.phone ?? '',
      full_name: fullName,
      avatar_url: avatarUrl,
      role: resolvedRole,
    });

    if (insertError && insertError.code !== '23505') {
      console.error('Auth callback profile insert error:', insertError.message);
    }
  }

  if (isRecovery) {
    const recoveryRedirect = new URL('/reset-password', requestUrl.origin);
    recoveryRedirect.searchParams.set('mode', 'update');
    return NextResponse.redirect(recoveryRedirect);
  }

  const dashboardRedirect = new URL('/dashboard', requestUrl.origin);
  return NextResponse.redirect(dashboardRedirect);
}
