import { NextResponse, type NextRequest } from 'next/server';
import {
  AUCTION_CATEGORIES,
  AUCTION_CONDITIONS,
  requiresConditionProof,
} from '@/lib/marketplace/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const VALID_CATEGORIES = new Set<string>(AUCTION_CATEGORIES.map((c) => c.id));
const VALID_CONDITIONS = new Set<string>(AUCTION_CONDITIONS);
const MAX_PRICE_AMOUNT = 100000000;
const MAX_IMAGES = 5;
const MIN_CONDITION_PROOF_IMAGES = 2;
const MAX_CONDITION_PROOF_IMAGES = 6;

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

function isValidSellerImageUrl(
  rawUrl: unknown,
  expectedOrigin: string | null,
  sellerId: string
): rawUrl is string {
  if (typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (expectedOrigin && parsed.origin !== expectedOrigin) return false;
    if (parsed.pathname.includes('..')) return false;
    return parsed.pathname.startsWith(`/storage/v1/object/public/auction-images/${sellerId}/`);
  } catch {
    return false;
  }
}

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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('auctions')
    .select(
      `
      id,
      title,
      description,
      category,
      condition,
      image_url,
      image_urls,
      starting_price,
      current_price,
      reserve_price,
      status,
      starts_at,
      ends_at,
      views_count,
      bid_count,
      highest_bidder_id,
      paused,
      created_at
    `
    )
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: sellerAuctions, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    sellerId: user.id,
    auctions: sellerAuctions ?? [],
    total: sellerAuctions?.length ?? 0,
  });
}

export async function POST(request: NextRequest) {
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: 'Unable to verify seller permissions.' },
      { status: 500 }
    );
  }

  if (profile?.is_suspended) {
    return NextResponse.json(
      { error: 'Your account is suspended and cannot publish listings.' },
      { status: 403 }
    );
  }

  if (profile?.role !== 'seller') {
    return NextResponse.json(
      { error: 'Forbidden: Only Seller accounts can publish auctions.' },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const condition = typeof body.condition === 'string' ? body.condition.trim() : '';
  const startingPrice = parseStrictFiniteNumber(body.startingPrice);
  const minIncrement = parseStrictFiniteNumber(body.minIncrement);
  const reserveRaw = body.reservePrice;
  const hasReserve = reserveRaw !== null && reserveRaw !== undefined && reserveRaw !== '';
  const reservePrice = hasReserve ? parseStrictFiniteNumber(reserveRaw) : null;
  const shippingCost = parseStrictFiniteNumber(body.shippingCost ?? 0) ?? 0;
  const antiSnipeWindowSec = Math.min(300, Math.max(10, Math.round(parseStrictFiniteNumber(body.antiSnipeWindowSec ?? 30) ?? 30)));
  const antiSnipeExtendSec = Math.min(300, Math.max(10, Math.round(parseStrictFiniteNumber(body.antiSnipeExtendSec ?? 30) ?? 30)));
  const maxExtensions = Math.min(50, Math.max(1, Math.round(parseStrictFiniteNumber(body.maxExtensions ?? 10) ?? 10)));
  const shippingDetails =
    typeof body.shippingDetails === 'string' && body.shippingDetails.trim()
      ? body.shippingDetails.trim().slice(0, 500)
      : 'Insured tracked courier dispatch within 48 hours of payment.';
  const deliveryInfo =
    typeof body.deliveryInfo === 'string' && body.deliveryInfo.trim()
      ? body.deliveryInfo.trim().slice(0, 500)
      : 'Pan-India delivery in 3-5 business days.';
  const returnPolicy =
    typeof body.returnPolicy === 'string' && body.returnPolicy.trim()
      ? body.returnPolicy.trim().slice(0, 500)
      : '7-day SnipeShield escrow protection for mismatched descriptions.';

  const startsAtRaw = typeof body.startsAt === 'string' ? body.startsAt : '';
  const endsAtRaw = typeof body.endsAt === 'string' ? body.endsAt : '';
  const rawImages = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const rawConditionProof = Array.isArray(body.conditionProofUrls) ? body.conditionProofUrls : [];
  const defectDescription =
    typeof body.defectDescription === 'string' ? body.defectDescription.trim().slice(0, 2000) : '';

  if (title.length < 4 || title.length > 120) {
    return NextResponse.json(
      { error: 'Item title must be between 4 and 120 characters.' },
      { status: 400 }
    );
  }

  if (description.length < 15 || description.length > 3000) {
    return NextResponse.json(
      { error: 'Description must be between 15 and 3000 characters.' },
      { status: 400 }
    );
  }

  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Please choose a valid category.' }, { status: 400 });
  }

  if (!VALID_CONDITIONS.has(condition)) {
    return NextResponse.json({ error: 'Please choose a valid item condition.' }, { status: 400 });
  }

  if (startingPrice === null || startingPrice < 1 || startingPrice > MAX_PRICE_AMOUNT) {
    return NextResponse.json(
      { error: 'Starting bid must be a valid amount greater than ₹1.' },
      { status: 400 }
    );
  }

  if (minIncrement === null || minIncrement < 1 || minIncrement > 10000000) {
    return NextResponse.json(
      { error: 'Minimum bid increment must be at least ₹1.' },
      { status: 400 }
    );
  }

  if (shippingCost < 0 || shippingCost > 100000) {
    return NextResponse.json(
      { error: 'Shipping cost must be between ₹0 and ₹1,00,000.' },
      { status: 400 }
    );
  }

  if (
    hasReserve &&
    (reservePrice === null || reservePrice < startingPrice || reservePrice > MAX_PRICE_AMOUNT)
  ) {
    return NextResponse.json(
      {
        error:
          'Reserve price must be between your starting price and ₹10,00,00,000.',
      },
      { status: 400 }
    );
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid auction start or end date.' }, { status: 400 });
  }

  if (endsAt.getTime() <= startsAt.getTime() + 5 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Auction end time must be at least 5 minutes after start time.' },
      { status: 400 }
    );
  }

  if (endsAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Auction end time must be in the future.' },
      { status: 400 }
    );
  }

  const supabaseUrlRaw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  let expectedOrigin: string | null = null;
  if (supabaseUrlRaw) {
    try {
      expectedOrigin = new URL(supabaseUrlRaw).origin;
    } catch {
      expectedOrigin = null;
    }
  }

  const imageUrls = rawImages
    .filter((u): u is string => isValidSellerImageUrl(u, expectedOrigin, user.id))
    .slice(0, MAX_IMAGES);

  const conditionProofUrls = rawConditionProof
    .filter((u): u is string => isValidSellerImageUrl(u, expectedOrigin, user.id))
    .slice(0, MAX_CONDITION_PROOF_IMAGES);

  // Validate condition-specific evidence requirements on the backend
  if (requiresConditionProof(condition)) {
    if (conditionProofUrls.length < MIN_CONDITION_PROOF_IMAGES) {
      return NextResponse.json(
        {
          error: `Condition "${condition}" requires at least ${MIN_CONDITION_PROOF_IMAGES} damage/condition evidence images (uploaded ${conditionProofUrls.length}).`,
        },
        { status: 400 }
      );
    }
    if (!defectDescription || defectDescription.length < 5) {
      return NextResponse.json(
        {
          error: `Please describe the condition/defects in detail (at least 5 characters) for "${condition}".`,
        },
        { status: 400 }
      );
    }
  }

  const { data: created, error: insertError } = await supabase
    .from('auctions')
    .insert({
      seller_id: user.id,
      title,
      description,
      category,
      condition,
      defect_description: defectDescription || null,
      condition_proof_urls: conditionProofUrls,
      starting_price: Number(startingPrice.toFixed(2)),
      current_price: Number(startingPrice.toFixed(2)),
      min_increment: Number(minIncrement.toFixed(2)),
      reserve_price: reservePrice !== null ? Number(reservePrice.toFixed(2)) : null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      original_ends_at: endsAt.toISOString(),
      shipping_details: shippingDetails,
      delivery_info: deliveryInfo,
      return_policy: returnPolicy,
      shipping_cost: Number(shippingCost.toFixed(2)),
      anti_snipe_window_sec: antiSnipeWindowSec,
      anti_snipe_extend_sec: antiSnipeExtendSec,
      max_extensions: maxExtensions,
      image_url: imageUrls[0] ?? null,
      image_urls: imageUrls,
      status: 'active',
    })
    .select('id')
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: 'Could not publish auction right now. Please try again.' },
      { status: 500 }
    );
  }

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'auction_published',
    entity_type: 'auction',
    entity_id: created.id,
    metadata: { title, category, startingPrice },
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
