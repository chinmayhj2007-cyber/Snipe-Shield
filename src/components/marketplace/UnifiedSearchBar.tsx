'use client';

import { BadgeCheck, Search, SlidersHorizontal, X } from 'lucide-react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import {
  AUCTION_CATEGORIES,
  AUCTION_CONDITIONS,
  type AuctionItem,
  getAuctionPhase,
} from '@/lib/marketplace/types';

interface UnifiedSearchBarProps {
  auctions: AuctionItem[];
  savedSet: Set<string>;
  onToggleSave: (auctionId: string, nextSaved: boolean) => void;
  viewerRole: 'bidder' | 'seller' | 'admin';
  viewerId: string;
  placeholder?: string;
  initialQuery?: string;
  initialCategory?: string;
  alwaysShowResults?: boolean;
  externalCategory?: string;
  onExternalCategoryReset?: () => void;
}

export const UnifiedSearchBar = memo(function UnifiedSearchBar({
  auctions,
  savedSet,
  onToggleSave,
  viewerRole,
  viewerId,
  placeholder = 'Search laptops, GPUs, collectibles, cameras, or seller...',
  initialQuery = '',
  initialCategory = 'All',
  alwaysShowResults = false,
  externalCategory,
  onExternalCategoryReset,
}: UnifiedSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory || 'All');
  const [condition, setCondition] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'upcoming' | 'ended'>('all');
  const [endingWithin, setEndingWithin] = useState<'all' | '1h' | '24h' | '7d'>('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'ending' | 'newest' | 'price_asc' | 'price_desc'>('ending');
  const [showAdvanced, setShowAdvanced] = useState(alwaysShowResults);

  const activeCategory = externalCategory ?? category;
  const deferredQuery = useDeferredValue(query);

  const isFiltering =
    alwaysShowResults ||
    deferredQuery.trim().length > 0 ||
    activeCategory !== 'All' ||
    condition !== 'All' ||
    statusFilter !== 'all' ||
    endingWithin !== 'all' ||
    minPrice.trim() !== '' ||
    maxPrice.trim() !== '' ||
    verifiedOnly;

  const filtered = useMemo(() => {
    if (!isFiltering) return [];
    const q = deferredQuery.trim().toLowerCase();
    const now = Date.now();
    const minP = minPrice.trim() ? Number(minPrice) : null;
    const maxP = maxPrice.trim() ? Number(maxPrice) : null;

    const list = auctions.filter((item) => {
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q) &&
        !item.seller_name.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (activeCategory !== 'All' && item.category !== activeCategory) return false;
      if (condition !== 'All' && item.condition !== condition) return false;
      if (statusFilter !== 'all' && getAuctionPhase(item, now) !== statusFilter) return false;
      if (verifiedOnly && !item.seller_verified) return false;
      if (minP !== null && Number.isFinite(minP) && item.current_price < minP) return false;
      if (maxP !== null && Number.isFinite(maxP) && item.current_price > maxP) return false;
      if (endingWithin !== 'all') {
        const diffMs = new Date(item.ends_at).getTime() - now;
        const limitMs =
          endingWithin === '1h'
            ? 3600_000
            : endingWithin === '24h'
              ? 24 * 3600_000
              : 7 * 24 * 3600_000;
        if (diffMs <= 0 || diffMs > limitMs) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'price_asc') return a.current_price - b.current_price;
      if (sortBy === 'price_desc') return b.current_price - a.current_price;
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime();
    });
  }, [
    auctions,
    deferredQuery,
    activeCategory,
    condition,
    statusFilter,
    endingWithin,
    minPrice,
    maxPrice,
    verifiedOnly,
    sortBy,
    isFiltering,
  ]);

  function clearAllFilters() {
    setQuery('');
    setCategory('All');
    setCondition('All');
    setStatusFilter('all');
    setEndingWithin('all');
    setMinPrice('');
    setMaxPrice('');
    setVerifiedOnly(false);
    onExternalCategoryReset?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex h-12 flex-1 items-center gap-3 rounded-full border border-white/20 bg-white/[0.05] px-4 transition focus-within:border-white/50 focus-within:bg-white/[0.09] focus-within:ring-2 focus-within:ring-white/15">
          <Search className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
          <input
            id="unified-auction-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search auction items"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-expanded={showAdvanced}
          className={`flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border px-5 text-xs font-medium transition ${
            showAdvanced
              ? 'border-white/40 bg-white/15 text-white'
              : 'border-white/20 bg-white/[0.05] text-white/85 hover:border-white/35 hover:bg-white/[0.09]'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Filters</span>
        </button>
      </div>

      {/* Category Quick Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setCategory('All');
            onExternalCategoryReset?.();
          }}
          className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-medium transition ${
            activeCategory === 'All'
              ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
              : 'border-white/15 bg-white/[0.04] text-white/75 hover:border-white/35 hover:text-white'
          }`}
        >
          All
        </button>

        {AUCTION_CATEGORIES.map((cat) => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                onExternalCategoryReset?.();
                setCategory(active ? 'All' : cat.id);
              }}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                active
                  ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                  : 'border-white/15 bg-white/[0.04] text-white/75 hover:border-white/35 hover:text-white'
              }`}
            >
              {cat.id}
            </button>
          );
        })}
      </div>

      {/* Expandable Filter Row */}
      {showAdvanced ? (
        <div className="grid gap-2.5 pt-1 sm:grid-cols-2 lg:grid-cols-6">
          <select
            aria-label="Condition filter"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white focus:border-white/45 focus:outline-none"
          >
            <option value="All">All Conditions</option>
            {AUCTION_CONDITIONS.map((cond) => (
              <option key={cond} value={cond}>
                {cond}
              </option>
            ))}
          </select>

          <select
            aria-label="Auction status filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'live' | 'upcoming' | 'ended')
            }
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white focus:border-white/45 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="live">Live Now</option>
            <option value="upcoming">Upcoming</option>
            <option value="ended">Ended</option>
          </select>

          <select
            aria-label="Ending time filter"
            value={endingWithin}
            onChange={(e) => setEndingWithin(e.target.value as 'all' | '1h' | '24h' | '7d')}
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white focus:border-white/45 focus:outline-none"
          >
            <option value="all">Any Ending Time</option>
            <option value="1h">Ending in 1 Hour</option>
            <option value="24h">Ending in 24 Hours</option>
            <option value="7d">Ending in 7 Days</option>
          </select>

          <input
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min ₹"
            aria-label="Minimum price"
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white placeholder:text-white/40 focus:border-white/45 focus:outline-none"
          />

          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max ₹"
            aria-label="Maximum price"
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white placeholder:text-white/40 focus:border-white/45 focus:outline-none"
          />

          <select
            aria-label="Sort order"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'ending' | 'newest' | 'price_asc' | 'price_desc')
            }
            className="h-10 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white focus:border-white/45 focus:outline-none"
          >
            <option value="ending">Ending Soonest</option>
            <option value="newest">Newest Listed</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>

          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white/85 sm:col-span-2 lg:col-span-2">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-white"
            />
            <BadgeCheck className="h-3.5 w-3.5 text-white/85" aria-hidden="true" />
            <span>Verified Sellers Only</span>
          </label>
        </div>
      ) : null}

      {/* Instant Filtered Results */}
      {isFiltering ? (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-white/75">
              Showing {filtered.length} matching{' '}
              {filtered.length === 1 ? 'auction' : 'auctions'}
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="cursor-pointer rounded-full border border-white/20 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/80 hover:border-white/40 hover:text-white"
            >
              Clear filters
            </button>
          </div>

          {filtered.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((auction) => (
                <AuctionCard
                  key={`search-${auction.id}`}
                  auction={auction}
                  isSaved={savedSet.has(auction.id)}
                  onToggleSave={onToggleSave}
                  viewerRole={viewerRole}
                  viewerId={viewerId}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-white/15 bg-[#0e1015]/80 px-6 py-10 text-center">
              <p className="text-sm font-medium text-white/80">
                No auctions matched your current search or filters.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white hover:border-white/40"
              >
                Reset Search
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
