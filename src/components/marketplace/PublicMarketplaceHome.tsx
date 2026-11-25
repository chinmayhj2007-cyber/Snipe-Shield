'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Flame,
  Gavel,
  Lock,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import { CategoryGrid } from '@/components/marketplace/CategoryGrid';
import { CountdownTimer } from '@/components/marketplace/CountdownTimer';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { UnifiedSearchBar } from '@/components/marketplace/UnifiedSearchBar';
import { ShinyButton } from '@/components/ui/shiny-button';
import {
  type AuctionItem,
  formatINR,
  getAuctionPhase,
  getPrimaryImage,
  type MarketplaceUser,
} from '@/lib/marketplace/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface PublicMarketplaceHomeProps {
  user: MarketplaceUser | null;
  initialAuctions: AuctionItem[];
  initialSavedIds: string[];
}

export function PublicMarketplaceHome({
  user,
  initialAuctions,
  initialSavedIds,
}: PublicMarketplaceHomeProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [auctions, setAuctions] = useState<AuctionItem[]>(initialAuctions);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [failedHeroUrls, setFailedHeroUrls] = useState<Set<string>>(() => new Set());
  const auctionsRef = useRef<AuctionItem[]>(initialAuctions);

  useEffect(() => setAuctions(initialAuctions), [initialAuctions]);
  useEffect(() => setSavedSet(new Set(initialSavedIds)), [initialSavedIds]);
  useEffect(() => {
    auctionsRef.current = auctions;
  }, [auctions]);

  useEffect(() => {
    setMountedNowMs(Date.now());
    const interval = window.setInterval(() => setMountedNowMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  // Real-time Supabase auction updates
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('public-home-auctions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auctions' }, () => {
        router.refresh();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auctions' },
        (payload) => {
          const updated = payload.new as Partial<AuctionItem> & { id?: string };
          if (!updated.id) return;
          setAuctions((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    current_price: Number(updated.current_price ?? item.current_price),
                    highest_bidder_id:
                      updated.highest_bidder_id !== undefined
                        ? updated.highest_bidder_id
                        : item.highest_bidder_id,
                    ends_at: updated.ends_at ?? item.ends_at,
                    status: (updated.status as AuctionItem['status']) ?? item.status,
                    extensions_count: Number(updated.extensions_count ?? item.extensions_count),
                    bid_count: Number(updated.bid_count ?? item.bid_count ?? 0),
                  }
                : item
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const handleToggleSave = useCallback(
    (auctionId: string, nextSaved: boolean) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setSavedSet((prev) => {
        const next = new Set(prev);
        if (nextSaved) next.add(auctionId);
        else next.delete(auctionId);
        return next;
      });
    },
    [user, router]
  );

  const handleCategoryPick = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    const searchEl = document.getElementById('unified-auction-search');
    searchEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleCategoryReset = useCallback(() => setSelectedCategory(undefined), []);

  function scrollToElement(id: string) {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const {
    liveAuctions,
    endingSoon,
    featured,
    recent,
    heroLead,
    heroSecondary,
    categoryCounts,
    totalBidsCount,
  } = useMemo(() => {
    const live =
      mountedNowMs === null
        ? auctions.filter((a) => a.status === 'active')
        : auctions.filter((a) => getAuctionPhase(a, mountedNowMs) === 'live');
    const pool = live.length > 0 ? live : auctions;

    const counts: Record<string, number> = {};
    let bidsSum = 0;
    for (const a of auctions) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
      bidsSum += a.bid_count ?? 0;
    }

    const byPopularity = [...pool].sort(
      (a, b) => (b.bid_count ?? 0) - (a.bid_count ?? 0) || b.current_price - a.current_price
    );

    const byEndingSoon = [...pool].sort(
      (a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()
    );

    const byPrice = [...pool].sort((a, b) => b.current_price - a.current_price);

    const byNewest = [...auctions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      liveAuctions: live,
      endingSoon: byEndingSoon.slice(0, 3),
      featured: byPrice.slice(0, 3),
      recent: byNewest.slice(0, 6),
      heroLead: byPopularity[0] ?? auctions[0] ?? null,
      heroSecondary: byPopularity.slice(1, 3),
      categoryCounts: counts,
      totalBidsCount: bidsSum,
    };
  }, [auctions, mountedNowMs]);

  const sellHref = user
    ? user.role === 'seller'
      ? '/seller/create-listing'
      : '/profile'
    : '/signup';

  const heroLeadImage = heroLead ? getPrimaryImage(heroLead) : null;

  const revealProps = shouldReduceMotion
    ? {}
    : {
        initial: { y: 12 },
        whileInView: { y: 0 },
        viewport: { once: true, amount: 0.05 },
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      {/* 1. NAVIGATION BAR */}
      {user ? (
        <MarketplaceNavbar user={user} />
      ) : (
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090b0f]/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 py-1 transition hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/snipe-shield-logo.webp"
                alt="Snipe Shield"
                width={32}
                height={32}
                decoding="async"
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="text-[15px] font-medium italic tracking-tight text-white">
                Snipe Shield
              </span>
            </Link>

            <nav aria-label="Public navigation" className="hidden items-center gap-6 md:flex">
              <button
                type="button"
                onClick={() => scrollToElement('live-auctions')}
                className="cursor-pointer text-xs font-medium text-white/70 transition hover:text-white"
              >
                Live Auctions
              </button>
              <button
                type="button"
                onClick={() => scrollToElement('featured-auctions')}
                className="cursor-pointer text-xs font-medium text-white/70 transition hover:text-white"
              >
                Featured
              </button>
              <button
                type="button"
                onClick={() => scrollToElement('categories')}
                className="cursor-pointer text-xs font-medium text-white/70 transition hover:text-white"
              >
                Categories
              </button>
              <button
                type="button"
                onClick={() => scrollToElement('how-it-works')}
                className="cursor-pointer text-xs font-medium text-white/70 transition hover:text-white"
              >
                How It Works
              </button>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  scrollToElement('unified-auction-search');
                  window.setTimeout(() => {
                    document.getElementById('unified-auction-search')?.focus();
                  }, 350);
                }}
                aria-label="Search auctions"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/75 transition hover:border-white/30 hover:text-white"
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              <Link
                href="/login"
                className="hidden h-9 items-center rounded-full border border-white/15 bg-white/[0.03] px-4 text-xs font-medium text-white/85 transition hover:border-white/30 hover:text-white sm:inline-flex"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="smoky-cta-btn hidden h-9 items-center rounded-full px-4 text-xs font-semibold text-white sm:inline-flex"
              >
                Get Started
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/80 md:hidden"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="border-t border-white/10 bg-[#0b0d12]/95 px-4 py-4 backdrop-blur-2xl md:hidden">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => scrollToElement('live-auctions')}
                  className="rounded-xl px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/[0.05]"
                >
                  Live Auctions
                </button>
                <button
                  type="button"
                  onClick={() => scrollToElement('featured-auctions')}
                  className="rounded-xl px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/[0.05]"
                >
                  Featured
                </button>
                <button
                  type="button"
                  onClick={() => scrollToElement('categories')}
                  className="rounded-xl px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/[0.05]"
                >
                  Categories
                </button>
                <button
                  type="button"
                  onClick={() => scrollToElement('how-it-works')}
                  className="rounded-xl px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/[0.05]"
                >
                  How It Works
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <Link
                    href="/login"
                    className="flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] text-xs font-medium text-white"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/signup"
                    className="smoky-cta-btn flex h-10 items-center justify-center rounded-xl text-xs font-semibold text-white"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </header>
      )}

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 1. LUXURY HERO SECTION */}
        <section className="relative py-12 sm:py-16 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
            {/* Hero Copy & CTAs */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-white/85">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>SHIELDLOCK &amp; FAIRCLOSE ANTI-SNIPING</span>
              </div>

              <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.5rem]">
                Discover. Bid.{' '}
                <span className="bg-gradient-to-r from-white via-[#d5d7db] to-white/70 bg-clip-text text-transparent">
                  Own Something Extraordinary.
                </span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                Explore exclusive finds, compete in live auctions and discover incredible products at
                your own price.
              </p>

              {/* Primary & Secondary CTAs */}
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                <ShinyButton
                  type="button"
                  label="Explore Live Auctions"
                  onClick={() => scrollToElement('live-auctions')}
                  fillColor="#0b0c10"
                  labelColor="#ffffff"
                  accentColor="#a7adb6"
                  accentSoftColor="#e2e4e8"
                  cornerRadius={12}
                  speckleOpacity={0.25}
                  className="flex h-12 w-full items-center justify-center px-7 !text-xs !font-semibold !tracking-wider shadow-[0_12px_32px_rgba(0,0,0,0.5)] sm:w-auto"
                />

                <Link
                  href={sellHref}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 text-xs font-semibold tracking-wide text-white/90 transition hover:border-white/35 hover:bg-white/[0.07] hover:text-white sm:w-auto"
                >
                  <Store className="h-4 w-4 text-white/70" />
                  <span>Start Selling</span>
                </Link>
              </div>

              {/* Live Platform Telemetry */}
              <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-6 text-xs text-white/55">
                <div>
                  <span className="block text-lg font-semibold tabular-nums text-white">
                    {liveAuctions.length}
                  </span>
                  <span>Live Auctions</span>
                </div>
                <div className="h-7 w-px bg-white/10" />
                <div>
                  <span className="block text-lg font-semibold tabular-nums text-white">
                    {totalBidsCount}
                  </span>
                  <span>Verified Bids</span>
                </div>
                <div className="h-7 w-px bg-white/10" />
                <div>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    Escrow Backed
                  </span>
                  <span>SHA-256 Asset Passports</span>
                </div>
              </div>
            </motion.div>

            {/* Hero Right Visual Composition: Real Featured Live Auction + Floating Cards */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Subtle atmospheric halo behind the showcase */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 rounded-3xl bg-radial from-white/[0.08] via-transparent to-transparent blur-2xl"
              />

              {heroLead ? (
                <div className="relative space-y-4">
                  {/* Primary Featured Live Auction Card */}
                  <Link
                    href={`/auctions/${heroLead.id}`}
                    className="group relative block overflow-hidden rounded-2xl border border-white/20 bg-[#0d0f14]/95 shadow-[0_24px_60px_rgba(0,0,0,0.65)] transition hover:border-white/35"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-white/10 bg-[#08090c]">
                      {heroLeadImage && !failedHeroUrls.has(heroLeadImage) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={heroLeadImage}
                          alt={heroLead.title}
                          onError={() =>
                            setFailedHeroUrls((prev) => new Set(prev).add(heroLeadImage))
                          }
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#161922] to-[#08090c]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/snipe-shield-logo.webp"
                            alt="Snipe Shield"
                            className="h-20 w-20 object-contain opacity-65"
                          />
                        </div>
                      )}

                      <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-950/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 backdrop-blur-md">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          Featured Live Lot
                        </span>
                        <span className="rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-md">
                          {heroLead.condition}
                        </span>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-white/50">
                        <span className="uppercase tracking-wider">{heroLead.category}</span>
                        <span className="tabular-nums">{heroLead.bid_count ?? 0} bids</span>
                      </div>

                      <h2 className="mt-1.5 line-clamp-1 text-lg font-semibold tracking-tight text-white">
                        {heroLead.title}
                      </h2>

                      <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/10 pt-3.5">
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-white/45">
                            Current Highest Bid
                          </span>
                          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-white">
                            {formatINR(heroLead.current_price)}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-white/45">
                            Closes In
                          </span>
                          <div className="mt-0.5">
                            <CountdownTimer
                              startsAt={heroLead.starts_at}
                              endsAt={heroLead.ends_at}
                              status={heroLead.status}
                              auctionId={heroLead.id}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Secondary Floating Mini Cards (Real DB Auctions) */}
                  {heroSecondary.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {heroSecondary.map((item, idx) => {
                        const thumb = getPrimaryImage(item);
                        return (
                          <motion.div
                            key={item.id}
                            animate={
                              shouldReduceMotion
                                ? undefined
                                : { y: idx === 0 ? [0, -4, 0] : [0, 4, 0] }
                            }
                            transition={{
                              duration: 5 + idx,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            <Link
                              href={`/auctions/${item.id}`}
                              className="flex items-center gap-3 rounded-xl border border-white/15 bg-[#0e1016]/90 p-3 backdrop-blur-xl transition hover:border-white/30"
                            >
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#08090c]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={
                                    thumb && !failedHeroUrls.has(thumb)
                                      ? thumb
                                      : '/snipe-shield-logo.webp'
                                  }
                                  alt={item.title}
                                  onError={() => {
                                    if (thumb) {
                                      setFailedHeroUrls((prev) => new Set(prev).add(thumb));
                                    }
                                  }}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-white">
                                  {item.title}
                                </p>
                                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                  <span className="font-semibold tabular-nums text-white/90">
                                    {formatINR(item.current_price)}
                                  </span>
                                  <span className="text-emerald-300">
                                    {item.bid_count ?? 0} bids
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/15 bg-[#0d0f14]/90 p-10 text-center">
                  <Gavel className="mx-auto h-10 w-10 text-white/35" />
                  <p className="mt-4 text-sm font-medium text-white">
                    New curated drops launching soon
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Sign up as a seller or bidder to join the next live auction room.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </section>

        <div className="space-y-16 pb-20">
          {/* 2. LIVE AUCTIONS / ENDING SOON */}
          <motion.section id="live-auctions" {...revealProps} className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Live &amp; Ending Soon</span>
                </div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                  Active Bidding Rooms
                </h2>
              </div>
              <Link
                href="/search"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 transition hover:text-white"
              >
                <span>View all auctions</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {endingSoon.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {endingSoon.map((auction) => (
                  <AuctionCard
                    key={`live-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole={user?.role ?? 'bidder'}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/80 px-6 py-10 text-center text-xs text-white/55">
                No active auctions right now. Check back shortly.
              </div>
            )}
          </motion.section>

          {/* 3. FEATURED AUCTION PRODUCTS + UNIFIED SEARCH */}
          <motion.section id="featured-auctions" {...revealProps} className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Curated Highlights</span>
                </div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                  Featured Auction Lots
                </h2>
              </div>
            </div>

            <UnifiedSearchBar
              auctions={auctions}
              savedSet={savedSet}
              onToggleSave={handleToggleSave}
              viewerRole={user?.role ?? 'bidder'}
              viewerId={user?.id ?? ''}
              externalCategory={selectedCategory}
              onExternalCategoryReset={handleCategoryReset}
            />

            {featured.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((auction) => (
                  <AuctionCard
                    key={`feat-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole={user?.role ?? 'bidder'}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            ) : null}
          </motion.section>

          {/* 4. BROWSE BY CATEGORIES */}
          <motion.section id="categories" {...revealProps} className="space-y-5">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                Curated Departments
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                Browse by Category
              </h2>
            </div>

            <CategoryGrid
              countsByCategory={categoryCounts}
              onSelectCategory={handleCategoryPick}
            />
          </motion.section>

          {/* 5. RECENTLY LISTED PRODUCTS */}
          <motion.section id="recently-listed" {...revealProps} className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Fresh Arrivals</span>
                </div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                  Recently Listed Items
                </h2>
              </div>
            </div>

            {recent.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((auction) => (
                  <AuctionCard
                    key={`recent-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole={user?.role ?? 'bidder'}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            ) : null}
          </motion.section>

          {/* 6. HOW IT WORKS */}
          <motion.section id="how-it-works" {...revealProps} className="space-y-6">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                The SnipeShield Standard
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                How Live Bidding Works
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/85 p-6">
                <span className="font-mono text-xs font-semibold text-white/40">01</span>
                <h3 className="mt-3 text-base font-semibold text-white">
                  Inspect Condition &amp; Provenance
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Every listing discloses verified condition grades, defect proof photography, and
                  tamper-evident SHA-256 Asset Passport records.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/85 p-6">
                <span className="font-mono text-xs font-semibold text-white/40">02</span>
                <h3 className="mt-3 text-base font-semibold text-white">
                  Compete with FairClose
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Place real-time atomic bids or activate deterministic AutoBid AI. Last-second bids
                  automatically extend closing by +30s to eliminate sniper bots.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/85 p-6">
                <span className="font-mono text-xs font-semibold text-white/40">03</span>
                <h3 className="mt-3 text-base font-semibold text-white">
                  Win &amp; Escrow Checkout
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Receive an instant server-verified winning invoice with transparent 2% escrow fee
                  and tracked courier delivery protection.
                </p>
              </div>
            </div>
          </motion.section>

          {/* 7. BECOME A SELLER CTA */}
          <motion.section
            {...revealProps}
            className="smoky-glass-card rounded-2xl border border-white/15 p-8 sm:p-12"
          >
            <div className="relative z-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                  <Flame className="h-3.5 w-3.5 text-amber-300" />
                  <span>Sell on Snipe Shield</span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Have something extraordinary to auction?
                </h2>
                <p className="text-sm leading-relaxed text-white/65">
                  Reach verified collectors and bidders with real-time price discovery, reserve
                  price protection, and automated escrow settlement.
                </p>
              </div>

              <Link
                href={sellHref}
                className="smoky-cta-btn inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-7 text-xs font-semibold tracking-wider text-white"
              >
                <span>Start Selling</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.section>
        </div>
      </main>

      {/* 8. FOOTER */}
      <footer className="border-t border-white/10 bg-[#07080b]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-10 text-xs text-white/55 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/snipe-shield-logo.webp"
              alt="Snipe Shield"
              width={24}
              height={24}
              className="h-6 w-6 rounded-md object-contain opacity-85"
            />
            <span className="font-medium italic text-white/90">Snipe Shield</span>
            <span className="text-white/30">&bull;</span>
            <span>Real-Time Protected Auctions</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <Link href="/search" className="transition hover:text-white">
              Browse Auctions
            </Link>
            <Link href={sellHref} className="transition hover:text-white">
              Sell an Item
            </Link>
            <Link href="/login" className="transition hover:text-white">
              Sign In
            </Link>
            <Link href="/signup" className="transition hover:text-white">
              Create Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
