import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getRazorpayEnv, verifyRazorpayWebhookSignature } from '@/lib/payments/razorpay';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const { webhookSecret, isLiveConfigured } = getRazorpayEnv();

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Razorpay webhook secret not configured.' },
      { status: 503 }
    );
  }

  const valid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event: { event?: string; payload?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as { event?: string; payload?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  // Handle payment captured event
  if (event.event === 'payment.captured') {
    const paymentEntity = (event.payload?.payment as { entity?: Record<string, unknown> })?.entity;
    if (!paymentEntity) {
      return NextResponse.json({ received: true, note: 'No payment entity.' }, { status: 200 });
    }

    const razorpayOrderId = String(paymentEntity.order_id ?? '');
    const razorpayPaymentId = String(paymentEntity.id ?? '');
    const amount = Number(paymentEntity.amount ?? 0) / 100; // Razorpay sends paise

    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ received: true, note: 'Missing payment IDs.' }, { status: 200 });
    }

    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ received: true, note: 'DB unavailable.' }, { status: 200 });
    }

    // Find the order by razorpay_order_id
    const { data: order } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, status, final_price')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (!order || order.status !== 'pending_payment') {
      // Already settled or not found — idempotent
      return NextResponse.json({ received: true, note: 'Already settled or not found.' }, { status: 200 });
    }

    // Update order status to paid
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        razorpay_payment_id: razorpayPaymentId,
        payment_method: isLiveConfigured ? 'razorpay_live' : 'razorpay_test',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'pending_payment');

    // Record payment in payments table (idempotent via unique constraint on provider_payment_id)
    // Insert payment record — ignore duplicate if webhook fires twice
    const { error: insertErr } = await supabase.from('payments').insert({
      order_id: order.id,
      user_id: order.buyer_id,
      provider: 'razorpay',
      provider_order_id: razorpayOrderId,
      provider_payment_id: razorpayPaymentId,
      amount,
      currency: 'INR',
      status: 'captured',
      raw_payload: { source: 'webhook', event: event.event, verified_hmac: true },
    });
    // A unique constraint violation (code 23505) means we already processed this payment — that's fine
    if (insertErr && insertErr.code !== '23505') {
      console.error('[webhook] payment insert error', insertErr);
    }

    // Send notifications
    const paymentRef = razorpayPaymentId.slice(0, 16);
    await supabase.from('notifications').insert([
      {
        user_id: order.buyer_id,
        type: 'payment',
        title: 'Payment Confirmed ✓',
        message: `Payment ${paymentRef}... verified. Seller has been notified to ship your item.`,
        link: '/orders',
      },
      {
        user_id: order.seller_id,
        type: 'payment',
        title: 'Buyer Payment Received',
        message: `Buyer has paid ₹${amount.toLocaleString('en-IN')}. Please ship the item promptly.`,
        link: '/orders',
      },
    ]);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
