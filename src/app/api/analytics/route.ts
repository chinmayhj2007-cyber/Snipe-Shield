import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RangeKey = '24h' | '7d' | '30d' | 'all';

function getRangeCutoff(range: RangeKey): Date | null {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 3600_000);
  if (range === '7d') return new Date(now - 7 * 86400_000);
  if (range === '30d') return new Date(now - 30 * 86400_000);
  return null;
}

function formatBucketLabel(date: Date, range: RangeKey): string {
  if (range === '24h') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawRange = searchParams.get('range');
  const range: RangeKey =
    rawRange === '24h' || rawRange === '7d' || rawRange === '30d' || rawRange === 'all'
      ? rawRange
      : '30d';

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = String(profile?.role ?? 'bidder');
  const cutoff = getRangeCutoff(range);

  // Fetch authorized auctions & bids
  let bidsQuery = supabase
    .from('bids')
    .select('id, auction_id, bidder_id, amount, is_auto_proxy, bid_source, created_at')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (cutoff) {
    bidsQuery = bidsQuery.gte('created_at', cutoff.toISOString());
  }

  let auctionsQuery = supabase
    .from('auctions')
    .select('id, seller_id, title, category, current_price, starting_price, highest_bidder_id, status, ends_at, bid_count, created_at')
    .neq('moderation_status', 'removed')
    .limit(500);

  if (role === 'seller') {
    auctionsQuery = auctionsQuery.eq('seller_id', user.id);
  }

  const [{ data: rawAuctions, error: auctionsErr }, { data: rawBids, error: bidsErr }] =
    await Promise.all([auctionsQuery, bidsQuery]);

  if (auctionsErr || bidsErr) {
    return NextResponse.json(
      { error: auctionsErr?.message ?? bidsErr?.message ?? 'Failed to load analytics.' },
      { status: 400 }
    );
  }

  const auctions = rawAuctions ?? [];
  const auctionMap = new Map(auctions.map((a) => [a.id, a]));

  // Scope bids strictly to what the authenticated user is authorized to inspect
  const scopedBids = (rawBids ?? []).filter((b) => {
    if (role === 'admin') return true;
    if (role === 'seller') return auctionMap.has(b.auction_id);
    return b.bidder_id === user.id;
  });

  // Graph 1: Bids & Peak Amount Over Time
  const bucketMap = new Map<
    string,
    { label: string; bids: number; peakAmount: number; manual: number; auto: number }
  >();

  let peakBidAmount = 0;
  let totalBidVolume = 0;
  let manualCount = 0;
  let autoCount = 0;

  for (const b of scopedBids) {
    const amt = Number(b.amount);
    if (amt > peakBidAmount) peakBidAmount = amt;
    totalBidVolume += amt;

    const isAuto = Boolean(b.is_auto_proxy) || b.bid_source === 'autobid' || b.bid_source === 'proxy';
    if (isAuto) autoCount++;
    else manualCount++;

    const dt = new Date(b.created_at);
    const bucketKey =
      range === '24h'
        ? `${dt.toISOString().slice(0, 13)}:00`
        : dt.toISOString().slice(0, 10);

    const existing = bucketMap.get(bucketKey);
    if (existing) {
      existing.bids += 1;
      if (amt > existing.peakAmount) existing.peakAmount = amt;
      if (isAuto) existing.auto += 1;
      else existing.manual += 1;
    } else {
      bucketMap.set(bucketKey, {
        label: formatBucketLabel(dt, range),
        bids: 1,
        peakAmount: amt,
        manual: isAuto ? 0 : 1,
        auto: isAuto ? 1 : 0,
      });
    }
  }

  const timeSeries = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // Graph 2: Winning vs Losing vs Active Auctions
  const participatedAuctionIds = new Set(scopedBids.map((b) => b.auction_id));
  const relevantAuctions =
    role === 'bidder'
      ? auctions.filter((a) => participatedAuctionIds.has(a.id) || a.highest_bidder_id === user.id)
      : auctions;

  let winningCount = 0;
  let losingCount = 0;
  let activeCount = 0;

  const nowMs = Date.now();
  for (const a of relevantAuctions) {
    const isEnded = a.status === 'ended' || a.status === 'cancelled' || new Date(a.ends_at).getTime() <= nowMs;
    if (!isEnded && a.status === 'active') {
      activeCount++;
    } else if (role === 'bidder') {
      if (a.highest_bidder_id === user.id) winningCount++;
      else losingCount++;
    } else {
      if (a.highest_bidder_id) winningCount++;
      else losingCount++;
    }
  }

  // Graph 3: Category-wise Bidding Distribution
  const categoryCounts = new Map<string, { category: string; bids: number; volume: number }>();
  for (const b of scopedBids) {
    const auc = auctionMap.get(b.auction_id);
    const cat = auc?.category ?? 'Other';
    const cur = categoryCounts.get(cat);
    if (cur) {
      cur.bids += 1;
      cur.volume += Number(b.amount);
    } else {
      categoryCounts.set(cat, { category: cat, bids: 1, volume: Number(b.amount) });
    }
  }
  const categoryDistribution = Array.from(categoryCounts.values()).sort((a, b) => b.bids - a.bids);

  return NextResponse.json({
    range,
    role,
    summary: {
      totalBids: scopedBids.length,
      peakBidAmount,
      averageBidAmount: scopedBids.length > 0 ? Math.round(totalBidVolume / scopedBids.length) : 0,
      auctionsCount: relevantAuctions.length,
    },
    timeSeries,
    statusBreakdown: {
      winning: winningCount,
      losing: losingCount,
      active: activeCount,
      total: winningCount + losingCount + activeCount,
    },
    categoryDistribution,
    biddingMode: {
      manual: manualCount,
      auto: autoCount,
      total: manualCount + autoCount,
    },
  });
}
