'use client';

import {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  Gavel,
  RefreshCw,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { PeakChart } from '@/components/ui/peak-chart';
import { formatINR, type MarketplaceUser } from '@/lib/marketplace/types';

type RangeKey = '24h' | '7d' | '30d' | 'all';

interface AnalyticsResponse {
  range: RangeKey;
  role: string;
  summary: {
    totalBids: number;
    peakBidAmount: number;
    averageBidAmount: number;
    auctionsCount: number;
  };
  timeSeries: Array<{
    label: string;
    bids: number;
    peakAmount: number;
    manual: number;
    auto: number;
  }>;
  statusBreakdown: {
    winning: number;
    losing: number;
    active: number;
    total: number;
  };
  categoryDistribution: Array<{
    category: string;
    bids: number;
    volume: number;
  }>;
  biddingMode: {
    manual: number;
    auto: number;
    total: number;
  };
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24 Hours' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'all', label: 'All Time' },
];

const PERIOD_TO_RANGE: Record<string, RangeKey> = {
  '24 Hours': '24h',
  '7 Days': '7d',
  '30 Days': '30d',
  'All Time': 'all',
};

const RANGE_TO_PERIOD: Record<RangeKey, string> = {
  '24h': '24 Hours',
  '7d': '7 Days',
  '30d': '30 Days',
  all: 'All Time',
};

interface AuctionAnalyticsClientProps {
  user: MarketplaceUser;
}

export function AuctionAnalyticsClient({ user }: AuctionAnalyticsClientProps) {
  const shouldReduceMotion = useReducedMotion();
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (targetRange: RangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?range=${targetRange}`);
      const json = (await res.json()) as AnalyticsResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Unable to load analytics.');
        return;
      }
      setData(json);
    } catch {
      setError('Network error while loading analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics(range);
  }, [range, fetchAnalytics]);

  const peakSeries = useMemo(() => {
    if (!data || data.timeSeries.length === 0) return [0, 0];
    if (data.timeSeries.length === 1) {
      return [data.timeSeries[0].peakAmount, data.timeSeries[0].peakAmount];
    }
    return data.timeSeries.map((pt) => pt.peakAmount);
  }, [data]);

  const peakLabels = useMemo(() => {
    if (!data || data.timeSeries.length === 0) return ['Start', 'Now'];
    if (data.timeSeries.length === 1) {
      return [data.timeSeries[0].label, data.timeSeries[0].label];
    }
    return data.timeSeries.map((pt) => pt.label);
  }, [data]);

  const statusRows = useMemo(() => {
    const s = data?.statusBreakdown ?? { winning: 0, losing: 0, active: 0, total: 0 };
    const total = Math.max(1, s.total);
    return [
      {
        label: user.role === 'seller' ? 'Sold / Leading' : 'Winning',
        count: s.winning,
        pct: Math.round((s.winning / total) * 100),
        barClass: 'bg-emerald-400',
        textClass: 'text-emerald-300',
      },
      {
        label: 'Active',
        count: s.active,
        pct: Math.round((s.active / total) * 100),
        barClass: 'bg-sky-400',
        textClass: 'text-sky-300',
      },
      {
        label: user.role === 'seller' ? 'Unsold' : 'Outbid / Lost',
        count: s.losing,
        pct: Math.round((s.losing / total) * 100),
        barClass: 'bg-amber-400',
        textClass: 'text-amber-300',
      },
    ];
  }, [data, user.role]);

  const manualPct = useMemo(() => {
    const m = data?.biddingMode;
    if (!m || m.total === 0) return 0;
    return Math.round((m.manual / m.total) * 100);
  }, [data]);

  const autoPct = useMemo(() => {
    const m = data?.biddingMode;
    if (!m || m.total === 0) return 0;
    return 100 - manualPct;
  }, [data, manualPct]);

  const topCategory = data?.categoryDistribution[0]?.category ?? null;

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header & Time Filters */}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Real-Time Telemetry</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Auction Analytics
            </h1>
            <p className="mt-1 text-xs text-white/55">
              {user.role === 'seller'
                ? 'Live bid progression, category demand, and listing outcomes across your auctions.'
                : user.role === 'admin'
                  ? 'Platform-wide bidding velocity, outcomes, and automation telemetry.'
                  : 'Your bidding activity, peak offers, category focus, and AutoBid performance.'}
            </p>
          </div>

          <div
            role="group"
            aria-label="Analytics time range"
            className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d0f14] p-1"
          >
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  range === opt.key
                    ? 'bg-white text-neutral-950 shadow-sm'
                    : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary KPIs */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 p-5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Total Bids</span>
              <Gavel className="h-3.5 w-3.5 text-white/40" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {loading ? '—' : (data?.summary.totalBids ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 p-5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Peak Bid Amount</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {loading ? '—' : formatINR(data?.summary.peakBidAmount ?? 0)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 p-5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Average Bid</span>
              <Activity className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {loading ? '—' : formatINR(data?.summary.averageBidAmount ?? 0)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d0f14]/90 p-5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Tracked Auctions</span>
              <Trophy className="h-3.5 w-3.5 text-amber-300" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {loading ? '—' : (data?.summary.auctionsCount ?? 0).toLocaleString()}
            </p>
          </div>
        </section>

        {/* Error State */}
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-400/25 bg-rose-950/30 px-5 py-4 text-xs text-rose-100">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-300" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchAnalytics(range)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300/30 bg-rose-950/60 px-3 py-1.5 font-medium text-white hover:bg-rose-900/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        {/* 4-Graph Responsive Dashboard Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* GRAPH 1: Bids & Peak Amount Over Time (Full-width 2-col span featuring PeakChart + Multi-Series Progression) */}
          <motion.section
            initial={shouldReduceMotion ? false : { y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl border border-white/10 bg-[#0d0f14]/95 p-6 lg:col-span-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Bids &amp; Peak Amount Over Time
                </h2>
                <p className="mt-0.5 text-xs text-white/50">
                  Interactive peak bid curve alongside bid volume progression ({RANGE_TO_PERIOD[range]}).
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-950/40 px-3 py-1 text-[11px] font-medium tabular-nums text-emerald-200">
                Peak: {formatINR(data?.summary.peakBidAmount ?? 0)}
              </span>
            </div>

            {loading ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
                <div className="h-[360px] animate-pulse rounded-2xl bg-white/[0.04]" />
                <div className="h-[360px] animate-pulse rounded-2xl bg-white/[0.04]" />
              </div>
            ) : data && data.timeSeries.length > 0 ? (
              <div className="mt-6 grid items-center gap-6 lg:grid-cols-[310px_1fr]">
                {/* Integrated PeakChart Signature Card */}
                <div className="flex justify-center">
                  <PeakChart
                    width={290}
                    accent="#388bff"
                    data={peakSeries}
                    labels={peakLabels}
                    value={data.summary.peakBidAmount}
                    valueSuffix=" ₹"
                    decimals={0}
                    title="Peak bid amount"
                    caption={`${data.summary.totalBids} bids in ${RANGE_TO_PERIOD[range].toLowerCase()}`}
                    updatedText="Live DB"
                    periods={['24 Hours', '7 Days', '30 Days', 'All Time']}
                    period={RANGE_TO_PERIOD[range]}
                    onPeriodChange={(p) => {
                      const next = PERIOD_TO_RANGE[p];
                      if (next) setRange(next);
                    }}
                    formatValue={(v) => formatINR(Math.round(v))}
                  />
                </div>

                {/* Multi-Series Bid Amount & Bid Count Area Chart */}
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="peakAmtGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="bidCntGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#6b7280" fontSize={11} tickLine={false} />
                      <YAxis yAxisId="amt" stroke="#6b7280" fontSize={11} tickLine={false} />
                      <YAxis yAxisId="cnt" orientation="right" stroke="#6b7280" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b0e14',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        yAxisId="amt"
                        type="monotone"
                        dataKey="peakAmount"
                        name="Peak Bid (₹)"
                        stroke="#60a5fa"
                        strokeWidth={2.2}
                        fill="url(#peakAmtGrad)"
                      />
                      <Area
                        yAxisId="cnt"
                        type="monotone"
                        dataKey="bids"
                        name="Bid Count"
                        stroke="#34d399"
                        strokeWidth={2}
                        fill="url(#bidCntGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-white/50">
                <Gavel className="mb-2 h-6 w-6 text-white/30" />
                No bidding activity recorded in this time window yet.
              </div>
            )}
          </motion.section>

          {/* GRAPH 2: Winning vs Losing vs Active Auctions */}
          <motion.section
            initial={shouldReduceMotion ? false : { y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0d0f14]/95 p-6"
          >
            <div className="border-b border-white/[0.08] pb-4">
              <h2 className="text-base font-semibold tracking-tight text-white">
                Winning vs Losing vs Active Auctions
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                Real-time outcome distribution across participated auctions.
              </p>
            </div>

            {loading ? (
              <div className="mt-6 h-56 animate-pulse rounded-xl bg-white/[0.04]" />
            ) : data && data.statusBreakdown.total > 0 ? (
              <div className="mt-6 space-y-6">
                {/* Segmented Proportional Bar */}
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  {statusRows.map((row) =>
                    row.pct > 0 ? (
                      <div
                        key={row.label}
                        style={{ width: `${row.pct}%` }}
                        className={`${row.barClass} transition-all duration-500`}
                        title={`${row.label}: ${row.count} (${row.pct}%)`}
                      />
                    ) : null
                  )}
                </div>

                {/* Detailed Breakdown Rows */}
                <div className="space-y-4">
                  {statusRows.map((row) => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white/85">{row.label}</span>
                        <span className={`font-semibold tabular-nums ${row.textClass}`}>
                          {row.count} ({row.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          initial={shouldReduceMotion ? false : { width: 0 }}
                          animate={{ width: `${row.pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className={`h-full rounded-full ${row.barClass}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-xs text-white/45">
                Participate in or list an auction to view outcome ratios.
              </div>
            )}
          </motion.section>

          {/* GRAPH 3: Category-wise Bidding Distribution */}
          <motion.section
            initial={shouldReduceMotion ? false : { y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0d0f14]/95 p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Category-wise Bidding Distribution
                </h2>
                <p className="mt-0.5 text-xs text-white/50">
                  Bid concentration across marketplace departments.
                </p>
              </div>
              {topCategory ? (
                <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-white/85">
                  Top: {topCategory}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="mt-6 h-56 animate-pulse rounded-xl bg-white/[0.04]" />
            ) : data && data.categoryDistribution.length > 0 ? (
              <div className="mt-5 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.categoryDistribution.slice(0, 6)}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 10, bottom: 0 }}
                  >
                    <XAxis type="number" stroke="#6b7280" fontSize={11} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      stroke="#9ca3af"
                      fontSize={11}
                      width={96}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0e14',
                        border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="bids" name="Bids" radius={[0, 6, 6, 0]}>
                      {data.categoryDistribution.slice(0, 6).map((entry, idx) => (
                        <Cell
                          key={entry.category}
                          fill={idx === 0 ? '#34d399' : '#64748b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-xs text-white/45">
                No category bidding data recorded yet.
              </div>
            )}
          </motion.section>

          {/* GRAPH 4: Manual Bids vs AutoBid / Proxy Activity */}
          <motion.section
            initial={shouldReduceMotion ? false : { y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="rounded-2xl border border-white/10 bg-[#0d0f14]/95 p-6 lg:col-span-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Manual Bids vs AutoBid / Proxy Activity
                </h2>
                <p className="mt-0.5 text-xs text-white/50">
                  Direct manual bidding compared against automated proxy &amp; AutoBid AI execution over time.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-white/80">
                  <Gavel className="h-3.5 w-3.5 text-sky-400" />
                  Manual: <strong className="tabular-nums">{manualPct}%</strong> (
                  {data?.biddingMode.manual ?? 0})
                </span>
                <span className="flex items-center gap-1.5 text-white/80">
                  <Bot className="h-3.5 w-3.5 text-emerald-400" />
                  AutoBid/Proxy: <strong className="tabular-nums">{autoPct}%</strong> (
                  {data?.biddingMode.auto ?? 0})
                </span>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 h-56 animate-pulse rounded-xl bg-white/[0.04]" />
            ) : data && data.timeSeries.length > 0 ? (
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.timeSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={11} tickLine={false} />
                    <YAxis stroke="#6b7280" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0e14',
                        border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="manual" name="Manual Bids" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="auto" name="AutoBid / Proxy" fill="#34d399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-xs text-white/45">
                No manual or automated bid activity recorded in this window.
              </div>
            )}
          </motion.section>
        </div>
      </main>
    </div>
  );
}
