import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'active';
  const category = searchParams.get('category');
  const sellerId = searchParams.get('seller_id');
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 40));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const offset = (page - 1) * limit;

  // Let background cron or trigger close any expired auctions automatically
  await Promise.resolve(supabase.rpc('close_expired_auctions')).catch(() => {});

  let query = supabase
    .from('auctions')
    .select(
      `
      id,
      seller_id,
      title,
      description,
      category,
      condition,
      defect_description,
      condition_proof_urls,
      image_url,
      image_urls,
      starting_price,
      current_price,
      min_increment,
      highest_bidder_id,
      status,
      starts_at,
      ends_at,
      original_ends_at,
      extensions_count,
      shipping_cost,
      views_count,
      is_demo,
      paused,
      moderation_status,
      bid_count,
      created_at
    `
    )
    .neq('moderation_status', 'removed')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === 'all') {
    query = query.in('status', ['active', 'ended', 'cancelled']);
  } else {
    query = query.eq('status', status);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (sellerId) {
    query = query.eq('seller_id', sellerId);
  }

  const { data: auctions, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    auctions: auctions ?? [],
    page,
    limit,
    count: auctions?.length ?? 0,
  });
}
