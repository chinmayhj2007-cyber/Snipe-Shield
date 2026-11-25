import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Guard this endpoint: only pg_cron (via CRON_SECRET header) or authenticated admins may call it.
// Set CRON_SECRET env var in Vercel and pass it as 'x-cron-secret' header from pg_cron or cron services.
const CRON_SECRET = process.env.CRON_SECRET ?? '';

async function runCloseExpired(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  // Allow if correct cron secret is provided
  const cronHeader = request.headers.get('x-cron-secret') ?? '';
  const hasCronAccess = CRON_SECRET && cronHeader === CRON_SECRET;

  if (!hasCronAccess) {
    // Fallback: allow authenticated admin users
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  const { data, error } = await supabase.rpc('close_expired_auctions');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, closed: data ?? [] }, { status: 200 });
}

export async function POST(request: NextRequest) {
  return runCloseExpired(request);
}

export async function GET(request: NextRequest) {
  return runCloseExpired(request);
}
