import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  // Fetch all orders where current user is the buyer
  const { data: wonOrders, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      auction_id,
      winning_bid_amount,
      platform_fee,
      shipping_cost,
      tax_amount,
      final_price,
      status,
      created_at,
      auctions (
        id,
        title,
        category,
        condition,
        image_url,
        image_urls,
        starts_at,
        ends_at,
        seller_id,
        profiles!auctions_seller_id_fkey (
          id,
          full_name,
          is_verified_seller
        )
      )
    `
    )
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    wonAuctions: wonOrders ?? [],
    totalWon: wonOrders?.length ?? 0,
  });
}
