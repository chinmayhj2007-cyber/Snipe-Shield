'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Package,
  Star,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { WinningReceiptModal } from '@/components/marketplace/WinningReceiptModal';
import {
  type DisputeItem,
  formatINR,
  type MarketplaceUser,
  type OrderItem,
} from '@/lib/marketplace/types';

interface OrdersClientProps {
  user: MarketplaceUser;
  initialOrders: OrderItem[];
  initialDisputes: DisputeItem[];
}

export function OrdersClient({
  user,
  initialOrders,
  initialDisputes,
}: OrdersClientProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderItem[]>(initialOrders);
  const [disputes, setDisputes] = useState<DisputeItem[]>(initialDisputes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tracking input per order
  const [trackingMap, setTrackingMap] = useState<Record<string, string>>({});
  // Dispute modal state
  const [disputeOrderId, setDisputeOrderId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('Item does not match description');
  const [disputeDesc, setDisputeDesc] = useState('');
  // Review state
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Winning Receipt Modal state
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);

  async function handleRazorpayCheckout(order: OrderItem) {
    setBusyId(order.id);
    setError(null);
    setMessage(null);
    try {
      const createRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const createData = (await createRes.json()) as {
        razorpayOrderId?: string;
        mode?: string;
        error?: string;
      };
      if (!createRes.ok || !createData.razorpayOrderId) {
        setError(createData.error ?? 'Could not initiate payment.');
        return;
      }

      // Server-verified test-mode settlement
      const verifyRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          razorpayOrderId: createData.razorpayOrderId,
          testModeConfirm: true,
        }),
      });
      const verifyData = (await verifyRes.json()) as {
        ok?: boolean;
        paymentId?: string;
        error?: string;
      };
      if (!verifyRes.ok) {
        setError(verifyData.error ?? 'Payment verification failed.');
        return;
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: 'paid', razorpay_payment_id: verifyData.paymentId ?? null }
            : o
        )
      );
      setMessage(`Razorpay Test Payment verified (${verifyData.paymentId}). Funds held in Escrow.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleShipOrder(orderId: string) {
    const tracking = (trackingMap[orderId] ?? '').trim();
    if (tracking.length < 4) {
      setError('Enter a valid courier tracking ID first.');
      return;
    }
    setBusyId(orderId);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'ship', trackingNumber: tracking }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? 'Failed to update shipment.');
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'shipped', tracking_number: tracking } : o
        )
      );
      setMessage('Shipment tracking updated.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelivery(orderId: string) {
    setBusyId(orderId);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'deliver' }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: 'delivered' } : o))
        );
        setMessage('Delivery confirmed. Transaction completed!');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitDispute(e: FormEvent) {
    e.preventDefault();
    if (!disputeOrderId) return;
    setBusyId(disputeOrderId);
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: disputeOrderId,
          reason: disputeReason,
          description: disputeDesc,
        }),
      });
      const data = (await res.json()) as { dispute?: DisputeItem; error?: string };
      if (res.ok && data.dispute) {
        setDisputes((prev) => [data.dispute!, ...prev]);
        setOrders((prev) =>
          prev.map((o) => (o.id === disputeOrderId ? { ...o, status: 'disputed' } : o))
        );
        setDisputeOrderId(null);
        setDisputeDesc('');
        setMessage('Dispute filed and escalated to SnipeShield Administrator Review.');
      } else {
        setError(data.error ?? 'Could not file dispute.');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewOrderId) return;
    setBusyId(reviewOrderId);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: reviewOrderId,
          rating,
          comment: reviewComment,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setReviewOrderId(null);
        setReviewComment('');
        setMessage('Rating & review recorded on seller TrustScore!');
      } else {
        setError(data.error ?? 'Could not submit review.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Orders, Escrow Payments &amp; Disputes
          </h1>
          <p className="mt-1 text-xs text-white/65">
            Complete Razorpay test-mode checkout, monitor shipping tracking, leave verified
            reviews, or open an escrow dispute.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-950/50 px-4 py-3 text-xs text-rose-100">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-300/30 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-100">
            {message}
          </div>
        ) : null}

        {orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order) => {
              const isBuyer = order.buyer_id === user.id;
              const isSeller = order.seller_id === user.id;

              return (
                <article
                  key={order.id}
                  className="smoky-glass-card rounded-[28px] border border-white/20 p-5 sm:p-6"
                >
                  <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/auctions/${order.auction_id}`}
                          className="text-base font-semibold text-white hover:underline"
                        >
                          {order.auction_title}
                        </Link>
                        <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-white/65">
                        {isBuyer ? `Seller: ${order.seller_name}` : `Buyer: ${order.buyer_name}`} &bull;{' '}
                        Winning Bid: {formatINR(order.winning_bid_amount)} + Fee{' '}
                        {formatINR(order.platform_fee)} + Tax {formatINR(order.tax_amount)}
                      </p>
                      <p className="text-sm font-semibold text-white">
                        Total Payable: {formatINR(order.final_price)}
                      </p>
                      {order.tracking_number ? (
                        <p className="flex items-center gap-1.5 text-xs text-emerald-200">
                          <Truck className="h-3.5 w-3.5" />
                          Tracking: {order.tracking_number}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isBuyer ? (
                        <button
                          type="button"
                          onClick={() => setReceiptOrderId(order.id)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-950/40 px-3.5 text-xs font-medium text-emerald-200 hover:border-emerald-400/60 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5 text-emerald-400" />
                          View Receipt
                        </button>
                      ) : null}

                      {isBuyer && order.status === 'pending_payment' ? (
                        <button
                          type="button"
                          onClick={() => handleRazorpayCheckout(order)}
                          disabled={busyId === order.id}
                          className="smoky-cta-btn inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-5 text-xs font-semibold text-white"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          {busyId === order.id
                            ? 'Verifying...'
                            : 'Pay via Razorpay (Test Mode)'}
                        </button>
                      ) : null}

                      {isSeller && order.status === 'paid' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Courier Tracking #"
                            value={trackingMap[order.id] ?? ''}
                            onChange={(e) =>
                              setTrackingMap((prev) => ({
                                ...prev,
                                [order.id]: e.target.value,
                              }))
                            }
                            className="h-9 rounded-full border border-white/20 bg-black/40 px-3 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleShipOrder(order.id)}
                            disabled={busyId === order.id}
                            className="smoky-cta-btn h-9 cursor-pointer rounded-full px-4 text-xs font-medium text-white"
                          >
                            Mark Shipped
                          </button>
                        </div>
                      ) : null}

                      {isBuyer && order.status === 'shipped' ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmDelivery(order.id)}
                          disabled={busyId === order.id}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-950/60 px-4 text-xs font-medium text-emerald-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm Delivery
                        </button>
                      ) : null}

                      {['paid', 'shipped', 'delivered'].includes(order.status) ? (
                        <button
                          type="button"
                          onClick={() => setReviewOrderId(order.id)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 text-xs font-medium text-white"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Leave Review
                        </button>
                      ) : null}

                      {order.status !== 'disputed' && order.status !== 'refunded' ? (
                        <button
                          type="button"
                          onClick={() => setDisputeOrderId(order.id)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-950/40 px-4 text-xs font-medium text-rose-100"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Raise Dispute
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/85 p-10 text-center">
            <Package className="mx-auto h-8 w-8 text-white/45" />
            <h2 className="mt-3 text-base font-semibold text-white">No Orders Yet</h2>
            <p className="mt-1 text-xs text-white/60">
              Won auctions and sold items appear here for escrow checkout and tracking.
            </p>
          </div>
        )}

        {/* Review Form */}
        {reviewOrderId ? (
          <form
            onSubmit={handleSubmitReview}
            className="rounded-[28px] border border-white/25 bg-[#0d1016] p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-white">Rate &amp; Review Transaction</h2>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${
                    rating >= n
                      ? 'border-amber-300 bg-amber-950/60 text-amber-200'
                      : 'border-white/20 text-white/50'
                  }`}
                >
                  {n} ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              placeholder="Share feedback on item condition, packaging, or communication..."
              className="w-full rounded-2xl border border-white/20 bg-white/[0.04] p-3 text-xs text-white"
            />
            <div className="flex gap-2">
              <button type="submit" className="smoky-cta-btn h-9 cursor-pointer rounded-full px-5 text-xs font-medium text-white">
                Submit Review
              </button>
              <button
                type="button"
                onClick={() => setReviewOrderId(null)}
                className="h-9 cursor-pointer rounded-full border border-white/20 px-4 text-xs text-white/75"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {/* Dispute Form */}
        {disputeOrderId ? (
          <form
            onSubmit={handleSubmitDispute}
            className="rounded-[28px] border border-rose-300/30 bg-[#0d1016] p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-white">Open Escrow Dispute</h2>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="h-10 w-full rounded-full border border-white/20 bg-black/50 px-4 text-xs text-white"
            >
              <option value="Item does not match description">Incorrect item description</option>
              <option value="Non-delivery">Non-delivery / courier delay</option>
              <option value="Damaged goods">Damaged goods</option>
              <option value="Payment issue">Payment issue</option>
              <option value="Suspected fraudulent activity">Suspected fraudulent activity</option>
            </select>
            <textarea
              value={disputeDesc}
              onChange={(e) => setDisputeDesc(e.target.value)}
              rows={3}
              required
              placeholder="Describe the issue clearly for administrator mediation..."
              className="w-full rounded-2xl border border-white/20 bg-white/[0.04] p-3 text-xs text-white"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="h-9 cursor-pointer rounded-full border border-rose-300/40 bg-rose-950/70 px-5 text-xs font-medium text-rose-100"
              >
                Submit Dispute
              </button>
              <button
                type="button"
                onClick={() => setDisputeOrderId(null)}
                className="h-9 cursor-pointer rounded-full border border-white/20 px-4 text-xs text-white/75"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {/* Active Disputes */}
        {disputes.length > 0 ? (
          <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-6">
            <h2 className="text-sm font-semibold text-white">Disputes History</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {disputes.map((d) => (
                <li
                  key={d.id}
                  className="rounded-2xl border border-white/15 bg-white/[0.025] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{d.reason}</span>
                    <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] uppercase text-white/80">
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-white/65">{d.description}</p>
                  {d.resolution ? (
                    <p className="mt-1 text-emerald-200">Resolution: {d.resolution}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      {/* Winning Receipt Modal */}
      <WinningReceiptModal
        orderId={receiptOrderId ?? ''}
        isOpen={Boolean(receiptOrderId)}
        onClose={() => setReceiptOrderId(null)}
        onProceedToPayment={async (orderId) => {
          const targetOrder = orders.find((o) => o.id === orderId);
          if (targetOrder) {
            await handleRazorpayCheckout(targetOrder);
          }
        }}
      />
    </div>
  );
}
