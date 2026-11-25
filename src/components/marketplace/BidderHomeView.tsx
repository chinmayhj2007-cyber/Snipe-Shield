'use client';

import {
  ArrowUpRight,
  Bell,
  Clock,
  Eye,
  Flame,
  Gavel,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import { CategoryGrid } from '@/components/marketplace/CategoryGrid';
import { CountdownTimer } from '@/components/marketplace/CountdownTimer';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { SiteFooter } from '@/components/marketplace/SiteFooter';
import { UnifiedSearchBar } from '@/components/marketplace/UnifiedSearchBar';
import { ShinyButton } from '@/components/ui/shiny-button';
import { recommendAuctions } from '@/lib/marketplace/intelligence';
import {
  type AuctionItem,
  formatINR,
  getAuctionPhase,
  getPrimaryImage,
  type MarketplaceUser,
} from '@/lib/marketplace/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface BidderHomeViewProps {
  user: MarketplaceUser;
  initialAuctions: AuctionItem[];
  initialSavedIds: string[];
  recentlyViewedIds: string[];
  preferredCategories: string[];
  personalizationEnabled: boolean;
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/80 px-6 py-10 text-center">
      <Gavel className="mx-auto h-7 w-7 text-white/35" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-white/80">{message}</p>
      <p className="mt-1 text-xs text-white/45">
        New auctions appear here automatically as sellers publish them.
      </p>
    </div>
  );
}

export function BidderHomeView({
  user,
  initialAuctions,
  initialSavedIds,
  recentlyViewedIds,
  preferredCategories,
  personalizationEnabled,
}: BidderHomeViewProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [auctions, setAuctions] = useState<AuctionItem[]>(initialAuctions);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('bidder-home-auctions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auctions' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'auctions' }, () => {
        router.refresh();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auctions' },
        (payload) => {
          const updated = payload.new as Partial<AuctionItem> & { id?: string };
          if (!updated.id) return;
          const existing = auctionsRef.current.find((item) => item.id === updated.id);
          const bidderChanged =
            existing !== undefined &&
            updated.highest_bidder_id !== undefined &&
            updated.highest_bidder_id !== existing.highest_bidder_id;

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

          if (!existing || bidderChanged) {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const handleToggleSave = useCallback((auctionId: string, nextSaved: boolean) => {
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (nextSaved) next.add(auctionId);
      else next.delete(auctionId);
      return next;
    });
  }, []);

  const handleCategoryPick = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    const searchEl = document.getElementById('unified-auction-search');
    searchEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleCategoryReset = useCallback(() => setSelectedCategory(undefined), []);

  function scrollToElement(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const {
    liveAuctions,
    featured,
    trending,
    endingSoon,
    recent,
    recommended,
    recentlyViewed,
    savedEndingSoonCount,
    categoryCounts,
    heroLead,
    heroSecondary,
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

    const viewedSet = new Map(recentlyViewedIds.map((id, idx) => [id, idx]));
    const viewedList = auctions
      .filter((a) => viewedSet.has(a.id))
      .sort((a, b) => (viewedSet.get(a.id) ?? 99) - (viewedSet.get(b.id) ?? 99))
      .slice(0, 3);

    const now = mountedNowMs ?? Date.now();
    const savedEndingSoon = auctions.filter((a) => {
      if (!savedSet.has(a.id) || a.status !== 'active') return false;
      const diff = new Date(a.ends_at).getTime() - now;
      return diff > 0 && diff <= 2 * 3600_000;
    }).length;

    const byPopularity = [...pool].sort(
      (a, b) => (b.bid_count ?? 0) - (a.bid_count ?? 0) || b.current_price - a.current_price
    );

    return {
      liveAuctions: live,
      featured: [...pool].sort((a, b) => b.current_price - a.current_price).slice(0, 3),
      trending: byPopularity.slice(0, 3),
      endingSoon: [...pool]
        .sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime())
        .slice(0, 3),
      recent: [...auctions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6),
      recommended: recommendAuctions(
        auctions,
        preferredCategories,
        recentlyViewedIds,
        Array.from(savedSet),
        personalizationEnabled
      ).slice(0, 3),
      recentlyViewed: viewedList,
      savedEndingSoonCount: savedEndingSoon,
      categoryCounts: counts,
      heroLead: byPopularity[0] ?? auctions[0] ?? null,
      heroSecondary: byPopularity.slice(1, 3),
      totalBidsCount: bidsSum,
    };
  }, [
    auctions,
    mountedNowMs,
    recentlyViewedIds,
    preferredCategories,
    savedSet,
    personalizationEnabled,
  ]);

  const heroLeadImage = heroLead ? getPrimaryImage(heroLead) : null;

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {savedEndingSoonCount > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/[0.04] px-5 py-3 text-xs text-white/90">
            <span className="flex items-center gap-2 font-medium">
              <Bell className="h-4 w-4 text-white/75" />
              {savedEndingSoonCount} item{savedEndingSoonCount === 1 ? '' : 's'} on your Saved
              Watchlist ending within 2 hours!
            </span>
            <Link href="/bidder/saved" className="font-semibold text-white underline">
              Review Watchlist
            </Link>
          </div>
        ) : null}

        {/* 1. LUXURY HERO SECTION */}
        <section className="relative py-10 sm:py-14 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-white/85">
                <ShieldCheck className="h-3.5 w-3.5 text-white/80" aria-hidden="true" />
                <span>SHIELDLOCK &amp; FAIRCLOSE ANTI-SNIPING</span>
              </div>

              <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.4rem]">
                Discover. Bid.{' '}
                <span className="bg-gradient-to-r from-white via-[#d5d7db] to-white/70 bg-clip-text text-transparent">
                  Own Something Extraordinary.
                </span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                Explore exclusive finds, compete in live auctions and discover incredible products at
                your own price.
              </p>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
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
              </div>

              <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-5 text-xs text-white/55">
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
                  <span className="block text-lg font-semibold tabular-nums text-white">
                    {savedSet.size}
                  </span>
                  <span>Watchlist Saved</span>
                </div>
              </div>
            </motion.div>

            {/* Hero Right Visual Composition */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 rounded-3xl bg-radial from-white/[0.08] via-transparent to-transparent blur-2xl"
              />

              {heroLead ? (
                <div className="relative space-y-4">
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
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
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
                                  <span className="text-white/70">
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
                <EmptySection message="New curated drops launching soon." />
              )}
            </motion.div>
          </div>
        </section>

        <div className="space-y-14 pb-20">
          {/* 2. LIVE AUCTIONS / ENDING SOON */}
          {endingSoon.length > 0 ? (
            <section id="live-auctions" aria-labelledby="bidder-ending-heading" className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Live &amp; Ending Soon</span>
                  </div>
                  <h2 id="bidder-ending-heading" className="mt-1 text-2xl font-semibold tracking-tight">
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
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {endingSoon.map((auction) => (
                  <AuctionCard
                    key={`end-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* 3. FEATURED AUCTION PRODUCTS + UNIFIED SEARCH */}
          <section id="featured-auctions" aria-labelledby="bidder-featured-heading" className="space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Curated Highlights</span>
              </div>
              <h2 id="bidder-featured-heading" className="mt-1 text-2xl font-semibold tracking-tight">
                Featured Auction Lots
              </h2>
            </div>

            <UnifiedSearchBar
              auctions={auctions}
              savedSet={savedSet}
              onToggleSave={handleToggleSave}
              viewerRole="bidder"
              viewerId={user.id}
              externalCategory={selectedCategory}
              onExternalCategoryReset={handleCategoryReset}
            />

            {featured.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((auction) => (
                  <AuctionCard
                    key={auction.id}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            ) : (
              <EmptySection message="No featured auctions are live right now." />
            )}
          </section>

          {/* Trending Bidding Wars */}
          <section aria-labelledby="bidder-trending-heading" className="space-y-5">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Flame className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
              <h2 id="bidder-trending-heading" className="text-xl font-semibold tracking-tight">
                Trending Bidding Wars
              </h2>
            </div>

            {trending.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {trending.map((auction) => (
                  <AuctionCard
                    key={`trend-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            ) : (
              <EmptySection message="Trending auctions will appear once bidding activity begins." />
            )}
          </section>

          {/* Personalized Recommendations */}
          {recommended.length > 0 ? (
            <section aria-labelledby="bidder-recommended-heading" className="space-y-5">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
                <h2 id="bidder-recommended-heading" className="text-xl font-semibold tracking-tight">
                  {personalizationEnabled ? 'Personalized Recommendations' : 'Popular Picks'}
                </h2>
                <Link href="/profile" className="text-xs text-white/60 underline hover:text-white">
                  Personalization Settings
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.map((auction) => (
                  <AuctionCard
                    key={`rec-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Recently Viewed */}
          {recentlyViewed.length > 0 ? (
            <section aria-labelledby="bidder-viewed-heading" className="space-y-5">
              <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                <Eye className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
                <h2 id="bidder-viewed-heading" className="text-xl font-semibold tracking-tight">
                  Recently Viewed
                </h2>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recentlyViewed.map((auction) => (
                  <AuctionCard
                    key={`viewed-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* 4. BROWSE BY CATEGORIES */}
          <section id="categories" aria-labelledby="bidder-categories-heading" className="space-y-5">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                Curated Departments
              </p>
              <h2 id="bidder-categories-heading" className="mt-1 text-2xl font-semibold tracking-tight">
                Browse by Category
              </h2>
            </div>
            <CategoryGrid
              countsByCategory={categoryCounts}
              onSelectCategory={handleCategoryPick}
            />
          </section>

          {/* 5. RECENTLY LISTED PRODUCTS */}
          <section aria-labelledby="bidder-recent-heading" className="space-y-5">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Timer className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
              <h2 id="bidder-recent-heading" className="text-2xl font-semibold tracking-tight">
                Recently Listed Items
              </h2>
            </div>

            {recent.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((auction) => (
                  <AuctionCard
                    key={`recent-${auction.id}`}
                    auction={auction}
                    isSaved={savedSet.has(auction.id)}
                    onToggleSave={handleToggleSave}
                    viewerRole="bidder"
                    viewerId={user.id}
                  />
                ))}
              </div>
            ) : (
              <EmptySection message="No newly listed items yet." />
            )}
          </section>

          {/* 6. HOW IT WORKS */}
          <section id="how-it-works" className="space-y-6">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
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
          </section>
        </div>
      </main>

      {/* 8. FOOTER */}
      <SiteFooter sellHref="/profile" />
    </div>
  );
}
