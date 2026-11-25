import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BID_AMOUNT = 1000000000;

function parseStrictFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: auctionId } = await context.params;
  if (!UUID_REGEX.test(auctionId)) {
    return NextResponse.json({ error: 'Invalid auction ID.' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  const [{ data: bids, error: bidsError }, { data: auction }] = await Promise.all([
    supabase
      .from('bids')
      .select('id, auction_id, bidder_id, amount, is_auto_proxy, bid_source, created_at')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('auctions')
      .select('current_price, highest_bidder_id, bid_count, status')
      .eq('id', auctionId)
      .maybeSingle(),
  ]);

  if (bidsError) {
    return NextResponse.json({ error: bidsError.message }, { status: 400 });
  }

  const highestBid = bids && bids.length > 0 ? bids[0] : null;

  return NextResponse.json({
    auctionId,
    currentPrice: auction?.current_price ?? 0,
    highestBidderId: auction?.highest_bidder_id ?? null,
    totalBids: auction?.bid_count ?? (bids?.length ?? 0),
    status: auction?.status ?? 'active',
    highestBid,
    history: bids ?? [],
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: auctionId } = await context.params;
  if (!UUID_REGEX.test(auctionId)) {
    return NextResponse.json({ error: 'Invalid auction ID.' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // Role guard: only bidders may place bids (sellers cannot bid; prevents self-bidding)
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();

  if (callerProfile?.role === 'seller') {
    return NextResponse.json(
      { error: 'Sellers cannot place bids. Switch to a bidder account to participate.' },
      { status: 403 }
    );
  }
  if (callerProfile?.is_suspended) {
    return NextResponse.json(
      { error: 'Your account has been suspended. Please contact support.' },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid bid payload.' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ error: 'Invalid bid payload.' }, { status: 400 });
  }

  const body = rawBody as { amount?: unknown; maxProxy?: unknown; idempotencyKey?: unknown };
  const amount = parseStrictFiniteNumber(body.amount);
  const hasMaxProxy =
    body.maxProxy !== undefined && body.maxProxy !== null && body.maxProxy !== '';
  const maxProxy = hasMaxProxy ? parseStrictFiniteNumber(body.maxProxy) : null;
  const headerKey = request.headers.get('x-idempotency-key');
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 100)
      : headerKey?.trim().slice(0, 100) || null;

  if (amount === null || amount <= 0 || amount > MAX_BID_AMOUNT) {
    return NextResponse.json({ error: 'Please enter a valid bid amount.' }, { status: 400 });
  }

  // Self-bidding prevention check
  const { data: auctionData } = await supabase
    .from('auctions')
    .select('seller_id')
    .eq('id', auctionId)
    .maybeSingle();

  if (auctionData && auctionData.seller_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot place bids on your own listing.' },
      { status: 403 }
    );
  }

  if (
    hasMaxProxy &&
    (maxProxy === null || maxProxy < amount || maxProxy > MAX_BID_AMOUNT)
  ) {
    return NextResponse.json(
      {
        error:
          'Auto-proxy max bid ceiling must be between your bid amount and ₹1,00,00,00,000.',
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc('place_bid_v2', {
    p_auction_id: auctionId,
    p_amount: Number(amount.toFixed(2)),
    p_max_proxy: maxProxy !== null ? Number(maxProxy.toFixed(2)) : null,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.message.includes('Auction not found')) {
      return NextResponse.json({ error: 'Auction not found.' }, { status: 404 });
    }
    if (error.message.includes('already ended')) {
      // Authoritatively ensure auction is transitioned to 'ended' in DB
      void supabase.rpc('close_auction_if_expired', { p_auction_id: auctionId });
    }
    const safeMsg =
      error.message.includes('Only Bidder') ||
      error.message.includes('Sellers cannot bid') ||
      error.message.includes('Bid must be at least') ||
      error.message.includes('already ended') ||
      error.message.includes('not started') ||
      error.message.includes('not active') ||
      error.message.includes('Auto-proxy') ||
      error.message.includes('suspended') ||
      error.message.includes('already the highest bidder')
        ? error.message
        : 'Unable to place bid right now. Please try again.';
    return NextResponse.json({ error: safeMsg }, { status: 400 });
  }

  return NextResponse.json(data, { status: 200 });
}
