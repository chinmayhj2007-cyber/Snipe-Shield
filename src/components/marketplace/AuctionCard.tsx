'use client';

import { ArrowUpRight, BadgeCheck, Bookmark, Gavel, GitCompare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { memo, useEffect, useRef, useState } from 'react';
import { CountdownTimer } from '@/components/marketplace/CountdownTimer';
import {
  type AuctionItem,
  formatINR,
  getAuctionPhase,
  getPrimaryImage,
} from '@/lib/marketplace/types';

interface AuctionCardProps {
  auction: AuctionItem;
  isSaved: boolean;
  onToggleSave?: (auctionId: string, nextSaved: boolean) => void;
  onRequestDelete?: (auction: AuctionItem) => void;
  viewerRole: 'bidder' | 'seller' | 'admin';
  viewerId?: string;
}

export const AuctionCard = memo(function AuctionCard({
  auction,
  isSaved,
  onToggleSave,
  onRequestDelete,
  viewerRole,
  viewerId,
}: AuctionCardProps) {
  const inFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [localSaved, setLocalSaved] = useState(isSaved);
  const [inCompare, setInCompare] = useState(false);
  const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);

  const isPreview = auction.id === 'preview';
  const imageUrl = getPrimaryImage(auction);

  useEffect(() => {
    setLocalSaved(isSaved);
  }, [isSaved]);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  useEffect(() => {
    setMountedNowMs(Date.now());
    if (isPreview) return;
    try {
      const raw = localStorage.getItem('snipeshield_compare_ids');
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      setInCompare(Array.isArray(ids) && ids.includes(auction.id));
    } catch {
      setInCompare(false);
    }
  }, [auction.id, isPreview]);

  const phase =
    mountedNowMs === null
      ? auction.status === 'ended' || auction.status === 'cancelled'
        ? 'ended'
        : 'live'
      : getAuctionPhase(auction, mountedNowMs);
  const isOwnListing = viewerId === auction.seller_id;

  async function handleSaveToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPreview || inFlightRef.current || saving) return;
    inFlightRef.current = true;
    setSaving(true);

    const previous = localSaved;
    setLocalSaved(!previous);

    try {
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId: auction.id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { saved: boolean };
        setLocalSaved(data.saved);
        onToggleSave?.(auction.id, data.saved);
      } else {
        setLocalSaved(previous);
      }
    } catch {
      setLocalSaved(previous);
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }

  function handleCompareToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPreview) return;
    try {
      const raw = localStorage.getItem('snipeshield_compare_ids');
      const prev = raw ? (JSON.parse(raw) as string[]) : [];
      const current = Array.isArray(prev) ? prev : [];
      let next: string[];
      if (current.includes(auction.id)) {
        next = current.filter((id) => id !== auction.id);
        setInCompare(false);
      } else {
        next = [...current.slice(-3), auction.id];
        setInCompare(true);
      }
      localStorage.setItem('snipeshield_compare_ids', JSON.stringify(next));
      window.dispatchEvent(new Event('snipeshield-compare-change'));
    } catch {
      // ignore
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14]/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-[#12151c]/95 hover:shadow-[0_16px_38px_rgba(0,0,0,0.5)]">
      {/* Image Header */}
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-white/[0.08] bg-[#0b0c10]">
        {imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={auction.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#151820] to-[#08090c]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/snipe-shield-logo.webp"
              alt="Snipe Shield"
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-14 w-14 object-contain opacity-65"
            />
          </div>
        )}

        {/* Top badges */}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md ${
                phase === 'live'
                  ? 'border-white/30 bg-black/80 text-white'
                  : phase === 'upcoming'
                    ? 'border-white/20 bg-black/75 text-white/80'
                    : 'border-white/15 bg-black/75 text-white/50'
              }`}
            >
              {phase === 'live' ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              ) : null}
              {phase === 'live' ? 'Live' : phase === 'upcoming' ? 'Upcoming' : 'Ended'}
            </span>

            <span className="rounded-full border border-white/15 bg-black/70 px-2.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-md">
              {auction.condition}
            </span>

            {auction.is_demo ? (
              <span className="rounded-full border border-white/20 bg-black/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/75 backdrop-blur-md">
                DEMO
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {isOwnListing &&
            (phase === 'ended' || auction.status === 'ended') &&
            onRequestDelete &&
            !isPreview ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestDelete(auction);
                }}
                aria-label="Delete completed auction"
                title="Delete completed auction"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/65 text-white/80 backdrop-blur-md transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleCompareToggle}
              disabled={isPreview}
              aria-label={inCompare ? 'Remove from comparison' : 'Compare item'}
              title={inCompare ? 'In Compare list' : 'Add to Compare'}
              className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition ${
                isPreview ? 'cursor-default opacity-60' : 'cursor-pointer'
              } ${
                inCompare
                  ? 'border-white/50 bg-white text-neutral-950'
                  : 'border-white/15 bg-black/65 text-white/80 hover:border-white/40 hover:text-white'
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleSaveToggle}
              disabled={saving || isPreview}
              aria-label={localSaved ? 'Remove from saved items' : 'Save auction item'}
              className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45 ${
                isPreview ? 'cursor-default opacity-60' : 'cursor-pointer'
              } ${
                localSaved
                  ? 'border-white/50 bg-[#e2e4e8] text-neutral-950'
                  : 'border-white/15 bg-black/65 text-white/80 hover:border-white/40 hover:text-white'
              }`}
            >
              <Bookmark
                className={`h-3.5 w-3.5 ${localSaved ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-white/50">
            <span className="truncate font-medium uppercase tracking-wider">{auction.category}</span>
            <span className="tabular-nums">{auction.bid_count ?? 0} bids</span>
          </div>

          {isPreview ? (
            <div className="mt-1.5 block">
              <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-white">
                {auction.title}
              </h3>
            </div>
          ) : (
            <Link href={`/auctions/${auction.id}`} prefetch className="mt-1.5 block">
              <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-white transition group-hover:text-[#e2e4e8]">
                {auction.title}
              </h3>
            </Link>
          )}

          {/* Seller + Verification */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/60">
            {isPreview ? (
              <span className="truncate">{auction.seller_name}</span>
            ) : (
              <Link
                href={`/sellers/${auction.seller_id}`}
                className="inline-flex items-center gap-1 truncate transition hover:text-white"
              >
                <span className="truncate">{auction.seller_name}</span>
                {auction.seller_verified ? (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-white/85" aria-label="Verified Seller" />
                ) : null}
              </Link>
            )}
            {auction.seller_trust_score !== undefined ? (
              <span className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] tabular-nums text-white/65">
                Trust {auction.seller_trust_score}
              </span>
            ) : null}
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/55">
            {auction.description}
          </p>
        </div>

        <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-3.5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">
                {phase === 'ended' || auction.status === 'ended'
                  ? auction.highest_bidder_id
                    ? 'Winning Bid'
                    : 'Unsold'
                  : auction.highest_bidder_id
                    ? 'Current Bid'
                    : 'Starting Bid'}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-white">
                {formatINR(auction.current_price)}
              </p>
              {auction.highest_bidder_id ? (
                <p className="text-[10px] tabular-nums text-white/40">
                  Start: {formatINR(auction.starting_price)}
                </p>
              ) : null}
            </div>

            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">
                {phase === 'ended' || auction.status === 'ended' ? 'Status' : 'Time Left'}
              </p>
              <div className="mt-0.5">
                <CountdownTimer
                  startsAt={auction.starts_at}
                  endsAt={auction.ends_at}
                  status={auction.status}
                  auctionId={auction.id}
                  compact
                />
              </div>
            </div>
          </div>

          {isPreview ? (
            <button
              type="button"
              disabled
              className="smoky-cta-btn flex h-10 w-full cursor-default items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-white/75 opacity-80"
            >
              <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Preview Card</span>
            </button>
          ) : (
            <Link
              href={`/auctions/${auction.id}`}
              prefetch
              className="smoky-cta-btn flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              {phase === 'ended' || auction.status === 'ended' ? (
                <>
                  <span>View Ended Auction</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              ) : viewerRole === 'bidder' && !isOwnListing && phase === 'live' ? (
                <>
                  <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Place Bid</span>
                </>
              ) : (
                <>
                  <span>{isOwnListing ? 'Manage / View Live' : 'View Auction'}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
});
