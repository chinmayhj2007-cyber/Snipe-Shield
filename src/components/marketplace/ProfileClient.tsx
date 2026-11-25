'use client';

import {
  BadgeCheck,
  BarChart3,
  Gavel,
  Loader2,
  ShieldCheck,
  Store,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import {
  AUCTION_CATEGORIES,
  formatINR,
  type MarketplaceUser,
} from '@/lib/marketplace/types';

interface AnalyticsBid {
  id: string;
  auction_id: string;
  amount: number;
  is_auto_proxy: boolean;
  bid_source: string;
  created_at: string;
}

interface AnalyticsOrder {
  id: string;
  auction_id: string;
  final_price: number;
  status: string;
  created_at: string;
}

interface AnalyticsAuction {
  id: string;
  title: string;
  category: string;
  current_price: number;
  highest_bidder_id: string | null;
  status: string;
  ends_at: string;
}

interface ProfileClientProps {
  user: MarketplaceUser;
  stats: {
    savedCount: number;
    activityCount: number;
  };
  analytics: {
    bids: AnalyticsBid[];
    orders: AnalyticsOrder[];
    auctions: AnalyticsAuction[];
  };
  verification: {
    business_name: string;
    government_id_type: string;
    document_reference: string;
    status: string;
    review_notes: string | null;
  } | null;
  personalizationEnabled: boolean;
}

const PIE_COLORS = ['#34d399', '#f87171', '#94a3b8'];

export function ProfileClient({
  user,
  stats,
  analytics,
  verification,
  personalizationEnabled: initialPersonalization,
}: ProfileClientProps) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'account' | 'intelligence' | 'verification'>(
    'account'
  );
  const [fullName, setFullName] = useState(user.fullName || user.displayName);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Personalization state
  const [personalizationEnabled, setPersonalizationEnabled] = useState(initialPersonalization);

  // Seller Verification form state
  const [businessName, setBusinessName] = useState(verification?.business_name ?? '');
  const [idType, setIdType] = useState(verification?.government_id_type ?? 'PAN / Aadhaar');
  const [docRef, setDocRef] = useState(verification?.document_reference ?? '');
  const [verifSubmitting, setVerifSubmitting] = useState(false);

  // Bid Intelligence Filters
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const isSeller = user.role === 'seller';
  const initial = (fullName.trim() || user.displayName).charAt(0).toUpperCase();

  const intel = useMemo(() => {
    const auctionMap = new Map(analytics.auctions.map((a) => [a.id, a]));
    const now = Date.now();
    const cutoffMs =
      dateRange === '7d'
        ? now - 7 * 86400_000
        : dateRange === '30d'
          ? now - 30 * 86400_000
          : dateRange === '90d'
            ? now - 90 * 86400_000
            : 0;

    const filteredBids = analytics.bids.filter((b) => {
      if (cutoffMs && new Date(b.created_at).getTime() < cutoffMs) return false;
      const auc = auctionMap.get(b.auction_id);
      if (categoryFilter !== 'All' && auc?.category !== categoryFilter) return false;
      return true;
    });

    const totalBids = filteredBids.length;
    const avgBid =
      totalBids > 0
        ? Math.round(filteredBids.reduce((s, b) => s + b.amount, 0) / totalBids)
        : 0;
    const highestBid =
      totalBids > 0 ? Math.max(...filteredBids.map((b) => b.amount)) : 0;

    const participatedAuctionIds = Array.from(new Set(filteredBids.map((b) => b.auction_id)));
    let won = 0;
    let lost = 0;
    let active = 0;
    for (const aid of participatedAuctionIds) {
      const auc = auctionMap.get(aid);
      if (!auc) continue;
      const ended = auc.status === 'ended' || new Date(auc.ends_at).getTime() <= now;
      if (!ended) active++;
      else if (auc.highest_bidder_id === user.id) won++;
      else lost++;
    }

    const totalSpending = analytics.orders
      .filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status))
      .reduce((s, o) => s + o.final_price, 0);

    const winPct = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
    const avgBidsPerAuction =
      participatedAuctionIds.length > 0
        ? Number((totalBids / participatedAuctionIds.length).toFixed(1))
        : 0;

    // Bids over time (by date)
    const dayMap = new Map<string, { date: string; bids: number; amount: number }>();
    for (const b of filteredBids) {
      const day = b.created_at.slice(0, 10);
      const cur = dayMap.get(day) ?? { date: day, bids: 0, amount: 0 };
      cur.bids += 1;
      cur.amount = Math.max(cur.amount, b.amount);
      dayMap.set(day, cur);
    }

    // Category distribution
    const catMap = new Map<string, number>();
    for (const b of filteredBids) {
      const cat = auctionMap.get(b.auction_id)?.category ?? 'Other';
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }

    // Manual vs AutoBid/Proxy
    let manualCount = 0;
    let autoCount = 0;
    for (const b of filteredBids) {
      if (b.is_auto_proxy || b.bid_source === 'autobid' || b.bid_source === 'proxy') {
        autoCount++;
      } else {
        manualCount++;
      }
    }

    return {
      totalBids,
      won,
      lost,
      active,
      avgBid,
      highestBid,
      totalSpending,
      winPct,
      avgBidsPerAuction,
      bidsOverTime: Array.from(dayMap.values()),
      winLossPie: [
        { name: 'Won', value: won },
        { name: 'Lost', value: lost },
        { name: 'Active', value: active },
      ],
      categoryChart: Array.from(catMap.entries()).map(([category, count]) => ({
        category,
        count,
      })),
      sourceChart: [
        { type: 'Manual Bids', count: manualCount },
        { type: 'AutoBid / Proxy', count: autoCount },
      ],
      filteredBids: [...filteredBids].reverse().slice(0, 25),
      auctionMap,
    };
  }, [analytics, dateRange, categoryFilter, user.id]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (inFlightRef.current || saving) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setErrorMessage('Display name must be at least 2 characters.');
      return;
    }

    inFlightRef.current = true;
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: trimmed }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Could not save profile.');
        return;
      }

      setStatusMessage('Display name updated cleanly.');
      router.refresh();
    } catch {
      setErrorMessage('Network error while updating profile.');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleTogglePersonalization() {
    const next = !personalizationEnabled;
    setPersonalizationEnabled(next);
    await fetch('/api/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizationEnabled: next }),
    });
  }

  async function handleClearHistory() {
    await fetch('/api/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearHistory: true }),
    });
    setStatusMessage('Recently viewed and search history cleared.');
  }

  async function handleSubmitVerification(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setVerifSubmitting(true);
    try {
      const res = await fetch('/api/seller/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          governmentIdType: idType,
          documentReference: docRef,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Verification submission failed.');
        return;
      }
      setStatusMessage('Verification submitted! An administrator will review your request.');
      router.refresh();
    } finally {
      setVerifSubmitting(false);
    }
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={{ ...user, displayName: fullName.trim() || user.displayName }} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
        {/* Top Profile Header + Tabs */}
        <section className="smoky-glass-card rounded-[34px] border border-white/20 p-6 backdrop-blur-2xl sm:p-8">
          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl font-semibold text-white">
                {initial || <User className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-white">
                    {fullName.trim() || user.displayName}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      isSeller
                        ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                        : 'border-white/25 bg-white/15 text-white'
                    }`}
                  >
                    {isSeller ? <Store className="h-3 w-3" /> : <Gavel className="h-3 w-3" />}
                    {user.role.toUpperCase()}
                  </span>
                  {user.verificationStatus === 'verified' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/85">
                      <BadgeCheck className="h-3 w-3" /> Verified
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-white/65">{user.email || user.phone}</p>
                {isSeller ? (
                  <Link
                    href={`/sellers/${user.id}`}
                    className="mt-1 inline-block text-[11px] text-white/80 underline hover:text-white"
                  >
                    View Public TrustScore Profile →
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`cursor-pointer rounded-full border px-4 py-2 text-xs font-medium transition ${
                  activeTab === 'account'
                    ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                    : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/35'
                }`}
              >
                Account &amp; Privacy
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('intelligence')}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
                  activeTab === 'intelligence'
                    ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                    : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/35'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                BID INTELLIGENCE
              </button>
              {isSeller ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('verification')}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
                    activeTab === 'verification'
                      ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                      : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/35'
                  }`}
                >
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Seller Verification
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-950/50 px-4 py-2.5 text-center text-xs text-rose-100">
            {errorMessage}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="rounded-2xl border border-white/25 bg-white/[0.06] px-4 py-2.5 text-center text-xs text-white/85">
            {statusMessage}
          </div>
        ) : null}

        {activeTab === 'account' ? (
          <section className="mx-auto max-w-2xl rounded-[32px] border border-white/15 bg-[#0e1015]/90 p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-center">
                <p className="text-[11px] uppercase tracking-wider text-white/55">
                  {isSeller ? 'Listings Created' : 'Bids Placed'}
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">{stats.activityCount}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-center">
                <p className="text-[11px] uppercase tracking-wider text-white/55">Saved Items</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stats.savedCount}</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                >
                  Display Name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={80}
                  className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.05] px-4 text-sm text-white"
                />
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3 text-xs text-white/65">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#d5d7db]" />
                <span>Account role ({user.role}) is enforced by PostgreSQL Row Level Security.</span>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="smoky-cta-btn flex h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{saving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </form>

            {/* Personalization & History Privacy Controls */}
            <div className="space-y-3 border-t border-white/15 pt-5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">Personalized Recommendations</p>
                  <p className="text-white/55">Use saved items and view history to tailor suggestions.</p>
                </div>
                <input
                  type="checkbox"
                  checked={personalizationEnabled}
                  onChange={handleTogglePersonalization}
                  className="h-4 w-4 accent-white"
                />
              </div>
              <button
                type="button"
                onClick={handleClearHistory}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.04] px-4 text-xs text-white/80 hover:border-white/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Recently Viewed &amp; Search History
              </button>
            </div>

            <div className="border-t border-white/15 pt-4">
              <LogoutButton variant="secondary" />
            </div>
          </section>
        ) : null}

        {activeTab === 'intelligence' ? (
          <section className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/15 bg-[#0e1015]/90 p-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Private Bid Intelligence Analytics
                </h2>
                <p className="text-[11px] text-white/60">
                  Live metrics derived strictly from your authenticated SnipeShield records.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
                  className="h-9 rounded-full border border-white/20 bg-black/50 px-3 text-xs text-white"
                >
                  <option value="all">All Time</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-full border border-white/20 bg-black/50 px-3 text-xs text-white"
                >
                  <option value="All">All Categories</option>
                  {AUCTION_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 10 Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ['Total Bids Placed', String(intel.totalBids)],
                ['Winning Auctions', String(intel.won)],
                ['Auctions Lost', String(intel.lost)],
                ['Active Bidding', String(intel.active)],
                ['Win Percentage', `${intel.winPct}%`],
                ['Average Bid', formatINR(intel.avgBid)],
                ['Highest Bid', formatINR(intel.highestBid)],
                ['Total Spending', formatINR(intel.totalSpending)],
                ['Avg Bids / Auction', String(intel.avgBidsPerAuction)],
                ['Active Days', String(intel.bidsOverTime.length)],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/15 bg-[#0e1015]/85 p-3.5 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{val}</p>
                </div>
              ))}
            </div>

            {/* Recharts Visualizations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/75">
                  Bids &amp; Peak Amount Over Time
                </h3>
                <div className="h-60 w-full">
                  {intel.bidsOverTime.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={intel.bidsOverTime}>
                        <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                        <YAxis stroke="#9ca3af" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0d1016',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#e2e4e8"
                          fill="#e2e4e8"
                          fillOpacity={0.2}
                          name="Peak Bid (₹)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-white/50">
                      Place bids to visualize bidding timeline.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/75">
                  Winning vs Losing vs Active Auctions
                </h3>
                <div className="h-60 w-full">
                  {intel.won + intel.lost + intel.active > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={intel.winLossPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          label
                        >
                          {intel.winLossPie.map((entry, idx) => (
                            <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0d1016',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '12px',
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-white/50">
                      No auction outcomes recorded in selected filter.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/75">
                  Category-Wise Bidding Distribution
                </h3>
                <div className="h-56 w-full">
                  {intel.categoryChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={intel.categoryChart}>
                        <XAxis dataKey="category" stroke="#9ca3af" fontSize={10} />
                        <YAxis stroke="#9ca3af" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0d1016',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '12px',
                          }}
                        />
                        <Bar dataKey="count" fill="#a7adb6" radius={[6, 6, 0, 0]} name="Bids" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-white/50">
                      No category data yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/75">
                  Manual Bids vs AutoBid / Proxy Activity
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={intel.sourceChart}>
                      <XAxis dataKey="type" stroke="#9ca3af" fontSize={11} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0d1016',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '12px',
                        }}
                      />
                      <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} name="Bids" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detailed Bid History Table */}
            <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/75">
                Detailed Bid History
              </h3>
              {intel.filteredBids.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-white/55">
                        <th className="py-2 pr-4">Auction</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Method</th>
                        <th className="py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {intel.filteredBids.map((b) => (
                        <tr key={b.id}>
                          <td className="py-2 pr-4">
                            <Link
                              href={`/auctions/${b.auction_id}`}
                              className="text-white hover:underline"
                            >
                              {intel.auctionMap.get(b.auction_id)?.title ?? b.auction_id}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 font-semibold">{formatINR(b.amount)}</td>
                          <td className="py-2 pr-4 capitalize text-white/70">
                            {b.bid_source || (b.is_auto_proxy ? 'proxy' : 'manual')}
                          </td>
                          <td className="py-2 text-white/55">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-white/55">No matching bids found.</p>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'verification' && isSeller ? (
          <section className="mx-auto max-w-2xl rounded-[32px] border border-white/15 bg-[#0e1015]/90 p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Seller Identity Verification</h2>
              <p className="mt-1 text-xs text-white/65">
                Current Status:{' '}
                <strong className="capitalize text-white">
                  {(verification?.status ?? user.verificationStatus ?? 'unverified').replace('_', ' ')}
                </strong>
                . Only an authorized administrator may approve verified seller badges.
              </p>
              {verification?.review_notes ? (
                <p className="mt-2 rounded-xl border border-white/15 bg-white/[0.04] p-3 text-xs text-white/80">
                  Admin Note: {verification.review_notes}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleSubmitVerification} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/80">
                  Legal / Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  placeholder="e.g. Apex Tech Refurbishers Pvt Ltd"
                  className="h-11 w-full rounded-full border border-white/20 bg-white/[0.05] px-4 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/80">
                  Government ID Type
                </label>
                <select
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                  className="h-11 w-full rounded-full border border-white/20 bg-[#0d1016] px-4 text-xs text-white"
                >
                  <option value="PAN / Aadhaar">PAN / Aadhaar</option>
                  <option value="GSTIN Certificate">GSTIN Certificate</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/80">
                  Document Reference Number (Masked / Last 4 or GSTIN)
                </label>
                <input
                  type="text"
                  value={docRef}
                  onChange={(e) => setDocRef(e.target.value)}
                  required
                  placeholder="e.g. PAN-XXXX1234K"
                  className="h-11 w-full rounded-full border border-white/20 bg-white/[0.05] px-4 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                disabled={verifSubmitting}
                className="smoky-cta-btn h-11 w-full cursor-pointer rounded-full text-xs font-semibold text-white"
              >
                {verifSubmitting ? 'Submitting...' : 'Submit Verification Request'}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
