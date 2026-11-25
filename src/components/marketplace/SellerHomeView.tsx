'use client';

import {
  BadgeCheck,
  BarChart3,
  Eye,
  Flame,
  PackagePlus,
  ShieldAlert,
  Sparkles,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import { CategoryGrid } from '@/components/marketplace/CategoryGrid';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { UnifiedSearchBar } from '@/components/marketplace/UnifiedSearchBar';
import { ShinyButton } from '@/components/ui/shiny-button';
import {
  type AuctionItem,
  formatINR,
  getAuctionPhase,
  type MarketplaceUser,
} from '@/lib/marketplace/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface SellerHomeViewProps {
  user: MarketplaceUser;
  initialAuctions: AuctionItem[];
  initialSavedIds: string[];
}

export function SellerHomeView({
  user,
  initialAuctions,
  initialSavedIds,
}: SellerHomeViewProps) {
  const router = useRouter();
  const [auctions, setAuctions] = useState<AuctionItem[]>(initialAuctions);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
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
      .channel('seller-home-auctions')
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

  const {
    myListings,
    activeCount,
    scheduledCount,
    completedCount,
    totalBidsOnMine,
    totalViews,
    projectedRevenue,
    chartData,
    featured,
    trending,
    categoryCounts,
  } = useMemo(() => {
    const mine = auctions.filter((a) => a.seller_id === user.id);
    const now = mountedNowMs ?? Date.now();
    let active = 0;
    let scheduled = 0;
    let completed = 0;
    let bidsSum = 0;
    let viewsSum = 0;
    let revSum = 0;

    for (const a of mine) {
      const ph = getAuctionPhase(a, now);
      if (ph === 'live') active++;
      else if (ph === 'upcoming') scheduled++;
      else completed++;
      bidsSum += a.bid_count ?? 0;
      viewsSum += a.views_count ?? 0;
      if (a.highest_bidder_id) revSum += a.current_price;
    }

    const chart = mine.slice(0, 8).map((a) => ({
      name: a.title.length > 14 ? `${a.title.slice(0, 14)}…` : a.title,
      price: a.current_price,
      bids: a.bid_count ?? 0,
    }));

    const live =
      mountedNowMs === null
        ? auctions.filter((a) => a.status === 'active')
        : auctions.filter((a) => getAuctionPhase(a, mountedNowMs) === 'live');
    const pool = live.length > 0 ? live : auctions;

    const counts: Record<string, number> = {};
    for (const a of auctions) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }

    return {
      myListings: mine,
      activeCount: active,
      scheduledCount: scheduled,
      completedCount: completed,
      totalBidsOnMine: bidsSum,
      totalViews: viewsSum,
      projectedRevenue: revSum,
      chartData: chart,
      featured: [...pool].sort((a, b) => b.current_price - a.current_price).slice(0, 3),
      trending: [...pool]
        .sort((a, b) => (b.bid_count ?? 0) - (a.bid_count ?? 0))
        .slice(0, 3),
      categoryCounts: counts,
    };
  }, [auctions, user.id, mountedNowMs]);

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        {/* Verification Alert Banner */}
        {user.verificationStatus !== 'verified' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/20 bg-white/[0.04] px-5 py-3 text-xs">
            <span className="flex items-center gap-2 text-white/85">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              Seller Verification Status:{' '}
              <strong className="capitalize">
                {(user.verificationStatus ?? 'unverified').replace('_', ' ')}
              </strong>{' '}
              &bull; TrustScore: {user.trustScore ?? 50}/100
            </span>
            <Link href="/profile" className="font-semibold text-white underline">
              Submit Verification Documents
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-3xl border border-emerald-300/30 bg-emerald-950/30 px-5 py-2.5 text-xs text-emerald-200">
            <BadgeCheck className="h-4 w-4" />
            <span>Verified SnipeShield Seller &bull; TrustScore {user.trustScore ?? 85}/100</span>
          </div>
        )}

        {/* Personalized Seller Welcome Section & Single Unified Search */}
        <section className="smoky-glass-card rounded-2xl border border-white/15 p-6 sm:p-8">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/90">
                <Store className="h-3.5 w-3.5 text-[#e2e4e8]" aria-hidden="true" />
                <span>Seller Studio &bull; Analytics &amp; Listing Control</span>
              </div>

              <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Welcome, {user.displayName}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Launch verified auctions with Asset Passport hashing, reserve pricing, real-time
                bid telemetry, and configurable SnipeShield anti-snipe protection.
              </p>
            </div>

            <div className="sm:w-52">
              <ShinyButton
                label="+ SELL NEW ITEM"
                onClick={() => router.push('/seller/create-listing')}
                fillColor="#0b0c10"
                labelColor="#ffffff"
                accentColor="#a7adb6"
                accentSoftColor="#e2e4e8"
                cornerRadius={12}
                speckleOpacity={0.22}
                className="flex h-11 w-full items-center justify-center !p-0 !text-xs !font-semibold !tracking-wider shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              />
            </div>
          </div>

          {/* Seller Dashboard KPIs (Part 4) */}
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Active</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{activeCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Scheduled</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{scheduledCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Completed</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{completedCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Total Bids</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{totalBidsOnMine}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Total Views</p>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-lg font-semibold tabular-nums text-white">
                <Eye className="h-3.5 w-3.5 text-white/55" />
                {totalViews}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Gross Value</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                {formatINR(projectedRevenue)}
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-6">
            <UnifiedSearchBar
              auctions={auctions}
              savedSet={savedSet}
              onToggleSave={handleToggleSave}
              viewerRole="seller"
              viewerId={user.id}
              placeholder="Search marketplace prices, categories, or active auctions..."
              externalCategory={selectedCategory}
              onExternalCategoryReset={handleCategoryReset}
            />
          </div>
        </section>

        {/* Seller Performance Analytics Chart */}
        {chartData.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <BarChart3 className="h-4 w-4 text-[#e2e4e8]" />
                Listing Performance Analytics
              </h2>
              <Link href="/orders" className="text-xs text-white/65 underline hover:text-white">
                Manage Orders &amp; Shipments
              </Link>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0d1016',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="price" fill="#e2e4e8" radius={[6, 6, 0, 0]} name="Current Price (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {/* Seller's Own Listings */}
        <section aria-labelledby="seller-listings-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
              <h2 id="seller-listings-heading" className="text-lg font-semibold tracking-tight">
                Your Auction Listings
              </h2>
            </div>

            <Link
              href="/seller/create-listing"
              prefetch
              className="rounded-full border border-white/20 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            >
              + New Listing
            </Link>
          </div>

          {myListings.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {myListings.map((auction) => (
                <AuctionCard
                  key={auction.id}
                  auction={auction}
                  isSaved={savedSet.has(auction.id)}
                  onToggleSave={handleToggleSave}
                  viewerRole="seller"
                  viewerId={user.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/80 px-6 py-10 text-center">
              <PackagePlus className="mx-auto h-7 w-7 text-white/45" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-white">
                You haven&apos;t published any auctions yet
              </p>
              <Link
                href="/seller/create-listing"
                prefetch
                className="smoky-cta-btn mt-5 inline-flex h-10 items-center justify-center rounded-full px-6 text-xs font-medium text-white"
              >
                + Create First Auction
              </Link>
            </div>
          )}
        </section>

        {/* Featured Marketplace Auctions */}
        <section aria-labelledby="seller-featured-heading" className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
            <h2 id="seller-featured-heading" className="text-lg font-semibold tracking-tight">
              Featured Marketplace Auctions
            </h2>
          </div>

          {featured.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((auction) => (
                <AuctionCard
                  key={`feat-${auction.id}`}
                  auction={auction}
                  isSaved={savedSet.has(auction.id)}
                  onToggleSave={handleToggleSave}
                  viewerRole="seller"
                  viewerId={user.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/80 px-6 py-8 text-center text-xs text-white/60">
              No marketplace auctions listed yet.
            </div>
          )}
        </section>

        {/* Trending */}
        {trending.length > 0 ? (
          <section aria-labelledby="seller-trending-heading" className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
              <h2 id="seller-trending-heading" className="text-lg font-semibold tracking-tight">
                Trending Across Platform
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {trending.map((auction) => (
                <AuctionCard
                  key={`trend-${auction.id}`}
                  auction={auction}
                  isSaved={savedSet.has(auction.id)}
                  onToggleSave={handleToggleSave}
                  viewerRole="seller"
                  viewerId={user.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Auction Categories */}
        <section aria-labelledby="seller-categories-heading" className="space-y-4 pb-6">
          <h2 id="seller-categories-heading" className="text-lg font-semibold tracking-tight">
            Auction Categories
          </h2>
          <CategoryGrid
            countsByCategory={categoryCounts}
            onSelectCategory={handleCategoryPick}
          />
        </section>
      </main>
    </div>
  );
}
