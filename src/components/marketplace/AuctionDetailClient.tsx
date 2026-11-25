'use client';

import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  Gavel,
  History,
  Lock,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CountdownTimer } from '@/components/marketplace/CountdownTimer';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { WinningReceiptModal } from '@/components/marketplace/WinningReceiptModal';
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
  const menuRef = useRef<HTMLDivElement>(null);
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

  // UI state for clean collapsible sections & secondary/tertiary actions
  const [specsOpen, setSpecsOpen] = useState(true);
  const [passportOpen, setPassportOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [automatedOpen, setAutomatedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fairCloseInfoOpen, setFairCloseInfoOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

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
  const [docType, setDocType] = useState<
    'invoice' | 'authenticity_certificate' | 'ownership_record' | 'condition_report' | 'supporting_doc'
  >('invoice');
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

  // Close tertiary overflow menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

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

  async function handleShare() {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: auction.title,
          url: window.location.href,
        });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedShare(true);
        window.setTimeout(() => setCopiedShare(false), 2000);
      }
    } catch {
      // Ignore share cancellation
    }
  }

  function scrollToSection(id: string) {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            ? `Leading bid locked. FairClose extended closing by +${auction.anti_snipe_extend_sec ?? 30}s.`
            : 'Bid accepted. You are currently the highest bidder.'
        );
      } else {
        setSuccessMessage(
          `Outbid by an active proxy ceiling. Current price: ${formatINR(
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
      const data = (await res.json()) as {
        closed?: boolean;
        orderId?: string;
        order?: { id: string };
        error?: string;
      };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Unable to finalize order.');
        return;
      }
      const oid = data.orderId ?? data.order?.id ?? null;
      if (oid) {
        const seenKey = `ss_receipt_seen_${oid}`;
        if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(seenKey)) {
          sessionStorage.setItem(seenKey, '1');
          setReceiptOrderId(oid);
          setReceiptOpen(true);
          return;
        }
      }
      router.push('/orders');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReceiptPayment(orderId: string) {
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

  const totalBidsCount = Math.max(auction.bid_count ?? 0, bids.length);
  const uniqueBiddersCount = useMemo(
    () => new Set(bids.map((b) => b.bidder_id)).size,
    [bids]
  );

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

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {/* Minimal Top Bar: Breadcrumb + Secondary / Tertiary Controls */}
          <header className="mb-8 flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-xs font-medium text-white/60 transition hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to Marketplace</span>
            </Link>

            <div className="flex items-center gap-2">
              {auction.is_demo ? (
                <span className="rounded-full border border-white/20 bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
                  Demo
                </span>
              ) : null}

              {/* Secondary: Watchlist / Save */}
              <button
                type="button"
                onClick={handleToggleSave}
                disabled={savingWatchlist}
                aria-label={isSaved ? 'Remove from watchlist' : 'Save to watchlist'}
                title={isSaved ? 'Saved to Watchlist' : 'Save to Watchlist'}
                className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition ${
                  isSaved
                    ? 'border-white/40 bg-white text-neutral-950'
                    : 'border-white/15 bg-white/[0.03] text-white/80 hover:border-white/30 hover:text-white'
                }`}
              >
                <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Watch'}</span>
              </button>

              {/* Secondary: Share */}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share auction link"
                title="Share auction link"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/80 transition hover:border-white/30 hover:text-white"
              >
                {copiedShare ? (
                  <Check className="h-3.5 w-3.5 text-white/85" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Tertiary: Overflow Menu */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="More auction options"
                  aria-expanded={menuOpen}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {menuOpen ? (
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/15 bg-[#111319]/95 py-1.5 shadow-2xl backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => scrollToSection('bidding-history')}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Gavel className="h-3.5 w-3.5 text-white/55" />
                      View Bidding History
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPassportOpen(true);
                        scrollToSection('asset-passport');
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <FileCheck2 className="h-3.5 w-3.5 text-white/55" />
                      Asset Passport (SHA-256)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFairCloseInfoOpen((v) => !v);
                        setMenuOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-white/85" />
                      FairClose Anti-Snipe Info
                    </button>
                    <Link
                      href={`/sellers/${auction.seller_id}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Store className="h-3.5 w-3.5 text-white/55" />
                      Seller Storefront
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {/* Optional FairClose Anti-Snipe Drawer (toggled from badge or overflow menu) */}
          {fairCloseInfoOpen ? (
            <div className="mb-8 flex items-start justify-between gap-4 rounded-xl border border-white/25 bg-white/[0.06] px-4 py-3 text-xs text-white/80">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/85" />
                <div>
                  <p className="font-medium text-white/85">
                    SnipeShield FairClose Protection Active
                  </p>
                  <p className="mt-0.5 text-white/65">
                    Valid bids in the final {auction.anti_snipe_window_sec ?? 30}s extend closing by +
                    {auction.anti_snipe_extend_sec ?? 30}s (max {auction.max_extensions ?? 10}{' '}
                    extensions). {auction.extensions_count} extension
                    {auction.extensions_count === 1 ? '' : 's'} applied so far.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFairCloseInfoOpen(false)}
                className="cursor-pointer rounded-md p-1 text-white/50 hover:text-white"
                aria-label="Dismiss protection details"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* Main 2-Column Auction House Layout */}
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_0.85fr] lg:gap-12">
            {/* LEFT COLUMN: Product Gallery, Metadata, Seller, & Collapsible Details */}
            <div className="order-1 space-y-8">
              {/* Product Image Gallery */}
              <div className="space-y-3">
                <div className="aspect-[16/11] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c10]">
                  {selectedImage && !failedUrls.has(selectedImage) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedImage}
                      alt={auction.title}
                      onError={() =>
                        setFailedUrls((prev) => new Set(prev).add(selectedImage))
                      }
                      className="h-full w-full object-cover transition duration-500"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#151820] to-[#08090c]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/snipe-shield-logo.webp"
                        alt="Snipe Shield"
                        className="h-20 w-20 object-contain opacity-65"
                      />
                    </div>
                  )}
                </div>

                {gallery.length > 1 ? (
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {gallery.map((url, idx) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setSelectedImage(url)}
                        className={`relative h-16 w-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border transition ${
                          selectedImage === url
                            ? 'border-white/70 ring-1 ring-white/40'
                            : 'border-white/10 opacity-60 hover:opacity-100'
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

              {/* Product Header: Category, Condition, Title */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="font-medium uppercase tracking-[0.14em] text-white/50">
                    {auction.category}
                  </span>
                  <span className="text-white/20">/</span>
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-white/90">
                    {auction.condition}
                  </span>
                  {auction.defect_description ||
                  (auction.condition_proof_urls && auction.condition_proof_urls.length > 0) ? (
                    <span className="rounded-full border border-white/20 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-white/80">
                      Condition Proof Verified
                    </span>
                  ) : null}
                </div>

                <h1 className="text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
                  {auction.title}
                </h1>
              </div>

              {/* Compact Seller Bar */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-xs font-semibold text-white">
                    {auction.seller_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-white">
                        {auction.seller_name}
                      </span>
                      {auction.seller_verified ? (
                        <BadgeCheck className="h-4 w-4 shrink-0 text-white/85" />
                      ) : null}
                    </div>
                    <p className="text-[11px] text-white/50">
                      {auction.seller_verified ? 'Verified Auction Seller' : 'Marketplace Seller'}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/sellers/${auction.seller_id}`}
                  className="shrink-0 text-xs font-medium text-white/70 transition hover:text-white"
                >
                  View Store &rarr;
                </Link>
              </div>

              {/* Condition & Defect Proof Disclosure (when applicable) */}
              {auction.defect_description ||
              (auction.condition_proof_urls && auction.condition_proof_urls.length > 0) ? (
                <section className="space-y-4 rounded-xl border border-white/20 bg-white/[0.05] p-5">
                  {auction.defect_description ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>Reported Condition &amp; Defects</span>
                      </div>
                      <p className="whitespace-pre-line pl-6 text-xs leading-relaxed text-white/80">
                        {auction.defect_description}
                      </p>
                    </div>
                  ) : null}

                  {auction.condition_proof_urls && auction.condition_proof_urls.length > 0 ? (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-white/85">
                          <Camera className="h-3.5 w-3.5 text-white/80" />
                          Evidence Photos ({auction.condition_proof_urls.length})
                        </span>
                        <span className="text-[11px] text-white/45">Click to enlarge</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {auction.condition_proof_urls.map((url, idx) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setLightboxIndex(idx)}
                            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-white/15 bg-black/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Condition proof photo ${idx + 1}`}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                              <Eye className="h-4 w-4 text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {/* Collapsible: Description & Specifications */}
              <section className="border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => setSpecsOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-between text-left"
                >
                  <span className="text-sm font-semibold tracking-tight text-white">
                    Description &amp; Specifications
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/50 transition-transform ${
                      specsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {specsOpen ? (
                  <div className="mt-4 space-y-5">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">
                      {auction.description}
                    </p>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-white/45">Starting Price</span>
                        <p className="mt-0.5 font-medium tabular-nums text-white">
                          {formatINR(auction.starting_price)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/45">Min Increment</span>
                        <p className="mt-0.5 font-medium tabular-nums text-white">
                          {formatINR(auction.min_increment)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/45">Condition</span>
                        <p className="mt-0.5 font-medium text-white">{auction.condition}</p>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-white/[0.08] pt-4 text-xs text-white/70">
                      <div className="flex items-start gap-2.5">
                        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/45" />
                        <span>
                          <strong className="font-medium text-white">Shipping:</strong>{' '}
                          {auction.shipping_details || 'Tracked courier dispatch within 48h.'} (
                          {auction.shipping_cost ? formatINR(auction.shipping_cost) : 'Free'})
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/45" />
                        <span>
                          <strong className="font-medium text-white">Delivery:</strong>{' '}
                          {auction.delivery_info || '3-5 business days pan-India.'}
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/45" />
                        <span>
                          <strong className="font-medium text-white">Escrow &amp; Returns:</strong>{' '}
                          {auction.return_policy || '7-day SnipeShield escrow protection.'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Collapsible: Asset Passport (SHA-256) */}
              <section id="asset-passport" className="border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => setPassportOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-white/85" aria-hidden="true" />
                    <span className="text-sm font-semibold tracking-tight text-white">
                      Asset Passport &amp; Records
                    </span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/60">
                      {documents.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-white/50 transition-transform ${
                      passportOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {passportOpen ? (
                  <div className="mt-4 space-y-4">
                    <p className="text-[11px] leading-relaxed text-white/50">
                      Seller-submitted documents carry SHA-256 fingerprints for tamper evidence.
                      Records marked &ldquo;Independently Verified&rdquo; have been audited by an
                      admin.
                    </p>

                    {documents.length > 0 ? (
                      <ul className="space-y-2.5">
                        {documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-white">{doc.title}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                  doc.verification_status === 'independently_verified'
                                    ? 'border-white/25 bg-white/[0.06] text-white/85'
                                    : 'border-white/15 bg-white/[0.05] text-white/70'
                                }`}
                              >
                                {doc.verification_status.replace('_', ' ')}
                              </span>
                            </div>
                            {doc.notes ? (
                              <p className="mt-1 text-[11px] text-white/60">{doc.notes}</p>
                            ) : null}
                            <p className="mt-1.5 break-all font-mono text-[10px] text-white/40">
                              SHA-256: {doc.sha256_hash}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-white/50">
                        No Asset Passport records attached to this listing yet.
                      </p>
                    )}

                    {isOwnListing ? (
                      <form
                        onSubmit={handleAddPassportDoc}
                        className="space-y-2.5 border-t border-white/10 pt-4"
                      >
                        <p className="text-xs font-medium text-white/80">
                          Attach Supporting Document Fingerprint
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value as typeof docType)}
                            className="h-9 rounded-lg border border-white/15 bg-[#0d1016] px-3 text-xs text-white"
                          >
                            <option value="invoice">Purchase Invoice</option>
                            <option value="authenticity_certificate">
                              Authenticity Certificate
                            </option>
                            <option value="ownership_record">Ownership Record</option>
                            <option value="condition_report">Condition Report</option>
                            <option value="supporting_doc">Supporting Document</option>
                          </select>
                          <input
                            type="text"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            placeholder="Document title / serial ref"
                            className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/40"
                          />
                        </div>
                        <input
                          type="text"
                          value={docNotes}
                          onChange={(e) => setDocNotes(e.target.value)}
                          placeholder="Serial number, invoice date, or inspection notes"
                          className="h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs text-white placeholder:text-white/40"
                        />
                        <button
                          type="submit"
                          disabled={docSubmitting}
                          className="smoky-cta-btn h-9 cursor-pointer rounded-lg px-4 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {docSubmitting ? 'Hashing...' : 'Generate SHA-256 Passport Record'}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {/* Collapsible: TrueCost & Price Insights */}
              <section className="border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => setInsightsOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-white/70" />
                    <span className="text-sm font-semibold tracking-tight text-white">
                      TrueCost Estimator &amp; Market Insights
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-white/50 transition-transform ${
                      insightsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {insightsOpen ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
                      <p className="font-medium text-white">
                        Estimated Total ({formatINR(trueCost.winningBid)})
                      </p>
                      <div className="mt-3 space-y-1.5 text-[11px] text-white/65">
                        <div className="flex justify-between">
                          <span>Hammer Bid</span>
                          <span className="tabular-nums">{formatINR(trueCost.winningBid)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Escrow Fee (2.5%, cap ₹2,500)</span>
                          <span className="tabular-nums">{formatINR(trueCost.platformFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping</span>
                          <span className="tabular-nums">
                            {trueCost.shippingCost ? formatINR(trueCost.shippingCost) : 'Free'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>GST (18% on fee)</span>
                          <span className="tabular-nums">{formatINR(trueCost.taxAmount)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
                          <span>Total Payable</span>
                          <span className="tabular-nums">{formatINR(trueCost.totalPayable)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
                      <p className="flex items-center gap-1.5 font-medium text-white">
                        <TrendingUp className="h-3.5 w-3.5 text-white/65" />
                        Market Range ({auction.category})
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                          <span className="text-white/45">Low</span>
                          <p className="mt-0.5 font-semibold tabular-nums text-white">
                            {formatINR(priceInsight.lowEstimate)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/20 bg-white/[0.05] p-2">
                          <span className="text-white/65">Median</span>
                          <p className="mt-0.5 font-semibold tabular-nums text-white">
                            {formatINR(priceInsight.medianEstimate)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                          <span className="text-white/45">High</span>
                          <p className="mt-0.5 font-semibold tabular-nums text-white">
                            {formatINR(priceInsight.highEstimate)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2.5 text-[10px] leading-relaxed text-white/45">
                        {priceInsight.basisNote}
                      </p>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            {/* RIGHT COLUMN: Sticky Live Bidding Panel */}
            <aside className="order-2 lg:sticky lg:top-24">
              <div className="rounded-2xl border border-white/15 bg-[#0c0e13]/90 p-6 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                {/* Status + Timer Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    {phase === 'live' && !auction.paused ? (
                      <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                        Live Auction
                      </span>
                    ) : auction.paused ? (
                      <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
                        Paused
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        Auction Ended
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setFairCloseInfoOpen((v) => !v)}
                      title="Protected by ShieldLock & FairClose Anti-Sniping"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/65 transition hover:border-white/25 hover:text-white"
                    >
                      <Lock className="h-2.5 w-2.5 text-white/85" />
                      FairClose
                    </button>
                  </div>

                  <CountdownTimer
                    startsAt={auction.starts_at}
                    endsAt={auction.ends_at}
                    status={auction.status}
                    compact
                    auctionId={auction.id}
                    onExpire={async () => {
                      router.refresh();
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
                          // Silently ignore — user can click Proceed to Winner Checkout
                        }
                      }
                    }}
                  />
                </div>

                {/* Current Highest Bid */}
                <div className="py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/50">
                        {phase === 'ended' || auction.status === 'ended'
                          ? auction.highest_bidder_id
                            ? 'Final Winning Bid'
                            : 'Starting Price (Unsold)'
                          : auction.highest_bidder_id
                            ? 'Current Highest Bid'
                            : 'Starting Bid'}
                      </p>
                      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-white">
                        {formatINR(auction.current_price)}
                      </p>
                    </div>

                    {isLeading ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/85">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                        {phase === 'ended' || auction.status === 'ended' ? 'Winner' : 'Leading'}
                      </span>
                    ) : null}
                  </div>

                  {/* Active Bidders & Min Next Bid */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3.5 text-xs text-white/60">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-white/45" />
                      <strong className="font-medium text-white">{uniqueBiddersCount}</strong> active{' '}
                      {uniqueBiddersCount === 1 ? 'bidder' : 'bidders'} ({totalBidsCount}{' '}
                      {totalBidsCount === 1 ? 'bid' : 'bids'})
                    </span>
                    <span className="tabular-nums">
                      Min next:{' '}
                      <strong className="font-medium text-white">{formatINR(minNextBid)}</strong>
                    </span>
                  </div>
                </div>

                {/* Role-based Interactive Bidding Form */}
                {user.role === 'bidder' && !isOwnListing ? (
                  phase === 'live' && !auction.paused ? (
                    <div className="space-y-4 border-t border-white/10 pt-5">
                      <form onSubmit={handlePlaceBid} className="space-y-3.5">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <label
                              htmlFor="bid-amount-input"
                              className="font-medium text-white/80"
                            >
                              Bid Amount
                            </label>
                            <span className="text-[11px] tabular-nums text-white/45">
                              Min {formatINR(minNextBid)} (+{formatINR(auction.min_increment)})
                            </span>
                          </div>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white/45">
                              ₹
                            </span>
                            <input
                              id="bid-amount-input"
                              type="number"
                              min={minNextBid}
                              step="1"
                              value={bidAmount}
                              onChange={(e) => setBidAmount(e.target.value)}
                              disabled={submitting}
                              className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.04] pl-8 pr-4 text-base font-medium tabular-nums text-white transition focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/10"
                            />
                          </div>
                        </div>

                        {errorMessage ? (
                          <div
                            role="alert"
                            className="rounded-xl border border-rose-400/25 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200"
                          >
                            {errorMessage}
                          </div>
                        ) : null}

                        {successMessage ? (
                          <div
                            role="status"
                            className="rounded-xl border border-white/25 bg-white/[0.06] px-3.5 py-2.5 text-xs text-white/85"
                          >
                            {successMessage}
                          </div>
                        ) : null}

                        {/* Primary Action: PLACE BID */}
                        <ShinyButton
                          type="submit"
                          disabled={submitting}
                          label={
                            submitting
                              ? 'LOCKING BID...'
                              : `PLACE BID · ${formatINR(Number(bidAmount) || minNextBid)}`
                          }
                          fillColor="#0b0c10"
                          labelColor="#ffffff"
                          accentColor="#a7adb6"
                          accentSoftColor="#e2e4e8"
                          cornerRadius={12}
                          speckleOpacity={0.22}
                          className="flex h-12 w-full items-center justify-center !p-0 !text-xs !font-semibold !tracking-wider shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                        />
                      </form>

                      {/* Collapsible Automated Bidding (Proxy Ceiling & AutoBid AI) */}
                      <div className="border-t border-white/[0.08] pt-3.5">
                        <button
                          type="button"
                          onClick={() => setAutomatedOpen((v) => !v)}
                          className="flex w-full cursor-pointer items-center justify-between text-xs text-white/65 transition hover:text-white"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <Bot className="h-3.5 w-3.5 text-white/85" aria-hidden="true" />
                            Auto-Proxy &amp; AutoBid AI
                            {myAutoBid?.is_active || myProxyMax ? (
                              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/85">
                                Active
                              </span>
                            ) : null}
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${
                              automatedOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {automatedOpen ? (
                          <div className="mt-3 space-y-3">
                            {/* Quick Proxy Ceiling */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                              <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-white/80">
                                  Quick Proxy Ceiling (with bid)
                                </span>
                                <input
                                  type="checkbox"
                                  checked={enableProxy}
                                  onChange={(e) => setEnableProxy(e.target.checked)}
                                  className="h-4 w-4 accent-white"
                                />
                              </label>

                              {enableProxy ? (
                                <input
                                  type="number"
                                  min={Number(bidAmount) || minNextBid}
                                  step="1"
                                  value={proxyMaxInput}
                                  onChange={(e) => setProxyMaxInput(e.target.value)}
                                  placeholder="Secret max bid ceiling (₹)"
                                  className="mt-2.5 h-9 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                                />
                              ) : myProxyMax ? (
                                <p className="mt-1.5 text-[11px] text-white/55">
                                  Active hidden proxy ceiling: {formatINR(myProxyMax)}
                                </p>
                              ) : null}
                            </div>

                            {/* AUTOBID AI */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-white/85">
                                  AutoBid AI Agent
                                </span>
                                {myAutoBid ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-white/85">
                                      {myAutoBid.is_active ? 'Active' : 'Paused'} ·{' '}
                                      {formatINR(myAutoBid.max_amount)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleToggleAutoBidPause}
                                      disabled={autoBidLoading}
                                      className="cursor-pointer rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-white hover:border-white/35"
                                    >
                                      {myAutoBid.is_active ? 'Pause' : 'Resume'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setAutoBidOpen((o) => !o)}
                                    className="cursor-pointer rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white hover:border-white/35"
                                  >
                                    {autoBidOpen ? 'Close' : 'Configure'}
                                  </button>
                                )}
                              </div>

                              {autoBidOpen ? (
                                <form
                                  onSubmit={handleActivateAutoBid}
                                  className="mt-3 space-y-2.5 border-t border-white/10 pt-3"
                                >
                                  <input
                                    type="number"
                                    min={minNextBid}
                                    value={autoBidMax}
                                    onChange={(e) => setAutoBidMax(e.target.value)}
                                    placeholder={`Max budget (min ${formatINR(minNextBid)})`}
                                    required
                                    className="h-9 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-xs text-white"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={autoBidStrategy}
                                      onChange={(e) =>
                                        setAutoBidStrategy(e.target.value as typeof autoBidStrategy)
                                      }
                                      className="h-9 rounded-lg border border-white/15 bg-[#0d1016] px-2.5 text-[11px] text-white"
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
                                      className="h-9 rounded-lg border border-white/15 bg-[#0d1016] px-2.5 text-[11px] text-white"
                                    >
                                      <option value="max_budget">Stop at Max Budget</option>
                                      <option value="max_5_bids">Stop after 5 Bids</option>
                                      <option value="outbid_twice">Stop if Outbid 2x</option>
                                    </select>
                                  </div>
                                  <label className="flex cursor-pointer items-start gap-2 text-[11px] text-white/70">
                                    <input
                                      type="checkbox"
                                      checked={autoBidConfirmed}
                                      onChange={(e) => setAutoBidConfirmed(e.target.checked)}
                                      className="mt-0.5 accent-white"
                                    />
                                    <span>
                                      Authorize server-side AutoBid up to my exact maximum limit.
                                    </span>
                                  </label>
                                  <button
                                    type="submit"
                                    disabled={autoBidLoading}
                                    className="smoky-cta-btn h-9 w-full cursor-pointer rounded-lg text-xs font-semibold text-white"
                                  >
                                    {autoBidLoading ? 'Activating...' : 'Activate AutoBid AI'}
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    /* Ended / Paused Final Summary */
                    <div className="space-y-4 border-t border-white/10 pt-5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white/80">Settlement Status</span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            !auction.highest_bidder_id
                              ? 'border-white/15 bg-white/10 text-white/70'
                              : auction.reserve_price !== null &&
                                  auction.current_price < auction.reserve_price
                                ? 'border-white/20 bg-white/[0.05] text-white/80'
                                : 'border-white/25 bg-white/[0.06] text-white/85'
                          }`}
                        >
                          {!auction.highest_bidder_id
                            ? 'Unsold'
                            : auction.reserve_price !== null &&
                                auction.current_price < auction.reserve_price
                              ? 'Reserve Unmet'
                              : 'Sold'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                        <div>
                          <span className="text-white/45">Winning Bidder</span>
                          <p className="mt-0.5 font-medium text-white">
                            {auction.highest_bidder_id
                              ? isLeading
                                ? `You (${maskBidderName(user.displayName)})`
                                : maskBidderName(auction.highest_bidder_name)
                              : 'None'}
                          </p>
                        </div>
                        <div>
                          <span className="text-white/45">FairClose Extensions</span>
                          <p className="mt-0.5 font-medium text-white">
                            {auction.extensions_count} applied
                          </p>
                        </div>
                      </div>

                      {auction.reserve_price !== null ? (
                        <div className="text-[11px] text-white/65">
                          Reserve:{' '}
                          {auction.current_price >= auction.reserve_price ? (
                            <span className="font-medium text-white/85">Met</span>
                          ) : (
                            <span className="font-medium text-white/80">
                              Not Met ({formatINR(auction.current_price)} /{' '}
                              {formatINR(auction.reserve_price)})
                            </span>
                          )}
                        </div>
                      ) : null}

                      {isLeading &&
                      (!auction.reserve_price || auction.current_price >= auction.reserve_price) ? (
                        <div className="rounded-xl border border-white/25 bg-white/[0.06] p-4 text-center">
                          <p className="text-sm font-semibold text-white/85">
                            Congratulations, you won this auction.
                          </p>
                          <p className="mt-1 text-xs text-white/65">
                            Complete escrow checkout to finalize your order.
                          </p>
                          <button
                            type="button"
                            onClick={handleFinalizeOrder}
                            disabled={actionLoading}
                            className="smoky-cta-btn mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-xs font-semibold text-white"
                          >
                            <CheckCircle2 className="h-4 w-4 text-white/85" />
                            {actionLoading ? 'Preparing Checkout...' : 'Proceed to Winner Checkout'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                ) : (
                  /* Seller / Admin View Mode */
                  <div className="space-y-3 border-t border-white/10 pt-5 text-xs text-white/75">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <Store className="h-4 w-4 text-white/70" aria-hidden="true" />
                      <span>{isOwnListing ? 'Listing Management' : 'Read-Only View'}</span>
                    </div>
                    <p className="text-white/60">
                      {isOwnListing
                        ? phase === 'ended' || auction.status === 'ended'
                          ? `Auction Ended · ${
                              auction.highest_bidder_id
                                ? `Sold at ${formatINR(auction.current_price)} to ${maskBidderName(auction.highest_bidder_name)}`
                                : 'Unsold (No bids)'
                            }`
                          : `Views: ${auction.views_count ?? 0}${
                              auction.reserve_price !== null
                                ? ` · Hidden Reserve: ${formatINR(auction.reserve_price)}`
                                : ''
                            }`
                        : 'Sellers and admins view active listings in read-only mode.'}
                    </p>
                    {isOwnListing && phase === 'live' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleSellerAction(auction.paused ? 'resume' : 'pause')
                          }
                          disabled={actionLoading}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3.5 text-xs font-medium text-white transition hover:border-white/35"
                        >
                          {auction.paused ? (
                            <>
                              <Play className="h-3.5 w-3.5" /> Resume
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5" /> Pause
                            </>
                          )}
                        </button>
                        {(auction.bid_count ?? 0) === 0 ? (
                          <button
                            type="button"
                            onClick={() => handleSellerAction('cancel')}
                            disabled={actionLoading}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-950/40 px-3.5 text-xs font-medium text-rose-200 transition hover:border-rose-400/50"
                          >
                            Cancel Listing
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* Clean Full-Width Bidding History Table */}
          <section
            id="bidding-history"
            className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Gavel className="h-4 w-4 text-white/70" aria-hidden="true" />
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Bidding History
                </h2>
                <span className="h-1.5 w-1.5 rounded-full bg-white" title="Real-time updates active" />
              </div>
              <span className="text-xs text-white/50">
                {totalBidsCount} {totalBidsCount === 1 ? 'bid' : 'bids'} · {uniqueBiddersCount}{' '}
                {uniqueBiddersCount === 1 ? 'participant' : 'participants'}
              </span>
            </div>

            {bids.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[11px] font-medium uppercase tracking-wider text-white/45">
                      <th className="pb-3 pr-4">Bidder</th>
                      <th className="pb-3 pr-4">Method</th>
                      <th className="pb-3 pr-4">Time</th>
                      <th className="pb-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {bids.map((bid, idx) => {
                      const isHighest = idx === 0;
                      return (
                        <tr
                          key={bid.id}
                          className={
                            isHighest
                              ? 'bg-white/[0.06] text-white'
                              : 'text-white/75 hover:bg-white/[0.02]'
                          }
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{bid.bidder_name}</span>
                              {isHighest ? (
                                <span className="rounded-full border border-white/25 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/85">
                                  Highest Bid
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-white/55">
                            {bid.is_auto_proxy
                              ? bid.bid_source === 'autobid'
                                ? 'AutoBid AI'
                                : 'Auto-Proxy'
                              : 'Direct'}
                          </td>
                          <td className="py-3 pr-4 tabular-nums text-white/55">
                            {mountedNowMs !== null
                              ? new Date(bid.created_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })
                              : `${new Date(bid.created_at).toISOString().slice(11, 19)} UTC`}
                          </td>
                          <td className="py-3 text-right font-semibold tabular-nums text-white">
                            {formatINR(bid.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-white/45">
                No bids placed yet. Be the first to set the opening bid.
              </p>
            )}

            {extensions.length > 0 ? (
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-white/85">
                  <History className="h-3.5 w-3.5" />
                  FairClose Anti-Snipe Extensions
                </p>
                <ul className="mt-2 space-y-1 text-[11px] text-white/60">
                  {extensions.map((ext) => (
                    <li key={ext.id} className="flex justify-between">
                      <span>+{ext.extension_seconds}s closing extension triggered</span>
                      <span className="tabular-nums">
                        {new Date(ext.new_ends_at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </main>
      </div>

      {/* Condition Proof Lightbox */}
      {lightboxIndex !== null &&
      auction.condition_proof_urls &&
      auction.condition_proof_urls[lightboxIndex] ? (
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
            className="absolute right-5 top-5 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/30"
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
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/30"
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
                setLightboxIndex((i) =>
                  i !== null && i < auction.condition_proof_urls!.length - 1 ? i + 1 : i
                );
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/30"
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
              Condition Proof Photo {lightboxIndex + 1} of {auction.condition_proof_urls.length}{' '}
              &bull; {auction.condition}
            </div>
          </div>
        </div>
      ) : null}

      {/* Winning Receipt Modal */}
      <WinningReceiptModal
        orderId={receiptOrderId ?? ''}
        isOpen={receiptOpen && !!receiptOrderId}
        onClose={() => setReceiptOpen(false)}
        onProceedToPayment={handleReceiptPayment}
      />
    </>
  );
}
