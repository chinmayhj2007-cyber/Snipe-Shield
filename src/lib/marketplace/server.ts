import { redirect } from 'next/navigation';
import { cache } from 'react';
import { normalizeRole, type UserRole } from '@/lib/auth/validation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AssetDocument,
  AuctionExtensionEntry,
  AuctionItem,
  AutoBidConfig,
  BidEntry,
  DisputeItem,
  FraudAlertItem,
  MarketplaceUser,
  NotificationItem,
  OrderItem,
  ReviewItem,
  SellerVerificationItem,
  VerificationStatus,
} from './types';

type ServerSupabase = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;

const AUCTION_PUBLIC_COLUMNS =
  'id, seller_id, title, description, category, condition, defect_description, condition_proof_urls, image_url, image_urls, starting_price, current_price, min_increment, highest_bidder_id, status, starts_at, ends_at, original_ends_at, extensions_count, anti_snipe_window_sec, anti_snipe_extend_sec, max_extensions, shipping_details, delivery_info, return_policy, shipping_cost, views_count, is_demo, paused, moderation_status, bid_count, created_at';

function deriveDisplayName(
  fullName?: string | null,
  email?: string | null,
  phone?: string | null
): string {
  const clean = (fullName ?? '').trim();
  if (clean) return clean;
  if (email && email.includes('@')) {
    return email.split('@')[0] || email;
  }
  if (phone) return phone;
  return 'Snipe Shield User';
}

export const requireAuthenticatedUser = cache(async (): Promise<{
  supabase: ServerSupabase;
  user: MarketplaceUser;
}> => {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect('/login?notice=demo');
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, role, full_name, avatar_url, verification_status, trust_score, is_suspended, is_demo')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to fetch authenticated profile:', profileError.message);
    throw new Error('Unable to load your account profile.');
  }

  const role = normalizeRole(profile?.role ?? user.user_metadata?.role);
  const email = profile?.email || user.email || '';
  const phone = user.phone || '';
  const fullName = profile?.full_name || '';

  return {
    supabase,
    user: {
      id: user.id,
      email,
      phone,
      fullName,
      displayName: deriveDisplayName(fullName, email, phone),
      role,
      avatarUrl: profile?.avatar_url ?? null,
      verificationStatus: (profile?.verification_status as VerificationStatus) ?? 'unverified',
      trustScore: Number(profile?.trust_score ?? 50),
      isSuspended: Boolean(profile?.is_suspended),
      isDemo: Boolean(profile?.is_demo),
    },
  };
});

export async function requireRole(expectedRole: UserRole): Promise<{
  supabase: ServerSupabase;
  user: MarketplaceUser;
}> {
  const ctx = await requireAuthenticatedUser();
  if (ctx.user.role !== expectedRole) {
    if (ctx.user.role === 'admin') redirect('/admin');
    redirect(ctx.user.role === 'seller' ? '/seller/home' : '/bidder/home');
  }
  return ctx;
}

export async function requireAdmin(): Promise<{
  supabase: ServerSupabase;
  user: MarketplaceUser;
}> {
  const ctx = await requireAuthenticatedUser();
  if (ctx.user.role !== 'admin') {
    redirect(ctx.user.role === 'seller' ? '/seller/home' : '/bidder/home');
  }
  return ctx;
}

export interface PublicProfileInfo {
  id: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  verificationStatus: VerificationStatus;
  trustScore: number;
  isDemo: boolean;
  createdAt: string | null;
}

export async function fetchPublicProfilesMap(
  supabase: ServerSupabase,
  ids: string[]
): Promise<Map<string, PublicProfileInfo>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, PublicProfileInfo>();
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase.rpc('get_public_profiles_v2', {
    p_ids: uniqueIds,
  });

  if (error) {
    console.error('Failed to fetch public profiles:', error.message);
    return map;
  }

  if (Array.isArray(data)) {
    for (const row of data as Array<{
      id: string;
      display_name: string;
      role?: string;
      avatar_url?: string | null;
      verification_status?: string;
      trust_score?: number;
      is_demo?: boolean;
      created_at?: string;
    }>) {
      map.set(row.id, {
        id: row.id,
        displayName: row.display_name || 'User',
        role: row.role ?? 'bidder',
        avatarUrl: row.avatar_url ?? null,
        verificationStatus: (row.verification_status as VerificationStatus) ?? 'unverified',
        trustScore: Number(row.trust_score ?? 50),
        isDemo: Boolean(row.is_demo),
        createdAt: row.created_at ?? null,
      });
    }
  }
  return map;
}

function mapRawAuctionRow(
  row: Record<string, unknown>,
  profileMap: Map<string, PublicProfileInfo>,
  safeReservePrice: number | null = null
): AuctionItem {
  const sellerId = String(row.seller_id);
  const highestBidderId = row.highest_bidder_id ? String(row.highest_bidder_id) : null;
  const sellerProfile = profileMap.get(sellerId);

  return {
    id: String(row.id),
    seller_id: sellerId,
    seller_name: sellerProfile?.displayName ?? 'Seller',
    seller_verified: sellerProfile?.verificationStatus === 'verified',
    seller_trust_score: sellerProfile?.trustScore ?? 50,
    title: String(row.title),
    description: String(row.description ?? ''),
    category: String(row.category ?? 'Electronics'),
    condition: String(row.condition ?? 'Brand New'),
    defect_description: row.defect_description ? String(row.defect_description) : null,
    condition_proof_urls: Array.isArray(row.condition_proof_urls)
      ? (row.condition_proof_urls as string[])
      : [],
    image_url: row.image_url ? String(row.image_url) : null,
    image_urls: Array.isArray(row.image_urls) ? (row.image_urls as string[]) : [],
    starting_price: Number(row.starting_price),
    current_price: Number(row.current_price),
    min_increment: Number(row.min_increment ?? 100),
    reserve_price: safeReservePrice,
    highest_bidder_id: highestBidderId,
    highest_bidder_name: highestBidderId
      ? profileMap.get(highestBidderId)?.displayName ?? 'Bidder'
      : null,
    status: row.status as AuctionItem['status'],
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    original_ends_at: row.original_ends_at ? String(row.original_ends_at) : null,
    extensions_count: Number(row.extensions_count ?? 0),
    anti_snipe_window_sec: Number(row.anti_snipe_window_sec ?? 30),
    anti_snipe_extend_sec: Number(row.anti_snipe_extend_sec ?? 30),
    max_extensions: Number(row.max_extensions ?? 10),
    shipping_details: row.shipping_details ? String(row.shipping_details) : undefined,
    delivery_info: row.delivery_info ? String(row.delivery_info) : undefined,
    return_policy: row.return_policy ? String(row.return_policy) : undefined,
    shipping_cost: Number(row.shipping_cost ?? 0),
    views_count: Number(row.views_count ?? 0),
    is_demo: Boolean(row.is_demo),
    paused: Boolean(row.paused),
    moderation_status: (row.moderation_status as AuctionItem['moderation_status']) ?? 'approved',
    created_at: String(row.created_at),
    bid_count: Number(row.bid_count ?? 0),
  };
}

export async function fetchMarketplaceCatalog(
  supabase: ServerSupabase,
  userId: string
): Promise<{
  auctions: AuctionItem[];
  savedIds: string[];
  recentlyViewedIds: string[];
  preferredCategories: string[];
  personalizationEnabled: boolean;
}> {
  // Authoritatively transition any expired auctions before catalog query
  await Promise.resolve(supabase.rpc('close_expired_auctions')).catch(() => {});

  const [
    { data: rawAuctions, error: auctionsError },
    { data: rawSaved, error: savedError },
    { data: rawViewed },
    { data: prefRow },
  ] = await Promise.all([
    supabase
      .from('auctions')
      .select(AUCTION_PUBLIC_COLUMNS)
      .in('status', ['active', 'ended'])
      .neq('moderation_status', 'removed')
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('saved_items').select('auction_id').eq('user_id', userId),
    supabase
      .from('recently_viewed')
      .select('auction_id')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(8),
    supabase
      .from('user_preferences')
      .select('preferred_categories, personalization_enabled')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (auctionsError) {
    console.error('Failed to fetch marketplace auctions:', auctionsError.message);
    throw new Error('Unable to load marketplace auctions.');
  }
  if (savedError) {
    console.error('Failed to fetch saved items:', savedError.message);
  }

  const rows = (rawAuctions ?? []) as unknown as Array<Record<string, unknown>>;
  const profileIds: string[] = [];
  for (const row of rows) {
    if (row.seller_id) profileIds.push(String(row.seller_id));
    if (row.highest_bidder_id) profileIds.push(String(row.highest_bidder_id));
  }

  const profileMap = await fetchPublicProfilesMap(supabase, profileIds);
  const auctions = rows.map((row) => mapRawAuctionRow(row, profileMap));

  return {
    auctions,
    savedIds: (rawSaved ?? []).map((s) => s.auction_id),
    recentlyViewedIds: (rawViewed ?? []).map((v) => v.auction_id),
    preferredCategories: Array.isArray(prefRow?.preferred_categories)
      ? prefRow.preferred_categories
      : [],
    personalizationEnabled: prefRow?.personalization_enabled ?? true,
  };
}

export async function fetchSavedAuctions(
  supabase: ServerSupabase,
  userId: string
): Promise<AuctionItem[]> {
  const { data: savedRows, error: savedError } = await supabase
    .from('saved_items')
    .select('auction_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (savedError) {
    throw new Error('Unable to load saved auctions.');
  }

  const savedIds = (savedRows ?? []).map((s) => s.auction_id);
  if (savedIds.length === 0) return [];

  const { data: rawAuctions, error: auctionsError } = await supabase
    .from('auctions')
    .select(AUCTION_PUBLIC_COLUMNS)
    .in('id', savedIds);

  if (auctionsError) {
    throw new Error('Unable to load saved auctions.');
  }

  const rows = (rawAuctions ?? []) as unknown as Array<Record<string, unknown>>;
  const profileIds = rows.flatMap((r) =>
    [r.seller_id, r.highest_bidder_id].filter((v): v is string => Boolean(v))
  );

  const profileMap = await fetchPublicProfilesMap(supabase, profileIds);
  return rows.map((row) => mapRawAuctionRow(row, profileMap));
}

export async function fetchAuctionDetail(
  supabase: ServerSupabase,
  auctionId: string,
  userId: string
): Promise<{
  auction: AuctionItem | null;
  bids: BidEntry[];
  isSaved: boolean;
  myProxyMax: number | null;
  myAutoBid: AutoBidConfig | null;
  extensions: AuctionExtensionEntry[];
  assetDocuments: AssetDocument[];
  comparableAuctions: AuctionItem[];
}> {
  // Authoritatively transition auction if ends_at <= now()
  await Promise.resolve(supabase.rpc('close_auction_if_expired', { p_auction_id: auctionId })).catch(() => {});

  const [
    { data: row, error: auctionError },
    { data: rawBids, count: exactBidCount },
    { data: savedRow },
    { data: proxyRow },
    { data: autoBidRow },
    { data: extRows },
    { data: docRows },
  ] = await Promise.all([
    supabase
      .from('auctions')
      .select(AUCTION_PUBLIC_COLUMNS)
      .eq('id', auctionId)
      .maybeSingle(),
    supabase
      .from('bids')
      .select('id, auction_id, bidder_id, amount, is_auto_proxy, bid_source, created_at', {
        count: 'exact',
      })
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('saved_items')
      .select('id')
      .eq('user_id', userId)
      .eq('auction_id', auctionId)
      .maybeSingle(),
    supabase
      .from('proxy_bids')
      .select('max_amount')
      .eq('auction_id', auctionId)
      .eq('bidder_id', userId)
      .maybeSingle(),
    supabase
      .from('auto_bids')
      .select('*')
      .eq('auction_id', auctionId)
      .eq('bidder_id', userId)
      .maybeSingle(),
    supabase
      .from('auction_extensions')
      .select('id, auction_id, previous_ends_at, new_ends_at, extension_seconds, created_at')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('asset_documents')
      .select('id, auction_id, seller_id, doc_type, title, file_url, sha256_hash, verification_status, notes, created_at')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false }),
  ]);

  if (auctionError) {
    throw new Error('Unable to load auction details.');
  }

  if (!row) {
    return {
      auction: null,
      bids: [],
      isSaved: false,
      myProxyMax: null,
      myAutoBid: null,
      extensions: [],
      assetDocuments: [],
      comparableAuctions: [],
    };
  }

  const ids: string[] = [row.seller_id];
  if (row.highest_bidder_id) ids.push(row.highest_bidder_id);
  for (const b of rawBids ?? []) {
    if (b.bidder_id) ids.push(b.bidder_id);
  }

  const isSellerOwner = row.seller_id === userId;
  const [profileMap, sellerReserveResult, { data: compRows }] = await Promise.all([
    fetchPublicProfilesMap(supabase, ids),
    isSellerOwner
      ? supabase.rpc('get_seller_reserve_price', { p_auction_id: auctionId })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('auctions')
      .select(AUCTION_PUBLIC_COLUMNS)
      .eq('category', row.category)
      .neq('id', auctionId)
      .limit(20),
  ]);

  const safeReservePrice =
    isSellerOwner &&
    sellerReserveResult.data !== null &&
    sellerReserveResult.data !== undefined
      ? Number(sellerReserveResult.data)
      : null;

  const auction = mapRawAuctionRow(
    row as unknown as Record<string, unknown>,
    profileMap,
    safeReservePrice
  );
  auction.bid_count = exactBidCount ?? auction.bid_count;

  const bids: BidEntry[] = (rawBids ?? []).map((b) => ({
    id: b.id,
    auction_id: b.auction_id,
    bidder_id: b.bidder_id,
    bidder_name:
      b.bidder_id === userId ? 'You' : profileMap.get(b.bidder_id)?.displayName ?? 'Bidder',
    amount: Number(b.amount),
    is_auto_proxy: Boolean(b.is_auto_proxy),
    bid_source: (b.bid_source as BidEntry['bid_source']) ?? 'manual',
    created_at: b.created_at,
  }));

  const comparableAuctions = ((compRows ?? []) as unknown as Array<Record<string, unknown>>).map(
    (c) => mapRawAuctionRow(c, profileMap)
  );

  return {
    auction,
    bids,
    isSaved: Boolean(savedRow),
    myProxyMax: proxyRow?.max_amount ? Number(proxyRow.max_amount) : null,
    myAutoBid: autoBidRow
      ? {
          id: autoBidRow.id,
          auction_id: autoBidRow.auction_id,
          bidder_id: autoBidRow.bidder_id,
          max_amount: Number(autoBidRow.max_amount),
          increment_strategy: autoBidRow.increment_strategy,
          stop_condition: autoBidRow.stop_condition,
          is_active: Boolean(autoBidRow.is_active),
          bids_placed: Number(autoBidRow.bids_placed ?? 0),
          last_bid_at: autoBidRow.last_bid_at ?? null,
          created_at: autoBidRow.created_at,
        }
      : null,
    extensions: (extRows ?? []) as AuctionExtensionEntry[],
    assetDocuments: (docRows ?? []) as AssetDocument[],
    comparableAuctions,
  };
}

export async function fetchUserNotifications(
  supabase: ServerSupabase,
  userId: string
): Promise<NotificationItem[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []) as NotificationItem[];
}

export async function fetchUserOrders(
  supabase: ServerSupabase,
  userId: string
): Promise<{ orders: OrderItem[]; disputes: DisputeItem[] }> {
  const [{ data: orderRows }, { data: disputeRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);

  const rawOrders = orderRows ?? [];
  const auctionIds = Array.from(new Set(rawOrders.map((o) => o.auction_id)));
  const partyIds = Array.from(
    new Set(rawOrders.flatMap((o) => [o.buyer_id, o.seller_id]))
  );

  const [{ data: auctionRows }, profileMap] = await Promise.all([
    auctionIds.length > 0
      ? supabase
          .from('auctions')
          .select('id, title, image_url, image_urls')
          .in('id', auctionIds)
      : Promise.resolve({ data: [] }),
    fetchPublicProfilesMap(supabase, partyIds),
  ]);

  const auctionMap = new Map(
    (auctionRows ?? []).map((a) => [
      a.id,
      {
        title: a.title,
        image:
          Array.isArray(a.image_urls) && a.image_urls[0]
            ? a.image_urls[0]
            : a.image_url ?? null,
      },
    ])
  );

  const orders: OrderItem[] = rawOrders.map((o) => ({
    id: o.id,
    auction_id: o.auction_id,
    auction_title: auctionMap.get(o.auction_id)?.title ?? 'Auction Item',
    auction_image: auctionMap.get(o.auction_id)?.image ?? null,
    buyer_id: o.buyer_id,
    buyer_name: profileMap.get(o.buyer_id)?.displayName ?? 'Buyer',
    seller_id: o.seller_id,
    seller_name: profileMap.get(o.seller_id)?.displayName ?? 'Seller',
    winning_bid_amount: Number(o.winning_bid_amount),
    platform_fee: Number(o.platform_fee),
    shipping_cost: Number(o.shipping_cost),
    tax_amount: Number(o.tax_amount),
    final_price: Number(o.final_price),
    status: o.status,
    razorpay_order_id: o.razorpay_order_id ?? null,
    razorpay_payment_id: o.razorpay_payment_id ?? null,
    payment_method: o.payment_method ?? null,
    tracking_number: o.tracking_number ?? null,
    shipping_address: (o.shipping_address as Record<string, string>) ?? null,
    created_at: o.created_at,
    updated_at: o.updated_at,
  }));

  return {
    orders,
    disputes: (disputeRows ?? []) as DisputeItem[],
  };
}

export async function fetchBuyerAnalytics(supabase: ServerSupabase, userId: string) {
  const [{ data: myBids }, { data: myOrders }, { data: myAuctions }] = await Promise.all([
    supabase
      .from('bids')
      .select('id, auction_id, amount, is_auto_proxy, bid_source, created_at')
      .eq('bidder_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select('id, auction_id, final_price, status, created_at')
      .eq('buyer_id', userId),
    supabase
      .from('auctions')
      .select('id, title, category, current_price, highest_bidder_id, status, ends_at'),
  ]);

  return {
    bids: (myBids ?? []).map((b) => ({
      id: b.id,
      auction_id: b.auction_id,
      amount: Number(b.amount),
      is_auto_proxy: Boolean(b.is_auto_proxy),
      bid_source: b.bid_source ?? 'manual',
      created_at: b.created_at,
    })),
    orders: (myOrders ?? []).map((o) => ({
      id: o.id,
      auction_id: o.auction_id,
      final_price: Number(o.final_price),
      status: o.status,
      created_at: o.created_at,
    })),
    auctions: (myAuctions ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      current_price: Number(a.current_price),
      highest_bidder_id: a.highest_bidder_id,
      status: a.status,
      ends_at: a.ends_at,
    })),
  };
}

export async function fetchAdminDashboardData(supabase: ServerSupabase) {
  const [
    { data: profiles },
    { data: auctions },
    { count: totalBids },
    { data: orders },
    { data: fraudAlerts },
    { data: verifications },
    { data: disputes },
    { data: auditLogs },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, verification_status, trust_score, is_demo, is_suspended, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('auctions')
      .select('id, seller_id, title, category, current_price, status, moderation_status, is_demo, bid_count, ends_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('bids').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id, final_price, platform_fee, status, created_at'),
    supabase
      .from('fraud_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('seller_verifications')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(50),
    supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('platform_settings').select('value').eq('key', 'anti_sniping').maybeSingle(),
  ]);

  const profileList = profiles ?? [];
  const profileNameMap = new Map(
    profileList.map((p) => [p.id, p.full_name || p.email || 'User'])
  );

  return {
    profiles: profileList,
    auctions: auctions ?? [],
    totalBids: totalBids ?? 0,
    orders: (orders ?? []).map((o) => ({
      ...o,
      final_price: Number(o.final_price),
      platform_fee: Number(o.platform_fee),
    })),
    fraudAlerts: (fraudAlerts ?? []).map((f) => ({
      ...f,
      user_name: f.user_id ? profileNameMap.get(f.user_id) ?? f.user_id : 'Unknown',
    })) as FraudAlertItem[],
    verifications: (verifications ?? []).map((v) => ({
      ...v,
      seller_name: profileNameMap.get(v.seller_id) ?? 'Seller',
    })) as SellerVerificationItem[],
    disputes: (disputes ?? []) as DisputeItem[],
    auditLogs: auditLogs ?? [],
    platformSettings: (settingsRow?.value as Record<string, number>) ?? {
      default_window_sec: 30,
      default_extend_sec: 30,
      default_max_extensions: 10,
      platform_fee_percent: 2.5,
      gst_percent: 18,
    },
  };
}

export async function fetchSellerPublicProfile(
  supabase: ServerSupabase,
  sellerId: string
): Promise<{
  profile: PublicProfileInfo | null;
  listings: AuctionItem[];
  reviews: ReviewItem[];
  completedSalesCount: number;
  disputeCount: number;
}> {
  const [profileMap, { data: listingRows }, { data: reviewRows }, { count: salesCount }] =
    await Promise.all([
      fetchPublicProfilesMap(supabase, [sellerId]),
      supabase
        .from('auctions')
        .select(AUCTION_PUBLIC_COLUMNS)
        .eq('seller_id', sellerId)
        .in('status', ['active', 'ended'])
        .neq('moderation_status', 'removed')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('reviews')
        .select('*')
        .eq('reviewed_user_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .in('status', ['paid', 'shipped', 'delivered']),
    ]);

  const profile = profileMap.get(sellerId) ?? null;
  const reviewerIds = (reviewRows ?? []).map((r) => r.reviewer_id);
  const reviewerMap = await fetchPublicProfilesMap(supabase, reviewerIds);

  const listings = ((listingRows ?? []) as unknown as Array<Record<string, unknown>>).map(
    (r) => mapRawAuctionRow(r, profileMap)
  );

  const reviews: ReviewItem[] = (reviewRows ?? []).map((r) => ({
    id: r.id,
    order_id: r.order_id,
    reviewer_id: r.reviewer_id,
    reviewer_name: reviewerMap.get(r.reviewer_id)?.displayName ?? 'Verified Buyer',
    reviewed_user_id: r.reviewed_user_id,
    rating: Number(r.rating),
    comment: r.comment,
    is_demo: Boolean(r.is_demo),
    created_at: r.created_at,
  }));

  return {
    profile,
    listings,
    reviews,
    completedSalesCount: salesCount ?? 0,
    disputeCount: 0,
  };
}
