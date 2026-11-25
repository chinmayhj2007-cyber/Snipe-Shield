'use client';

import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Hash,
  Loader2,
  Printer,
  Shield,
  ShieldCheck,
  Tag,
  Trophy,
  User,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatINR } from '@/lib/marketplace/types';
import { ReceiptPrinter } from '@/components/ui/receipt-printer';

export interface ReceiptData {
  receiptId: string;
  orderId: string;
  auctionId: string;
  productName: string;
  productDescription: string;
  productImage: string | null;
  productId: string;
  category: string;
  condition: string;
  sellerName: string;
  sellerVerified: boolean;
  buyerName: string;
  auctionStartedAt: string | null;
  auctionEndedAt: string | null;
  winningBid: number;
  platformFee: number;
  totalPayable: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  orderStatus: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WinningReceiptModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onProceedToPayment: (orderId: string) => Promise<void>;
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function PaymentStatusBadge({ status }: { status: ReceiptData['paymentStatus'] }) {
  const styles: Record<string, string> = {
    pending: 'bg-neutral-100 text-neutral-800 border border-neutral-300',
    paid: 'bg-neutral-900 text-white border border-neutral-900',
    failed: 'bg-red-50 text-red-700 border border-red-200',
    refunded: 'bg-neutral-200 text-neutral-700 border border-neutral-300',
  };
  const labels: Record<string, string> = {
    pending: 'PAYMENT PENDING',
    paid: 'PAID',
    failed: 'PAYMENT FAILED',
    refunded: 'REFUNDED',
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3.5 w-3.5" />,
    paid: <CheckCircle2 className="h-3.5 w-3.5" />,
    failed: <XCircle className="h-3.5 w-3.5" />,
    refunded: <Shield className="h-3.5 w-3.5" />,
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${styles[status] ?? styles.pending}`}>
      {icons[status]}
      {labels[status] ?? status.toUpperCase()}
    </span>
  );
}

export function WinningReceiptModal({
  orderId,
  isOpen,
  onClose,
  onProceedToPayment,
}: WinningReceiptModalProps) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showThermalPrinter, setShowThermalPrinter] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const fetchReceipt = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${orderId}`);
      const json = (await res.json()) as { receipt?: ReceiptData; error?: string };
      if (!res.ok || !json.receipt) {
        setError(json.error ?? 'Could not load receipt.');
        return;
      }
      setReceipt(json.receipt);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchedRef.current = false;
      void fetchReceipt();
    }
  }, [isOpen, orderId, fetchReceipt]);

  async function handlePayment() {
    if (!receipt || paymentBusy) return;
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      await onProceedToPayment(receipt.orderId);
      // After payment completes, re-fetch receipt for updated status
      fetchedRef.current = false;
      await fetchReceipt();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setPaymentBusy(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleDownloadPDF() {
    // Use browser's print-to-PDF functionality with print styles
    window.print();
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body > *:not(.snipeshield-receipt-print-root) {
            display: none !important;
          }
          .snipeshield-receipt-print-root {
            position: fixed !important;
            inset: 0 !important;
            z-index: 99999 !important;
            background: white !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
          .print-visible { display: block !important; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="snipeshield-receipt-print-root fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Auction Winning Receipt"
      >
        {/* Modal shell */}
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
          style={{ background: 'white' }}
          onClick={(e) => e.stopPropagation()}
          ref={printRef}
        >
          {/* Close button */}
          <div className="no-print absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              onClick={() => setShowThermalPrinter((v) => !v)}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Toggle interactive thermal printer experience"
            >
              <Printer className="h-3.5 w-3.5 text-neutral-800" />
              <span>{showThermalPrinter ? 'Standard Invoice' : 'Thermal Simulator'}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              aria-label="Close receipt"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Loading / Error states */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
              <Loader2 className="h-10 w-10 animate-spin text-neutral-700" />
              <p className="text-gray-500 text-sm">Loading your winning receipt…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-8 text-center">
              <XCircle className="h-10 w-10 text-red-400" />
              <p className="text-gray-700 font-medium">{error}</p>
              <button
                onClick={() => { fetchedRef.current = false; void fetchReceipt(); }}
                className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                Retry
              </button>
            </div>
          )}

          {receipt && !loading && (
            showThermalPrinter ? (
              <div className="p-4 flex flex-col items-center">
                <ReceiptPrinter
                  store="SnipeShield Escrow"
                  address={`Verified Auction #${receipt.auctionId.slice(0, 8)}`}
                  currency="₹"
                  taxRate={0.02}
                  items={[
                    {
                      name: receipt.productName.slice(0, 24),
                      qty: 1,
                      price: receipt.winningBid,
                    },
                  ]}
                  className="min-h-[600px] w-full rounded-xl overflow-hidden"
                />
              </div>
            ) : (
            <>
              {/* ── RECEIPT HEADER ── */}
              <div
                className="relative overflow-hidden px-8 py-7"
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f2744 100%)',
                }}
              >
                {/* Decorative circle */}
                <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full opacity-10"
                  style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    {/* SnipeShield brand */}
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="h-6 w-6 text-white/85" />
                      <span className="text-white/85 font-bold tracking-widest text-xs uppercase">SnipeShield</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Trophy className="h-7 w-7 text-white/80" />
                      <div>
                        <h2 className="text-white font-black text-xl tracking-tight leading-tight">
                          CONGRATULATIONS!
                        </h2>
                        <p className="text-white/85 font-semibold text-sm tracking-wide">
                          AUCTION WON
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment status badge */}
                  <div className="flex flex-col items-end gap-2">
                    <PaymentStatusBadge status={receipt.paymentStatus} />
                    {receipt.paymentStatus === 'paid' && receipt.razorpayPaymentId && (
                      <span className="text-xs text-gray-300 font-mono">
                        {receipt.razorpayPaymentId.slice(0, 18)}…
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RECEIPT BODY ── */}
              <div className="px-8 py-6 space-y-6" style={{ background: '#fafafa' }}>

                {/* Receipt metadata */}
                <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-gray-200 pb-5">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Receipt ID</p>
                      <p className="text-sm font-bold text-gray-800 font-mono tracking-wide">{receipt.receiptId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Issued On</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDateTime(receipt.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Product section */}
                <div>
                  <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">Item Won</p>
                  <div className="flex gap-4 items-start">
                    {receipt.productImage ? (
                      <img
                        src={receipt.productImage}
                        alt={receipt.productName}
                        className="h-20 w-20 rounded-xl object-cover border border-gray-200 flex-shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                        <Tag className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 leading-snug mb-1">{receipt.productName}</h3>
                      {receipt.category && (
                        <span className="inline-block text-xs font-medium text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-0.5 mb-1">
                          {receipt.category}
                        </span>
                      )}
                      {receipt.condition && (
                        <span className="inline-block text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5 mb-1 ml-1.5">
                          {receipt.condition}
                        </span>
                      )}
                      <p className="text-xs text-gray-400 font-mono mt-1 break-all">
                        Product ID: {receipt.productId.slice(0, 18).toUpperCase()}…
                      </p>
                    </div>
                  </div>
                </div>

                {/* Parties */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <User className="h-4 w-4 text-gray-400" />
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Winning Bidder</p>
                    </div>
                    <p className="text-sm font-bold text-gray-800">{receipt.buyerName}</p>
                  </div>
                  <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      {receipt.sellerVerified
                        ? <ShieldCheck className="h-4 w-4 text-neutral-800" />
                        : <User className="h-4 w-4 text-gray-400" />
                      }
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Seller</p>
                    </div>
                    <p className="text-sm font-bold text-gray-800">{receipt.sellerName}</p>
                    {receipt.sellerVerified && (
                      <span className="text-xs text-neutral-700 font-semibold">Verified Seller</span>
                    )}
                  </div>
                </div>

                {/* Auction timeline */}
                <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                  <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">Auction Timeline</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Started</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDateTime(receipt.auctionStartedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Closed</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDateTime(receipt.auctionEndedAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Financial breakdown */}
                <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                  <p className="text-xs font-bold tracking-widest text-gray-400 uppercase p-4 pb-3">Payment Breakdown</p>
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    <div className="flex justify-between items-center px-4 py-3">
                      <span className="text-sm text-gray-600">Winning Bid Amount</span>
                      <span className="text-sm font-bold text-gray-900 font-mono">
                        {formatINR(receipt.winningBid)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3">
                      <span className="text-sm text-gray-500">Platform Commission (2%)</span>
                      <span className="text-sm font-semibold text-gray-700 font-mono">
                        + {formatINR(receipt.platformFee)}
                      </span>
                    </div>
                    <div
                      className="flex justify-between items-center px-4 py-4 bg-neutral-100 border-t border-neutral-200"
                    >
                      <span className="text-base font-black text-gray-900">Total Payable</span>
                      <span className="text-xl font-black text-neutral-900 font-mono">
                        {formatINR(receipt.totalPayable)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment transaction info (only when paid) */}
                {receipt.paymentStatus === 'paid' && receipt.razorpayPaymentId && (
                  <div className="rounded-xl bg-neutral-100 border border-neutral-300 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-neutral-900" />
                      <p className="text-sm font-bold text-neutral-900">Payment Verified</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-neutral-500 mb-0.5">Transaction ID</p>
                        <p className="text-xs font-mono font-bold text-neutral-900 break-all">{receipt.razorpayPaymentId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-0.5">Payment Date</p>
                        <p className="text-xs font-semibold text-neutral-800">{formatDateTime(receipt.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Thank-you message */}
                <div className="text-center py-2 border-t border-gray-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Award className="h-4 w-4 text-neutral-700" />
                    <span className="text-sm font-bold text-gray-700">Thank you for bidding with SnipeShield!</span>
                    <Award className="h-4 w-4 text-neutral-700" />
                  </div>
                  <p className="text-xs text-gray-500">
                    Your item is secured in escrow. Complete payment to notify the seller to ship.
                  </p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">{receipt.receiptId}</p>
                </div>

                {/* Error banner */}
                {paymentError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {paymentError}
                  </div>
                )}

                {/* ── ACTION BUTTONS ── */}
                <div className="no-print grid grid-cols-2 gap-3 pt-2">
                  {/* Proceed to Payment */}
                  {(receipt.paymentStatus === 'pending' || receipt.paymentStatus === 'failed') && (
                    <button
                      onClick={handlePayment}
                      disabled={paymentBusy}
                      className="col-span-2 flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition-all disabled:opacity-60"
                      style={{
                        background: paymentBusy
                          ? '#6b7280'
                          : 'linear-gradient(135deg, #059669, #047857)',
                      }}
                    >
                      {paymentBusy
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing Payment…</>
                        : <><CreditCard className="h-4 w-4" /> PROCEED TO PAYMENT</>
                      }
                    </button>
                  )}

                  {/* Download PDF */}
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Download className="h-4 w-4" /> Download PDF
                  </button>

                  {/* Print */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Printer className="h-4 w-4" /> Print
                  </button>

                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <X className="h-4 w-4" /> Close
                  </button>
                </div>
              </div>
            </>
            )
          )}
        </div>
      </div>
    </>
  );
}
