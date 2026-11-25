'use client';

import { Clock, ShieldAlert } from 'lucide-react';
import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import { getAuthoritativeNow, syncServerClock } from '@/lib/marketplace/server-clock';

interface CountdownTimerProps {
  startsAt: string;
  endsAt: string;
  status: string;
  compact?: boolean;
  auctionId?: string;
  onExpire?: () => void;
  className?: string;
}

// Single shared 1s clock across all mounted timers; pauses automatically when tab is hidden
let sharedAuthoritativeNow: number | null = null;
let tickerId: number | null = null;
const listeners = new Set<() => void>();
const expiredAuctionIdsNotified = new Set<string>();

function notifyListeners() {
  sharedAuthoritativeNow = getAuthoritativeNow();
  listeners.forEach((cb) => cb());
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    if (tickerId !== null) {
      window.clearInterval(tickerId);
      tickerId = null;
    }
  } else {
    // Tab became active: immediately resync with server and notify
    void syncServerClock().then(() => {
      notifyListeners();
    });
    if (listeners.size > 0 && tickerId === null) {
      tickerId = window.setInterval(notifyListeners, 1000);
    }
  }
}

function subscribeClock(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== 'undefined') {
    if (sharedAuthoritativeNow === null || tickerId === null) {
      sharedAuthoritativeNow = getAuthoritativeNow();
    }
    if (listeners.size === 1) {
      if (typeof document === 'undefined' || !document.hidden) {
        tickerId = window.setInterval(notifyListeners, 1000);
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      if (tickerId !== null) {
        window.clearInterval(tickerId);
        tickerId = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

function getClientClock(): number | null {
  if (typeof window !== 'undefined' && sharedAuthoritativeNow === null) {
    sharedAuthoritativeNow = getAuthoritativeNow();
  }
  return sharedAuthoritativeNow;
}

function getServerClock(): number | null {
  return null;
}

/**
 * Format remaining duration.
 * Full format: 00 DAYS : 00 HOURS : 04 MINUTES : 32 SECONDS
 * Compact format: 00d : 00h : 04m : 32s
 */
function formatDuration(ms: number, compact = false): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const dd = String(days).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (compact) {
    return `${dd}d : ${hh}h : ${mm}m : ${ss}s`;
  }

  return `${dd} DAYS : ${hh} HOURS : ${mm} MINUTES : ${ss} SECONDS`;
}

export const CountdownTimer = memo(function CountdownTimer({
  startsAt,
  endsAt,
  status,
  compact = false,
  auctionId,
  onExpire,
  className = '',
}: CountdownTimerProps) {
  const nowMs = useSyncExternalStore(subscribeClock, getClientClock, getServerClock);
  const firedExpireRef = useRef(false);

  const startMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const endMs = endsAt ? new Date(endsAt).getTime() : NaN;

  // Auto-trigger expiration closure when timer hits 0
  useEffect(() => {
    if (nowMs === null || Number.isNaN(endMs)) return;
    if (status === 'active' && nowMs >= endMs && !firedExpireRef.current) {
      firedExpireRef.current = true;
      onExpire?.();

      if (auctionId && !expiredAuctionIdsNotified.has(auctionId)) {
        expiredAuctionIdsNotified.add(auctionId);
        void fetch(`/api/auctions/${auctionId}/close`, { method: 'POST' }).catch(() => {});
      }
    }
  }, [nowMs, endMs, status, auctionId, onExpire]);

  // Initial SSR snapshot (null) or invalid date
  if (nowMs === null || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-white/70 ${className}`}>
        <Clock className="h-3.5 w-3.5 text-[#a7adb6]" aria-hidden="true" />
        <span>{status === 'active' ? '00 DAYS : 00 HOURS : --:--' : 'AUCTION ENDED'}</span>
      </span>
    );
  }

  // Ended state
  if (status !== 'active' || nowMs >= endMs) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium tracking-wider text-white/60 ${className}`}
      >
        <Clock className="h-3.5 w-3.5 text-white/45" aria-hidden="true" />
        <span>AUCTION ENDED</span>
      </span>
    );
  }

  // Upcoming state (starts in future)
  if (nowMs < startMs) {
    const diff = startMs - nowMs;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.05] px-2.5 py-0.5 font-mono text-xs font-medium text-white/80 ${className}`}
      >
        <Clock className="h-3.5 w-3.5 text-[#a7adb6]" aria-hidden="true" />
        <span>Starts in {formatDuration(diff, compact)}</span>
      </span>
    );
  }

  // Active state
  const remainingMs = Math.max(0, endMs - nowMs);
  const isSnipeWindow = remainingMs <= 30_000;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 font-mono text-xs font-semibold tabular-nums ${
        isSnipeWindow ? 'text-white' : 'text-white/90'
      } ${className}`}
    >
      {isSnipeWindow ? (
        <ShieldAlert className="h-3.5 w-3.5 animate-pulse text-white" aria-hidden="true" />
      ) : (
        <Clock className="h-3.5 w-3.5 text-[#a7adb6]" aria-hidden="true" />
      )}
      <span className="tracking-tight">{formatDuration(remainingMs, compact)}</span>
      {isSnipeWindow ? (
        <span className="rounded-full border border-white/30 bg-white/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white">
          30s Anti-Snipe
        </span>
      ) : null}
    </span>
  );
});
