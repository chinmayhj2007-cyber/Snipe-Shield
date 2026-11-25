'use client';

import { ArrowUpRight, Bot, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { type AutoBidConfig, formatINR, type MarketplaceUser } from '@/lib/marketplace/types';

interface AutoBidLog {
  id: string;
  auction_id: string;
  action: string;
  bid_amount: number | null;
  note: string;
  created_at: string;
}

interface AutoBidDashboardClientProps {
  user: MarketplaceUser;
  initialConfigs: AutoBidConfig[];
  initialLogs: AutoBidLog[];
}

export function AutoBidDashboardClient({
  user,
  initialConfigs,
  initialLogs,
}: AutoBidDashboardClientProps) {
  const [configs, setConfigs] = useState<AutoBidConfig[]>(initialConfigs);
  const [logs] = useState<AutoBidLog[]>(initialLogs);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleToggle(config: AutoBidConfig) {
    setBusyId(config.id);
    try {
      const res = await fetch('/api/autobid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, isActive: !config.is_active }),
      });
      if (res.ok) {
        setConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? { ...c, is_active: !c.is_active } : c))
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/autobid?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfigs((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/85">
              <Bot className="h-3.5 w-3.5" />
              Deterministic Rule Engine &bull; Budget Cap Enforced Server-Side
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              AutoBid AI Dashboard
            </h1>
            <p className="mt-1 text-xs text-white/65">
              Monitor authorized maximum budgets, remaining headroom, automated counterbids,
              and pause or cancel instantly.
            </p>
          </div>

          <Link
            href="/bidder/home"
            className="smoky-cta-btn inline-flex h-10 items-center justify-center rounded-full px-5 text-xs font-medium text-white"
          >
            Browse Auctions
          </Link>
        </div>

        {configs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {configs.map((cfg) => {
              const current = cfg.auction_current_price ?? 0;
              const remaining = Math.max(0, cfg.max_amount - current);
              const isLeading = cfg.auction_highest_bidder_id === user.id;

              return (
                <article
                  key={cfg.id}
                  className="smoky-glass-card rounded-[28px] border border-white/20 p-5"
                >
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/auctions/${cfg.auction_id}`}
                          className="inline-flex items-center gap-1 text-base font-semibold text-white hover:underline"
                        >
                          {cfg.auction_title || 'Auction'}
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <p className="mt-0.5 text-[11px] text-white/55">
                          Strategy: {cfg.increment_strategy} &bull; Stop: {cfg.stop_condition}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                          cfg.is_active
                            ? 'border-white/25 bg-white/[0.06] text-white/85'
                            : 'border-white/20 bg-white/10 text-white/65'
                        }`}
                      >
                        {cfg.is_active ? (isLeading ? 'Active · Leading' : 'Active') : 'Paused'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-black/35 p-3 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-white/50">Authorized Max</span>
                        <p className="font-semibold text-white">{formatINR(cfg.max_amount)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50">Current Bid</span>
                        <p className="font-semibold text-white">{formatINR(current)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50">Remaining Headroom</span>
                        <p className="font-semibold text-white/85">{formatINR(remaining)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-white/65">
                      <span>Automated Bids Executed: {cfg.bids_placed}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggle(cfg)}
                          disabled={busyId === cfg.id}
                          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 text-[11px] font-medium text-white hover:border-white/45"
                        >
                          {cfg.is_active ? (
                            <>
                              <Pause className="h-3 w-3" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" /> Resume
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cfg.id)}
                          disabled={busyId === cfg.id}
                          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-rose-300/30 bg-rose-950/50 px-3 text-[11px] font-medium text-rose-100"
                        >
                          <Trash2 className="h-3 w-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/85 p-10 text-center">
            <Bot className="mx-auto h-8 w-8 text-white/45" />
            <h2 className="mt-3 text-base font-semibold text-white">No AutoBid AI Rules Active</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-white/60">
              Open any live auction and click &ldquo;Configure AutoBid AI&rdquo; to set a
              server-enforced maximum budget.
            </p>
          </div>
        )}

        {/* Activity Logs */}
        <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-6">
          <h2 className="text-sm font-semibold text-white">AutoBid Activity History</h2>
          {logs.length > 0 ? (
            <ul className="mt-4 space-y-2 text-xs">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-2.5"
                >
                  <div>
                    <span className="font-semibold capitalize text-white">{log.action}</span>
                    <span className="ml-2 text-white/65">{log.note}</span>
                  </div>
                  <span className="text-[11px] text-white/50">
                    {log.bid_amount ? `${formatINR(log.bid_amount)} · ` : ''}
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-white/55">No AutoBid events recorded yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
