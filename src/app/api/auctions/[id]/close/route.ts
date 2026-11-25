import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Internal cron secret for machine-to-machine calls (optional — if not set, any authenticated user is allowed)
const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid auction ID.' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });

  // Allow if caller provides the cron secret header OR is an authenticated user
  const cronHeader = request.headers.get('x-cron-secret') ?? '';
  const hasCronAccess = CRON_SECRET && cronHeader === CRON_SECRET;

  if (!hasCronAccess) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  // Safe and idempotent: close_auction_if_expired only transitions if ends_at <= now()
  const { data, error } = await supabase.rpc('close_auction_if_expired', {
    p_auction_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? { closed: true }, { status: 200 });
}
