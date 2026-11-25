import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PLATFORM_FEE_RATE = 0.02; // 2%

function generateReceiptId(orderId: string): string {
  const year = new Date().getFullYear();
  const shortId = orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SS-${year}-${shortId}`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!UUID_REGEX.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  }

  // Authenticate caller
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // Fetch order with joined auction and profiles
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      auction_id,
      buyer_id,
      seller_id,
      winning_bid_amount,
      platform_fee,
      shipping_cost,
      tax_amount,
      final_price,
      status,
      razorpay_order_id,
      razorpay_payment_id,
      payment_method,
      created_at,
      updated_at
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  // Security: only the winning buyer (or admin) may fetch the receipt
  if (order.buyer_id !== user.id) {
    // Check if admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  // Fetch auction details
  const { data: auction } = await supabase
    .from('auctions')
    .select('id, title, description, image_url, image_urls, category, condition, starts_at, ends_at, seller_id')
    .eq('id', order.auction_id)
    .maybeSingle();

  // Fetch buyer and seller profiles
  const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.buyer_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, full_name, email, verification_status')
      .eq('id', order.seller_id)
      .maybeSingle(),
  ]);

  // Server-authoritative fee calculation — never trust frontend values
  const winningBid = Number(order.winning_bid_amount);
  const platformFee = Math.round(winningBid * PLATFORM_FEE_RATE * 100) / 100;
  const totalPayable = Math.round((winningBid + platformFee) * 100) / 100;

  // Determine payment status
  let paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' = 'pending';
  if (order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') {
    paymentStatus = 'paid';
  } else if (order.status === 'refunded') {
    paymentStatus = 'refunded';
  } else if (order.status === 'cancelled') {
    paymentStatus = 'failed';
  }

  // Determine primary product image
  const imageUrls: string[] = Array.isArray(auction?.image_urls) ? auction.image_urls : [];
  const primaryImage = imageUrls[0] ?? auction?.image_url ?? null;

  const receipt = {
    receiptId: generateReceiptId(order.id),
    orderId: order.id,
    auctionId: order.auction_id,

    // Product info
    productName: auction?.title ?? 'Auction Item',
    productDescription: auction?.description ?? '',
    productImage: primaryImage,
    productId: order.auction_id,
    category: auction?.category ?? '',
    condition: auction?.condition ?? '',

    // Parties
    sellerName: sellerProfile?.full_name || 'Verified Seller',
    sellerVerified: sellerProfile?.verification_status === 'verified',
    buyerName: buyerProfile?.full_name || 'Winning Bidder',

    // Auction timeline
    auctionStartedAt: auction?.starts_at ?? null,
    auctionEndedAt: auction?.ends_at ?? null,

    // Financials (server-computed, authoritative)
    winningBid,
    platformFee,
    totalPayable,
    currency: 'INR',

    // Payment status
    paymentStatus,
    orderStatus: order.status,
    razorpayOrderId: order.razorpay_order_id ?? null,
    razorpayPaymentId: order.razorpay_payment_id ?? null,
    paymentMethod: order.payment_method ?? null,

    // Timestamps
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };

  return NextResponse.json({ receipt }, { status: 200 });
}
