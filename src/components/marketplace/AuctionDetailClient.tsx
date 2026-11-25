'use client';

import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Bot,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  Gavel,
  History,
  Info,
  Lock,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Trophy,
  Truck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CountdownTimer } from '@/components/marketplace/CountdownTimer';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { ShinyButton } from '@/components/ui/shiny-button';
import { calculateTrueCost, computePriceInsights } from '@/lib/marketplace/intelligence';
import { maskBidderName } from '@/lib/marketplace/privacy';
import {
  type AssetDocument,
  type AuctionExtensionEntry,
  type AuctionItem,
  type AutoBidConfig,
  type BidEntry,
  formatINR,
  getAuctionPhase,
  type MarketplaceUser,
} from '@/lib/marketplace/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { WinningReceiptModal } from '@/components/marketplace/WinningReceiptModal';

interface AuctionDetailClientProps {
  user: MarketplaceUser;
  initialAuction: AuctionItem;
  initialBids: BidEntry[];
  initialSaved: boolean;
  initialMyProxyMax: number | null;
  initialMyAutoBid: AutoBidConfig | null;
  initialExtensions: AuctionExtensionEntry[];
  initialDocuments: AssetDocument[];
  comparableAuctions: AuctionItem[];
}

export function AuctionDetailClient({
  user,
  initialAuction,
  initialBids,
  initialSaved,
  initialMyProxyMax,
  initialMyAutoBid,
  initialExtensions,
  initialDocuments,
  comparableAuctions,
}: AuctionDetailClientProps) {
  const router = useRouter();
  const bidInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `bid_${Date.now()}`
  );

  const [auction, setAuction] = useState<AuctionItem>(initialAuction);
  const [bids, setBids] = useState<BidEntry[]>(initialBids);
  const [extensions, setExtensions] = useState<AuctionExtensionEntry[]>(initialExtensions);
  const [documents, setDocuments] = useState<AssetDocument[]>(initialDocuments);
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [myProxyMax, setMyProxyMax] = useState<number | null>(initialMyProxyMax);
  const [myAutoBid, setMyAutoBid] = useState<AutoBidConfig | null>(initialMyAutoBid);
  const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const highestBidderRef = useRef<string | null>(initialAuction.highest_bidder_id);

  // AutoBid AI panel state
  const [autoBidOpen, setAutoBidOpen] = useState(false);
  const [autoBidMax, setAutoBidMax] = useState(
    initialMyAutoBid ? String(initialMyAutoBid.max_amount) : ''
  );
  const [autoBidStrategy, setAutoBidStrategy] = useState<'minimum' | 'step_2x' | 'conservative'>(
    initialMyAutoBid?.increment_strategy ?? 'minimum'
  );
  const [autoBidStop, setAutoBidStop] = useState<'max_budget' | 'max_5_bids' | 'outbid_twice'>(
    initialMyAutoBid?.stop_condition ?? 'max_budget'
  );
  const [autoBidConfirmed, setAutoBidConfirmed] = useState(false);
  const [autoBidLoading, setAutoBidLoading] = useState(false);

  // Asset Passport upload state (for seller)
  const [docType, setDocType] = useState<'invoice' | 'authenticity_certificate' | 'ownership_record' | 'condition_report' | 'supporting_doc'>('invoice');
  const [docTitle, setDocTitle] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docSubmitting, setDocSubmitting] = useState(false);

  // Order / Seller Controls state
  const [actionLoading, setActionLoading] = useState(false);

  // Winning Receipt Modal state
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Condition Proof Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setAuction(initialAuction);
    highestBidderRef.current = initialAuction.highest_bidder_id;
  }, [initialAuction]);

  useEffect(() => setBids(initialBids), [initialBids]);
  useEffect(() => setExtensions(initialExtensions), [initialExtensions]);
  useEffect(() => setDocuments(initialDocuments), [initialDocuments]);
  useEffect(() => setIsSaved(initialSaved), [initialSaved]);
  useEffect(() => setMyProxyMax(initialMyProxyMax), [initialMyProxyMax]);
  useEffect(() => setMyAutoBid(initialMyAutoBid), [initialMyAutoBid]);
  useEffect(() => setFailedUrls(new Set()), [initialAuction.id]);

  // Track view & recently viewed once per visit
  useEffect(() => {
    void fetch(`/api/auctions/${initialAuction.id}/view`, { method: 'POST' }).catch(() => {});
  }, [initialAuction.id]);

  useEffect(() => {
    setMountedNowMs(Date.now());
    const interval = window.setInterval(() => setMountedNowMs(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);

  const gallery = useMemo(
    () =>
      auction.image_urls.length > 0
        ? auction.image_urls
        : auction.image_url
          ? [auction.image_url]
          : [],
    [auction.image_urls, auction.image_url]
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(gallery[0] ?? null);

  useEffect(() => {
    setSelectedImage((prev) => (prev && gallery.includes(prev) ? prev : gallery[0] ?? null));
  }, [initialAuction.id, gallery]);

  const minNextBid = auction.highest_bidder_id
    ? auction.current_price + auction.min_increment
    : auction.starting_price;

  const [bidAmount, setBidAmount] = useState(String(minNextBid));
  const [enableProxy, setEnableProxy] = useState(false);
  const [proxyMaxInput, setProxyMaxInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setBidAmount((prev) => {
      const parsed = Number(prev);
      if (!prev.trim() || !Number.isFinite(parsed) || parsed < minNextBid) {
        return String(minNextBid);
      }
      return prev;
    });
  }, [minNextBid]);

  // Real-time WebSocket subscription for live bids & anti-snipe extensions
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`auction-room-${auction.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auctions',
          filter: `id=eq.${auction.id}`,
        },
        (payload) => {
          const row = payload.new as Partial<AuctionItem>;
          const bidderChanged =
            row.highest_bidder_id !== undefined &&
            row.highest_bidder_id !== highestBidderRef.current;

          if (row.highest_bidder_id !== undefined) {
            highestBidderRef.current = row.highest_bidder_id;
          }

          setAuction((prev) => ({
            ...prev,
            current_price: Number(row.current_price ?? prev.current_price),
            highest_bidder_id:
              row.highest_bidder_id !== undefined
                ? row.highest_bidder_id
                : prev.highest_bidder_id,
            ends_at: row.ends_at ?? prev.ends_at,
            status: (row.status as AuctionItem['status']) ?? prev.status,
            paused: row.paused !== undefined ? Boolean(row.paused) : prev.paused,
            extensions_count: Number(row.extensions_count ?? prev.extensions_count),
            bid_count: Number(row.bid_count ?? prev.bid_count ?? 0),
          }));

          if (bidderChanged) {
            router.refresh();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${auction.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            auction_id: string;
            bidder_id: string;
            amount: number;
            is_auto_proxy: boolean;
            bid_source?: BidEntry['bid_source'];
            created_at: string;
          };
          setBids((prev) => {
            if (prev.some((b) => b.id === row.id)) return prev;
            const entry: BidEntry = {
              id: row.id,
              auction_id: row.auction_id,
              bidder_id: row.bidder_id,
              bidder_name: row.bidder_id === user.id ? 'You' : 'Live Bidder',
              amount: Number(row.amount),
              is_auto_proxy: Boolean(row.is_auto_proxy),
              bid_source: row.bid_source ?? 'manual',
              created_at: row.created_at,
            };
            return [entry, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'auction_extensions',
          filter: `auction_id=eq.${auction.id}`,
        },
        (payload) => {
          const ext = payload.new as AuctionExtensionEntry;
          setExtensions((prev) => (prev.some((e) => e.id === ext.id) ? prev : [ext, ...prev]));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [auction.id, user.id, router]);

  async function handleToggleSave() {
    if (saveInFlightRef.current || savingWatchlist) return;
    saveInFlightRef.current = true;
    setSavingWatchlist(true);
    const prev = isSaved;
    setIsSaved(!prev);
    try {
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId: auction.id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { saved: boolean };
        setIsSaved(data.saved);
      } else {
        setIsSaved(prev);
      }
    } catch {
      setIsSaved(prev);
    } finally {
      saveInFlightRef.current = false;
      setSavingWatchlist(false);
    }
  }

  async function handlePlaceBid(e?: FormEvent) {
    e?.preventDefault();
    if (bidInFlightRef.current || submitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (auction.status === 'ended' || phase === 'ended') {
      setErrorMessage('This auction has already ended.');
      return;
    }

    const amountNum = Number(bidAmount);
    const proxyNum = enableProxy && proxyMaxInput.trim() ? Number(proxyMaxInput) : null;

    if (!Number.isFinite(amountNum) || amountNum < minNextBid) {
      setErrorMessage(`Bid must be at least ${formatINR(minNextBid)}.`);
      return;
    }

    if (proxyNum !== null && (!Number.isFinite(proxyNum) || proxyNum < amountNum)) {
      setErrorMessage('Auto-proxy max ceiling must be equal to or higher than your bid.');
      return;
    }

    bidInFlightRef.current = true;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/auctions/${auction.id}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          amount: amountNum,
          maxProxy: proxyNum,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        is_leading?: boolean;
        current_price?: number;
        highest_bidder_id?: string;
        ends_at?: string;
        extended?: boolean;
        bid_count?: number;
      };

      if (!res.ok) {
        setErrorMessage(data.error ?? 'Could not place bid.');
        return;
      }

      // Rotate idempotency key only after successful accepted transaction
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `bid_${Date.now()}_${Math.random()}`;

      if (proxyNum !== null) setMyProxyMax(proxyNum);
      if (data.highest_bidder_id !== undefined) {
        highestBidderRef.current = data.highest_bidder_id;
      }

      setAuction((prev) => ({
        ...prev,
        current_price: Number(data.current_price ?? prev.current_price),
        highest_bidder_id: data.highest_bidder_id ?? prev.highest_bidder_id,
        ends_at: data.ends_at ?? prev.ends_at,
        extensions_count: data.extended ? prev.extensions_count + 1 : prev.extensions_count,
        bid_count: data.bid_count !== undefined ? Number(data.bid_count) : prev.bid_count,
      }));

      if (data.is_leading) {
        setSuccessMessage(
          data.extended
            ? `Leading bid locked via ShieldLock! SnipeShield extended closing by ${auction.anti_snipe_extend_sec ?? 30}s.`
            : 'Bid accepted by ShieldLock! You are currently the highest bidder.'
        );
      } else {
        setSuccessMessage(
          `Another bidder's AutoBid/Proxy ceiling outbid your offer. Current price: ${formatINR(
            Number(data.current_price ?? minNextBid)
          )}.`
        );
      }

      router.refresh();
    } catch {
      setErrorMessage('Network error while submitting bid.');
    } finally {
      bidInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleActivateAutoBid(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const maxNum = Number(autoBidMax);
    if (!Number.isFinite(maxNum) || maxNum < minNextBid) {
      setErrorMessage(`AutoBid max budget must be at least ${formatINR(minNextBid)}.`);
      return;
    }
    if (!autoBidConfirmed) {
      setErrorMessage('Please confirm the authorization checkbox before activating AutoBid AI.');
      return;
    }

    setAutoBidLoading(true);
    try {
      const res = await fetch('/api/autobid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auction.id,
          maxAmount: maxNum,
          incrementStrategy: autoBidStrategy,
          stopCondition: autoBidStop,
          confirmed: true,
        }),
      });
      const data = (await res.json()) as { error?: string; config?: AutoBidConfig };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Could not activate AutoBid AI.');
        return;
      }
      if (data.config) setMyAutoBid(data.config);
      setSuccessMessage(`AutoBid AI activated up to ${formatINR(maxNum)}.`);
      setAutoBidOpen(false);
      router.refresh();
    } catch {
      setErrorMessage('Network error activating AutoBid AI.');
    } finally {
      setAutoBidLoading(false);
    }
  }

  async function handleToggleAutoBidPause() {
    if (!myAutoBid) return;
    setAutoBidLoading(true);
    try {
      const res = await fetch('/api/autobid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: myAutoBid.id, isActive: !myAutoBid.is_active }),
      });
      if (res.ok) {
        setMyAutoBid((prev) => (prev ? { ...prev, is_active: !prev.is_active } : null));
      }
    } finally {
      setAutoBidLoading(false);
    }
  }

  async function handleAddPassportDoc(e: FormEvent) {
    e.preventDefault();
    if (docTitle.trim().length < 3 || docSubmitting) return;
    setDocSubmitting(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          title: docTitle.trim(),
          notes: docNotes.trim(),
          contentDigestSource: `${auction.title}:${docTitle}:${docNotes}`,
        }),
      });
      const data = (await res.json()) as { document?: AssetDocument; error?: string };
      if (res.ok && data.document) {
        setDocuments((prev) => [data.document!, ...prev]);
        setDocTitle('');
        setDocNotes('');
      } else {
        setErrorMessage(data.error ?? 'Could not attach document.');
      }
    } finally {
      setDocSubmitting(false);
    }
  }

  async function handleFinalizeOrder() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/close`, { method: 'POST' });
      const data = (await res.json()) as { closed?: boolean; orderId?: string; order?: { id: string }; error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Unable to finalize order.');
        return;
      }
      // Try to get the order ID from the response so we can show the receipt modal
      const oid = data.orderId ?? data.order?.id ?? null;
      if (oid) {
        const seenKey = `ss_receipt_seen_${oid}`;
        if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(seenKey)) {
          sessionStorage.setItem(seenKey, '1');
          setReceiptOrderId(oid);
          setReceiptOpen(true);
          return; // Stay on page — receipt modal is open
        }
      }
      router.push('/orders');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReceiptPayment(orderId: string) {
    // Initiates Razorpay payment for the winning order and verifies it server-side
    const createRes = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const createData = (await createRes.json()) as {
      razorpayOrderId?: string;
      error?: string;
    };
    if (!createRes.ok || !createData.razorpayOrderId) {
      throw new Error(createData.error ?? 'Could not initiate payment.');
    }
    const verifyRes = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        razorpayOrderId: createData.razorpayOrderId,
        testModeConfirm: true,
      }),
    });
    const verifyData = (await verifyRes.json()) as { error?: string };
    if (!verifyRes.ok) {
      throw new Error(verifyData.error ?? 'Payment verification failed.');
    }
    router.refresh();
  }

  async function handleSellerAction(action: 'pause' | 'resume' | 'cancel') {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/auctions/${auction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Action failed.');
        return;
      }
      setAuction((prev) => ({
        ...prev,
        paused: action === 'pause' ? true : action === 'resume' ? false : prev.paused,
        status: action === 'cancel' ? 'cancelled' : prev.status,
      }));
      setSuccessMessage(`Listing ${action}d successfully.`);
    } finally {
      setActionLoading(false);
    }
  }

  const phase =
    mountedNowMs === null
      ? auction.status === 'ended' || auction.status === 'cancelled'
        ? 'ended'
        : 'live'
      : getAuctionPhase(auction, mountedNowMs);
  const backHref =
    user.role === 'admin' ? '/admin' : user.role === 'seller' ? '/seller/home' : '/bidder/home';
  const isLeading = auction.highest_bidder_id === user.id;
  const isOwnListing = auction.seller_id === user.id;

  const trueCost = useMemo(
    () => calculateTrueCost(Number(bidAmount) || minNextBid, auction.shipping_cost ?? 0),
    [bidAmount, minNextBid, auction.shipping_cost]
  );

  const priceInsight = useMemo(
    () => computePriceInsights(auction.category, auction.starting_price, comparableAuctions),
    [auction.category, auction.starting_price, comparableAuctions]
  );

  return (
    <>
      <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition hover:border-white/35 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Marketplace
          </Link>

          <div className="flex items-center gap-2">
            {auction.is_demo ? (
              <span className="rounded-full border border-amber-300/40 bg-amber-950/60 px-3 py-1 text-[11px] font-semibold text-amber-200">
                DEMO LISTING
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleToggleSave}
              disabled={savingWatchlist}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur-md transition ${
                isSaved
                  ? 'border-white/45 bg-[#e2e4e8] text-neutral-950'
                  : 'border-white/20 bg-white/[0.05] text-white hover:border-white/40'
              }`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />
              {isSaved ? 'Saved' : 'Save Item'}
            </button>
          </div>
        </div>

        {/* SNIPESHIELD PROTECTION ACTIVE Banner (Part 7) */}
        <section className="mb-6 rounded-[28px] border border-emerald-300/30 bg-emerald-950/25 p-4 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/35 bg-emerald-950/70">
                <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-emerald-200">
                  SNIPESHIELD PROTECTION ACTIVE (FAIRClose)
                </p>
                <p className="text-[11px] text-white/75">
                  Valid bids in final {auction.anti_snipe_window_sec ?? 30}s extend closing by{' '}
                  +{auction.anti_snipe_extend_sec ?? 30}s (max {auction.max_extensions ?? 10}{' '}
                  extensions) via SHIELDLOCK row locking.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/80">
              <div>
                <span className="text-white/50">Original Close: </span>
                <span className="font-medium">
                  {new Date(auction.original_ends_at || auction.ends_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-white/50">Current Close: </span>
                <span className="font-semibold text-white">
                  {new Date(auction.ends_at).toLocaleString()}
                </span>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-950/60 px-2.5 py-0.5 font-semibold text-emerald-200">
                {auction.extensions_count} Extension{auction.extensions_count === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          {/* Left Column: Gallery + Description + Shipping + Asset Passport */}
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-white/20 bg-[#0b0c10] backdrop-blur-xl">
              <div className="aspect-[16/11] w-full overflow-hidden">
                {selectedImage && !failedUrls.has(selectedImage) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedImage}
                    alt={auction.title}
                    onError={() =>
                      setFailedUrls((prev) => new Set(prev).add(selectedImage))
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#171a21] to-[#08090c]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/snipe-shield-logo.webp"
                      alt="Snipe Shield"
                      className="h-24 w-24 object-contain opacity-70"
                    />
                  </div>
                )}
              </div>

              {gallery.length > 1 ? (
                <div className="flex gap-2.5 overflow-x-auto border-t border-white/10 p-3">
                  {gallery.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setSelectedImage(url)}
                      className={`relative h-16 w-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border transition ${
                        selectedImage === url
                          ? 'border-white ring-2 ring-white/30'
                          : 'border-white/15 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={failedUrls.has(url) ? '/snipe-shield-logo.webp' : url}
                        alt={`Thumbnail ${idx + 1}`}
                        onError={() => setFailedUrls((prev) => new Set(prev).add(url))}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Item Details & Shipping */}
            <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-6 backdrop-blur-xl">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">
                Item Details &amp; Fulfillment
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/80">
                {auction.description}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-white/50">Category</span>
                  <p className="mt-0.5 font-medium text-white">{auction.category}</p>
                </div>
                <div>
                  <span className="text-white/50">Condition</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="font-semibold text-white">{auction.condition}</span>
                    {auction.defect_description || (auction.condition_proof_urls && auction.condition_proof_urls.length > 0) ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        Evidence Verified
                      </span>
                    ) : null}
                  </div>
                </div>
                <div>
                  <span className="text-white/50">Seller</span>
                  <Link
                    href={`/sellers/${auction.seller_id}`}
                    className="mt-0.5 flex items-center gap-1 font-medium text-white hover:underline"
                  >
                    <span>{auction.seller_name}</span>
                    {auction.seller_verified ? (
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
                    ) : null}
                  </Link>
                </div>
              </div>

              {/* Defect Description Section */}
              {auction.defect_description ? (
                <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-950/30 p-4 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    <span>Seller&apos;s Condition &amp; Defect Description</span>
                  </div>
                  <p className="whitespace-pre-line text-white/90 leading-relaxed pl-6">
                    {auction.defect_description}
                  </p>
                </div>
              ) : null}

              {/* Condition Proof Images Gallery */}
              {auction.condition_proof_urls && auction.condition_proof_urls.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-white/15 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-amber-300" />
                      <h3 className="text-xs font-semibold text-white">
                        Condition Proof ({auction.condition_proof_urls.length} images)
                      </h3>
                    </div>
                    <span className="text-[10px] text-white/50">
                      Click any photo to enlarge in lightbox
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {auction.condition_proof_urls.map((url, idx) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-white/20 bg-black/40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Condition proof photo ${idx + 1}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <Eye className="h-4 w-4 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-white/75">
                <div className="flex items-start gap-2">
                  <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span>
                    <strong className="text-white">Shipping:</strong>{' '}
                    {auction.shipping_details || 'Tracked courier dispatch within 48h.'}{' '}
                    ({auction.shipping_cost ? formatINR(auction.shipping_cost) : 'Free Shipping'})
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span>
                    <strong className="text-white">Delivery:</strong>{' '}
                    {auction.delivery_info || '3-5 business days pan-India.'}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span>
                    <strong className="text-white">Return Policy:</strong>{' '}
                    {auction.return_policy || '7-day SnipeShield escrow protection.'}
                  </span>
                </div>
              </div>
            </section>

            {/* Asset Passport (Part 12) */}
            <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileCheck2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                  Asset Passport &amp; Tamper-Evident Records
                </h2>
                <span className="text-[11px] text-white/55">SHA-256 Verified</span>
              </div>
              <p className="mt-1 text-[11px] text-white/55">
                Note: Seller-submitted documents carry SHA-256 fingerprints for tamper evidence; only
                records marked &ldquo;Independently Verified&rdquo; have been audited by an admin.
              </p>

              {documents.length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="rounded-2xl border border-white/15 bg-white/[0.03] p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">{doc.title}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            doc.verification_status === 'independently_verified'
                              ? 'border-emerald-300/35 bg-emerald-950/60 text-emerald-200'
                              : 'border-white/20 bg-white/10 text-white/75'
                          }`}
                        >
                          {doc.verification_status.replace('_', ' ')}
                        </span>
                      </div>
                      {doc.notes ? (
                        <p className="mt-1 text-[11px] text-white/65">{doc.notes}</p>
                      ) : null}
                      <p className="mt-1.5 break-all font-mono text-[10px] text-white/45">
                        SHA-256: {doc.sha256_hash}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-white/55">
                  No Asset Passport records attached to this listing yet.
                </p>
              )}

              {isOwnListing ? (
                <form
                  onSubmit={handleAddPassportDoc}
                  className="mt-4 space-y-2.5 border-t border-white/10 pt-4"
                >
                  <p className="text-xs font-medium text-white/85">
                    Attach Supporting Document Fingerprint
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as typeof docType)}
                      className="h-9 rounded-full border border-white/20 bg-[#0d1016] px-3 text-xs text-white"
                    >
                      <option value="invoice">Purchase Invoice</option>
                      <option value="authenticity_certificate">Authenticity Certificate</option>
                      <option value="ownership_record">Ownership Record</option>
                      <option value="condition_report">Condition Report</option>
                      <option value="supporting_doc">Supporting Document</option>
                    </select>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Document title / serial ref"
                      className="h-9 rounded-full border border-white/20 bg-white/[0.05] px-3 text-xs text-white placeholder:text-white/40"
                    />
                  </div>
                  <input
                    type="text"
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    placeholder="Serial number, invoice date, or inspection notes"
                    className="h-9 w-full rounded-full border border-white/20 bg-white/[0.05] px-3 text-xs text-white placeholder:text-white/40"
                  />
                  <button
                    type="submit"
                    disabled={docSubmitting}
                    className="smoky-cta-btn h-9 cursor-pointer rounded-full px-4 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {docSubmitting ? 'Hashing...' : 'Generate SHA-256 Passport Record'}
                  </button>
                </form>
              ) : null}
            </section>
          </div>

          {/* Right Column: Live Bid Engine + TrueCost + AutoBid + Price Insights + History */}
          <div className="space-y-6">
            <section className="smoky-glass-card rounded-[34px] border border-white/20 p-6 backdrop-blur-2xl sm:p-7">
              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/85">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    SHIELDLOCK Serialized
                  </span>

                  <CountdownTimer
                    startsAt={auction.starts_at}
                    endsAt={auction.ends_at}
                    status={auction.status}
                    auctionId={auction.id}
                    onExpire={async () => {
                      // Refresh page data so auction state reflects 'ended'
                      router.refresh();
                      // If the current user is the winner, attempt to auto-open receipt
                      // We need to fetch the order after the refresh; use a short delay
                      if (
                        auction.highest_bidder_id === user.id &&
                        (!auction.reserve_price || auction.current_price >= auction.reserve_price)
                      ) {
                        try {
                          const closeRes = await fetch(`/api/auctions/${auction.id}/close`, {
                            method: 'POST',
                          });
                          const closeData = (await closeRes.json()) as {
                            orderId?: string;
                            order?: { id: string };
                          };
                          const oid = closeData.orderId ?? closeData.order?.id ?? null;
                          if (oid) {
                            const seenKey = `ss_receipt_seen_${oid}`;
                            if (
                              typeof sessionStorage !== 'undefined' &&
                              !sessionStorage.getItem(seenKey)
                            ) {
                              sessionStorage.setItem(seenKey, '1');
                              setReceiptOrderId(oid);
                              setReceiptOpen(true);
                            }
                          }
                        } catch {
                          // Silently ignore — the user can still click "Proceed to Winner Checkout"
                        }
                      }
                    }}
                  />
                </div>

                <h1 className="text-2xl font-semibold leading-snug tracking-tight text-white">
                  {auction.title}
                </h1>

                {auction.paused ? (
                  <div className="rounded-2xl border border-amber-300/35 bg-amber-950/50 px-4 py-2 text-xs text-amber-100">
                    This auction is currently paused by the seller.
                  </div>
                ) : null}

                <div className="rounded-3xl border border-white/20 bg-white/[0.05] p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">
                        {phase === 'ended' || auction.status === 'ended'
                          ? auction.highest_bidder_id
                            ? 'Final Winning Bid'
                            : 'Starting Price (Unsold)'
                          : auction.highest_bidder_id
                            ? 'Current Highest Bid'
                            : 'Starting Price'}
                      </p>
                      <p className="mt-0.5 text-3xl font-semibold tracking-tight text-white">
                        {formatINR(auction.current_price)}
                      </p>
                    </div>

                    {isLeading ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-200">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                        {phase === 'ended' || auction.status === 'ended' ? 'Winning Bidder' : "You're Leading"}
                      </span>
                    ) : null}
                  </div>

                  {/* Condition preview banner before bidding */}
                  <div className="mt-2.5 flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs">
                    <span className="text-white/60">Condition:</span>
                    <span className="font-semibold text-white">{auction.condition}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs text-white/65">
                    <span>Min Increment: {formatINR(auction.min_increment)}</span>
                    <span>Next Min Bid: {formatINR(minNextBid)}</span>
                  </div>
                </div>

                {/* Role-based Bidding Panel */}
                {user.role === 'bidder' && !isOwnListing ? (
                  phase === 'live' && !auction.paused ? (
                    <div className="space-y-4">
                      <form onSubmit={handlePlaceBid} className="space-y-3.5">
                        <div>
                          <label
                            htmlFor="bid-amount-input"
                            className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                          >
                            Your Bid Amount (₹)
                          </label>
                          <input
                            id="bid-amount-input"
                            type="number"
                            min={minNextBid}
                            step="1"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            disabled={submitting}
                            className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.05] px-4 text-sm font-medium text-white focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/15"
                          />
                        </div>

                        {/* Quick Auto-Proxy */}
                        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-3.5">
                          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                            <span className="flex items-center gap-2 font-medium text-white/85">
                              <Bot className="h-4 w-4 text-[#d5d7db]" aria-hidden="true" />
                              Enable Quick Proxy Ceiling
                            </span>
                            <input
                              type="checkbox"
                              checked={enableProxy}
                              onChange={(e) => setEnableProxy(e.target.checked)}
                              className="h-4 w-4 accent-white"
                            />
                          </label>

                          {enableProxy ? (
                            <div className="mt-3">
                              <input
                                type="number"
                                min={Number(bidAmount) || minNextBid}
                                step="1"
                                value={proxyMaxInput}
                                onChange={(e) => setProxyMaxInput(e.target.value)}
                                placeholder="Enter secret max bid ceiling (₹)"
                                className="h-10 w-full rounded-full border border-white/20 bg-black/35 px-4 text-xs text-white placeholder:text-white/40 focus:border-white/45 focus:outline-none"
                              />
                            </div>
                          ) : myProxyMax ? (
                            <p className="mt-1.5 text-[11px] text-white/60">
                              Active hidden proxy ceiling: {formatINR(myProxyMax)}
                            </p>
                          ) : null}
                        </div>

                        {errorMessage ? (
                          <div
                            role="alert"
                            className="rounded-2xl border border-rose-300/25 bg-rose-950/50 px-4 py-2.5 text-center text-xs text-rose-100"
                          >
                            {errorMessage}
                          </div>
                        ) : null}

                        {successMessage ? (
                          <div
                            role="status"
                            className="rounded-2xl border border-emerald-300/25 bg-emerald-950/50 px-4 py-2.5 text-center text-xs text-emerald-100"
                          >
                            {successMessage}
                          </div>
                        ) : null}

                        <ShinyButton
                          type="submit"
                          disabled={submitting}
                          label={
                            submitting
                              ? 'Locking Bid...'
                              : `Place Bid (${formatINR(Number(bidAmount) || minNextBid)})`
                          }
                          fillColor="#0b0c10"
                          labelColor="#ffffff"
                          accentColor="#a7adb6"
                          accentSoftColor="#e2e4e8"
                          cornerRadius={9999}
                          speckleOpacity={0.28}
                          className="flex h-[46px] w-full items-center justify-center !p-0 !text-sm !font-medium shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                        />
                      </form>

                      {/* AUTOBID AI Section (Part 6) */}
                      <div className="rounded-2xl border border-white/20 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <span className="text-xs font-semibold text-white">AUTOBID AI</span>
                          </div>
                          {myAutoBid ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  myAutoBid.is_active
                                    ? 'bg-emerald-950/70 text-emerald-200'
                                    : 'bg-white/10 text-white/65'
                                }`}
                              >
                                {myAutoBid.is_active ? 'Active' : 'Paused'} · Max{' '}
                                {formatINR(myAutoBid.max_amount)}
                              </span>
                              <button
                                type="button"
                                onClick={handleToggleAutoBidPause}
                                disabled={autoBidLoading}
                                className="cursor-pointer rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] text-white hover:border-white/40"
                              >
                                {myAutoBid.is_active ? 'Pause' : 'Resume'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAutoBidOpen((o) => !o)}
                              className="cursor-pointer rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-medium text-white hover:border-white/45"
                            >
                              {autoBidOpen ? 'Close' : 'Configure AutoBid AI'}
                            </button>
                          )}
                        </div>

                        {autoBidOpen ? (
                          <form onSubmit={handleActivateAutoBid} className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                            <input
                              type="number"
                              min={minNextBid}
                              value={autoBidMax}
                              onChange={(e) => setAutoBidMax(e.target.value)}
                              placeholder={`Authorized max budget (min ${formatINR(minNextBid)})`}
                              required
                              className="h-9 w-full rounded-full border border-white/20 bg-black/40 px-3.5 text-xs text-white"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={autoBidStrategy}
                                onChange={(e) =>
                                  setAutoBidStrategy(e.target.value as typeof autoBidStrategy)
                                }
                                className="h-9 rounded-full border border-white/20 bg-[#0d1016] px-3 text-[11px] text-white"
                              >
                                <option value="minimum">Min Increment (+1x)</option>
                                <option value="step_2x">Aggressive (+2x)</option>
                                <option value="conservative">Conservative</option>
                              </select>
                              <select
                                value={autoBidStop}
                                onChange={(e) =>
                                  setAutoBidStop(e.target.value as typeof autoBidStop)
                                }
                                className="h-9 rounded-full border border-white/20 bg-[#0d1016] px-3 text-[11px] text-white"
                              >
                                <option value="max_budget">Stop at Max Budget</option>
                                <option value="max_5_bids">Stop after 5 Bids</option>
                                <option value="outbid_twice">Stop if Outbid 2x</option>
                              </select>
                            </div>
                            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-white/75">
                              <input
                                type="checkbox"
                                checked={autoBidConfirmed}
                                onChange={(e) => setAutoBidConfirmed(e.target.checked)}
                                className="mt-0.5 accent-emerald-400"
                              />
                              <span>
                                I authorize deterministic server-side AutoBid up to my exact
                                maximum limit. It will never exceed this cap.
                              </span>
                            </label>
                            <button
                              type="submit"
                              disabled={autoBidLoading}
                              className="smoky-cta-btn h-9 w-full cursor-pointer rounded-full text-xs font-semibold text-white"
                            >
                              {autoBidLoading ? 'Activating...' : 'Confirm & Activate AutoBid AI'}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-3xl border border-white/20 bg-[#0d0f15]/90 p-5 text-xs text-white/85 shadow-xl backdrop-blur-xl">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Gavel className="h-4 w-4 text-[#a7adb6]" aria-hidden="true" />
                          <span className="font-semibold uppercase tracking-wider text-white">
                            Auction Finalized
                          </span>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                            !auction.highest_bidder_id
                              ? 'border-white/20 bg-white/10 text-white/70'
                              : auction.reserve_price !== null && auction.current_price < auction.reserve_price
                                ? 'border-amber-400/30 bg-amber-950/60 text-amber-200'
                                : 'border-emerald-400/30 bg-emerald-950/60 text-emerald-200'
                          }`}
                        >
                          {!auction.highest_bidder_id
                            ? 'Unsold (No Bids)'
                            : auction.reserve_price !== null && auction.current_price < auction.reserve_price
                              ? 'Reserve Unmet'
                              : 'Sold'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-white/50">Winning / Final Price</span>
                          <p className="mt-0.5 text-base font-semibold text-white">
                            {formatINR(auction.current_price)}
                          </p>
                        </div>
                        <div>
                          <span className="text-white/50">Winning Bidder</span>
                          <p className="mt-0.5 font-medium text-white">
                            {auction.highest_bidder_id
                              ? isLeading
                                ? `You (${maskBidderName(user.displayName)})`
                                : maskBidderName(auction.highest_bidder_name)
                              : 'None (Unsold)'}
                          </p>
                        </div>
                        <div>
                          <span className="text-white/50">Total Bids</span>
                          <p className="mt-0.5 font-medium text-white">{auction.bid_count ?? 0} placed</p>
                        </div>
                        <div>
                          <span className="text-white/50">FairClose Extensions</span>
                          <p className="mt-0.5 font-medium text-white">{auction.extensions_count} applied</p>
                        </div>
                      </div>

                      {auction.reserve_price !== null ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-white/70">
                          <span className="font-medium text-white">Reserve Status: </span>
                          {auction.current_price >= auction.reserve_price ? (
                            <span className="font-semibold text-emerald-300">Reserve Met</span>
                          ) : (
                            <span className="font-semibold text-amber-300">
                              Reserve Not Met ({formatINR(auction.current_price)} vs Reserve {formatINR(auction.reserve_price)})
                            </span>
                          )}
                        </div>
                      ) : null}

                      {isLeading && (!auction.reserve_price || auction.current_price >= auction.reserve_price) ? (
                        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/40 p-4 text-center">
                          <p className="text-sm font-semibold text-emerald-200">
                            Congratulations! You won this auction.
                          </p>
                          <p className="mt-1 text-xs text-white/70">
                            Complete your escrow payment and provide delivery instructions.
                          </p>
                          <button
                            type="button"
                            onClick={handleFinalizeOrder}
                            disabled={actionLoading}
                            className="smoky-cta-btn mt-3 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-xs font-semibold text-white"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            {actionLoading ? 'Preparing Checkout...' : 'Proceed to Winner Checkout'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                ) : (
                  <div className="space-y-3 rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-xs text-white/75">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <Store className="h-4 w-4" aria-hidden="true" />
                      <span>{isOwnListing ? 'Manage Your Listing' : 'Seller / Admin View Mode'}</span>
                    </div>
                    <p className="text-white/65">
                      {isOwnListing
                        ? phase === 'ended' || auction.status === 'ended'
                          ? `Auction Ended · ${
                              auction.highest_bidder_id
                                ? `Sold at ${formatINR(auction.current_price)} to ${maskBidderName(auction.highest_bidder_name)}`
                                : 'Unsold (No bids)'
                            }`
                          : `Views: ${auction.views_count ?? 0}${
                              auction.reserve_price !== null
                                ? ` • Hidden Reserve: ${formatINR(auction.reserve_price)}`
                                : ''
                            }`
                        : 'Accounts other than Bidders view this auction in read-only mode.'}
                    </p>
                    {isOwnListing && phase === 'live' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleSellerAction(auction.paused ? 'resume' : 'pause')
                          }
                          disabled={actionLoading}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 text-[11px] font-medium text-white hover:border-white/45"
                        >
                          {auction.paused ? (
                            <>
                              <Play className="h-3 w-3" /> Resume
                            </>
                          ) : (
                            <>
                              <Pause className="h-3 w-3" /> Pause
                            </>
                          )}
                        </button>
                        {(auction.bid_count ?? 0) === 0 ? (
                          <button
                            type="button"
                            onClick={() => handleSellerAction('cancel')}
                            disabled={actionLoading}
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-950/50 px-3 text-[11px] font-medium text-rose-100"
                          >
                            Cancel Listing
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* TRUECOST Breakdown (Part 11) */}
                <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-white">
                    <Sparkles className="h-3.5 w-3.5 text-[#e2e4e8]" />
                    TrueCost Estimator (If Winning at {formatINR(trueCost.winningBid)})
                  </p>
                  <div className="mt-2.5 space-y-1 text-[11px] text-white/70">
                    <div className="flex justify-between">
                      <span>Hammer Bid</span>
                      <span>{formatINR(trueCost.winningBid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platform Escrow Fee (2.5%, cap ₹2,500)</span>
                      <span>{formatINR(trueCost.platformFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span>
                        {trueCost.shippingCost ? formatINR(trueCost.shippingCost) : 'Free'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (18% on platform fee)</span>
                      <span>{formatINR(trueCost.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold text-white">
                      <span>Estimated Total Payable</span>
                      <span>{formatINR(trueCost.totalPayable)}</span>
                    </div>
                  </div>
                </div>

                {/* AI Price Insights (Part 11) */}
                <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-white">
                    <TrendingUp className="h-3.5 w-3.5 text-[#e2e4e8]" />
                    Price Insights ({auction.category})
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                      <span className="text-white/50">Low</span>
                      <p className="font-semibold text-white">{formatINR(priceInsight.lowEstimate)}</p>
                    </div>
                    <div className="rounded-xl border border-white/20 bg-white/[0.06] p-2">
                      <span className="text-white/60">Median</span>
                      <p className="font-semibold text-white">{formatINR(priceInsight.medianEstimate)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                      <span className="text-white/50">High</span>
                      <p className="font-semibold text-white">{formatINR(priceInsight.highEstimate)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-white/50">{priceInsight.basisNote}</p>
                </div>
              </div>
            </section>

            {/* Live Bid History */}
            <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Gavel className="h-4 w-4 text-[#d5d7db]" aria-hidden="true" />
                  Live Bid History
                </h2>
                <span className="text-xs text-white/55">
                  {Math.max(auction.bid_count ?? 0, bids.length)} total
                </span>
              </div>

              {bids.length > 0 ? (
                <ul className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pr-1">
                  {bids.map((bid, idx) => (
                    <li
                      key={bid.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-xs ${
                        idx === 0
                          ? 'border-white/30 bg-white/[0.08]'
                          : 'border-white/10 bg-white/[0.025]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-white">
                            {bid.bidder_name}
                          </span>
                          {bid.is_auto_proxy ? (
                            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                              {bid.bid_source === 'autobid' ? 'AutoBid AI' : 'Auto-Proxy'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[10px] text-white/50">
                          {mountedNowMs !== null
                            ? new Date(bid.created_at).toLocaleTimeString()
                            : `${new Date(bid.created_at).toISOString().slice(11, 19)} UTC`}
                        </p>
                      </div>

                      <span className="font-semibold text-white">{formatINR(bid.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-center text-xs text-white/55">
                  No bids placed yet. Be the first to bid!
                </p>
              )}

              {extensions.length > 0 ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                    <History className="h-3.5 w-3.5" />
                    Anti-Snipe Extension History
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[11px] text-white/65">
                    {extensions.map((ext) => (
                      <li key={ext.id} className="flex justify-between">
                        <span>+{ext.extension_seconds}s extension triggered</span>
                        <span>{new Date(ext.new_ends_at).toLocaleTimeString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </div>

    {/* Condition Proof Lightbox */}
    {lightboxIndex !== null && auction.condition_proof_urls && auction.condition_proof_urls[lightboxIndex] ? (
      <div
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        onClick={() => setLightboxIndex(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Condition Proof Photo Lightbox"
      >
        <button
          type="button"
          onClick={() => setLightboxIndex(null)}
          className="absolute right-5 top-5 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          aria-label="Close photo preview"
        >
          <X className="h-6 w-6" />
        </button>

        {lightboxIndex > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2.5 text-white hover:bg-white/40"
            aria-label="Previous proof photo"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}

        {lightboxIndex < auction.condition_proof_urls.length - 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i !== null && i < auction.condition_proof_urls!.length - 1 ? i + 1 : i));
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2.5 text-white hover:bg-white/40"
            aria-label="Next proof photo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}

        <div
          className="relative max-h-[85vh] max-w-4xl overflow-hidden rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={auction.condition_proof_urls[lightboxIndex]}
            alt={`Condition evidence ${lightboxIndex + 1}`}
            className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <div className="mt-2 text-center text-xs text-white/70">
            Condition Proof Photo {lightboxIndex + 1} of {auction.condition_proof_urls.length} &bull; {auction.condition}
          </div>
        </div>
      </div>
    ) : null}

    {/* Winning Receipt Modal — shown once per session for the auction winner */}
    <WinningReceiptModal
      orderId={receiptOrderId ?? ''}
      isOpen={receiptOpen && !!receiptOrderId}
      onClose={() => setReceiptOpen(false)}
      onProceedToPayment={handleReceiptPayment}
    />
    </>
  );
}
