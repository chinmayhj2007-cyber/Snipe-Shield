import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const { data: auction, error } = await supabase
    .from('auctions')
    .select(
      `
      id,
      title,
      current_price,
      reserve_price,
      highest_bidder_id,
      status,
      ends_at
    `
    )
    .eq('id', auctionId)
    .maybeSingle();

  if (error || !auction) {
    return NextResponse.json({ error: 'Auction not found.' }, { status: 404 });
  }

  if (auction.status !== 'ended') {
    return NextResponse.json(
      {
        auctionId,
        status: auction.status,
        winner: null,
        message: 'Auction is not finalized yet.',
      },
      { status: 200 }
    );
  }

  if (!auction.highest_bidder_id) {
    return NextResponse.json(
      {
        auctionId,
        status: 'ended',
        winner: null,
        isReserveMet: false,
        message: 'Auction ended with no bids (Unsold).',
      },
      { status: 200 }
    );
  }

  const isReserveMet =
    auction.reserve_price === null || auction.current_price >= auction.reserve_price;

  if (!isReserveMet) {
    return NextResponse.json(
      {
        auctionId,
        status: 'ended',
        winner: null,
        isReserveMet: false,
        message: 'Reserve price was not met.',
      },
      { status: 200 }
    );
  }

  const [{ data: winnerProfile }, { data: order }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', auction.highest_bidder_id)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, final_price, platform_fee, status, created_at')
      .eq('auction_id', auctionId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    auctionId,
    status: 'ended',
    winner: {
      userId: auction.highest_bidder_id,
      name: winnerProfile?.full_name ?? 'Winning Bidder',
      avatarUrl: winnerProfile?.avatar_url ?? null,
      winningBid: auction.current_price,
      orderId: order?.id ?? null,
      orderStatus: order?.status ?? 'pending_payment',
    },
    isReserveMet: true,
  });
}
