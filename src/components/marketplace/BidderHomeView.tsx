'use client';

import {
  Bell,
  Clock,
  Eye,
  Flame,
  Gavel,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import { CategoryGrid } from '@/components/marketplace/CategoryGrid';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { UnifiedSearchBar } from '@/components/marketplace/UnifiedSearchBar';
import { recommendAuctions } from '@/lib/marketplace/intelligence';
import {
  type AuctionItem,
  getAuctionPhase,
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
  } = useMemo(() => {
    const live =
      mountedNowMs === null
        ? auctions.filter((a) => a.status === 'active')
        : auctions.filter((a) => getAuctionPhase(a, mountedNowMs) === 'live');
    const pool = live.length > 0 ? live : auctions;

    const counts: Record<string, number> = {};
    for (const a of auctions) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
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

    return {
      liveAuctions: live,
      featured: [...pool].sort((a, b) => b.current_price - a.current_price).slice(0, 3),
      trending: [...pool]
        .sort((a, b) => (b.bid_count ?? 0) - (a.bid_count ?? 0) || b.current_price - a.current_price)
        .slice(0, 3),
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
    };
  }, [
    auctions,
    mountedNowMs,
    recentlyViewedIds,
    preferredCategories,
    savedSet,
    personalizationEnabled,
  ]);

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        {savedEndingSoonCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-300/35 bg-amber-950/35 px-5 py-3 text-xs text-amber-100">
            <span className="flex items-center gap-2 font-medium">
              <Bell className="h-4 w-4 text-amber-300" />
              {savedEndingSoonCount} item{savedEndingSoonCount === 1 ? '' : 's'} on your Saved
              Watchlist ending within 2 hours!
            </span>
            <Link href="/bidder/saved" className="font-semibold underline">
              Review Watchlist
            </Link>
          </div>
        ) : null}

        {/* Welcome Hero & Single Unified Instant Search */}
        <section className="smoky-glass-card rounded-2xl border border-white/15 p-6 sm:p-8">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/80">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>SnipeShield Anti-Sniping &amp; AutoBid AI Active</span>
              </div>

              <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Welcome back, {user.displayName}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Bid across verified drops with SHIELDLOCK transaction protection, transparent
                TrueCost pricing, and deterministic AutoBid AI.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                  Live Drops
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {liveAuctions.length}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                  Saved
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{savedSet.size}</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-6">
            <UnifiedSearchBar
              auctions={auctions}
              savedSet={savedSet}
              onToggleSave={handleToggleSave}
              viewerRole="bidder"
              viewerId={user.id}
              externalCategory={selectedCategory}
              onExternalCategoryReset={handleCategoryReset}
            />
          </div>
        </section>

        {/* Featured Auctions */}
        <section aria-labelledby="bidder-featured-heading" className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
            <h2 id="bidder-featured-heading" className="text-lg font-semibold tracking-tight">
              Featured Auctions
            </h2>
          </div>

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

        {/* Ending Soon */}
        {endingSoon.length > 0 ? (
          <section aria-labelledby="bidder-ending-heading" className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <h2 id="bidder-ending-heading" className="text-lg font-semibold tracking-tight">
                Ending Soon
              </h2>
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

        {/* Trending Auctions */}
        <section aria-labelledby="bidder-trending-heading" className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
            <h2 id="bidder-trending-heading" className="text-lg font-semibold tracking-tight">
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
          <section aria-labelledby="bidder-recommended-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="bidder-recommended-heading" className="text-lg font-semibold tracking-tight">
                {personalizationEnabled ? 'Personalized Recommendations' : 'Popular Picks'}
              </h2>
              <Link href="/profile" className="text-xs text-white/60 hover:text-white underline">
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
          <section aria-labelledby="bidder-viewed-heading" className="space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
              <h2 id="bidder-viewed-heading" className="text-lg font-semibold tracking-tight">
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

        {/* Categories */}
        <section aria-labelledby="bidder-categories-heading" className="space-y-4">
          <h2 id="bidder-categories-heading" className="text-lg font-semibold tracking-tight">
            Browse Categories
          </h2>
          <CategoryGrid
            countsByCategory={categoryCounts}
            onSelectCategory={handleCategoryPick}
          />
        </section>

        {/* Newly Listed */}
        <section aria-labelledby="bidder-recent-heading" className="space-y-4 pb-6">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-[#e2e4e8]" aria-hidden="true" />
            <h2 id="bidder-recent-heading" className="text-lg font-semibold tracking-tight">
              Newly Listed Items
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
      </main>
    </div>
  );
}
