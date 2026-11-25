'use client';

import {
  AlertOctagon,
  BadgeCheck,
  CheckCircle2,
  Gavel,
  Scale,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import {
  type DisputeItem,
  formatINR,
  type FraudAlertItem,
  type MarketplaceUser,
  type SellerVerificationItem,
} from '@/lib/marketplace/types';

interface AdminDashboardClientProps {
  user: MarketplaceUser;
  data: {
    profiles: Array<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      verification_status: string;
      trust_score: number;
      is_demo: boolean;
      is_suspended: boolean;
      created_at: string;
    }>;
    auctions: Array<{
      id: string;
      title: string;
      category: string;
      current_price: number;
      status: string;
      moderation_status: string;
      is_demo: boolean;
      bid_count: number;
    }>;
    totalBids: number;
    orders: Array<{
      id: string;
      final_price: number;
      platform_fee: number;
      status: string;
    }>;
    fraudAlerts: FraudAlertItem[];
    verifications: SellerVerificationItem[];
    disputes: DisputeItem[];
    auditLogs: Array<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      created_at: string;
    }>;
    platformSettings: Record<string, number>;
  };
}

export function AdminDashboardClient({ user, data }: AdminDashboardClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<
    'overview' | 'verifications' | 'fraud' | 'disputes' | 'moderation' | 'audit'
  >('overview');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState(data.platformSettings);

  const biddersCount = data.profiles.filter((p) => p.role === 'bidder').length;
  const sellersCount = data.profiles.filter((p) => p.role === 'seller').length;
  const activeAuctions = data.auctions.filter((a) => a.status === 'active').length;
  const completedAuctions = data.auctions.filter((a) => a.status === 'ended').length;
  const paidOrders = data.orders.filter((o) =>
    ['paid', 'shipped', 'delivered'].includes(o.status)
  );
  const gmv = paidOrders.reduce((s, o) => s + o.final_price, 0);
  const feeRev = paidOrders.reduce((s, o) => s + o.platform_fee, 0);

  async function adminAction(payload: Record<string, unknown>, successText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMsg(successText);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-white/80">
              <Shield className="h-3.5 w-3.5" />
              Protected Administrator Command Center
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Platform Governance, ShieldGuard &amp; Trust Operations
            </h1>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['overview', 'Overview'],
                ['verifications', `Verifications (${data.verifications.length})`],
                ['fraud', `ShieldGuard Alerts (${data.fraudAlerts.length})`],
                ['disputes', `Disputes (${data.disputes.length})`],
                ['moderation', 'Users & Moderation'],
                ['audit', 'Audit History'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  tab === id
                    ? 'border-white/40 bg-[#e2e4e8] text-neutral-950'
                    : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/35'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {msg ? (
          <div className="rounded-2xl border border-white/25 bg-white/[0.06] px-4 py-2.5 text-xs text-white/85">
            {msg}
          </div>
        ) : null}

        {tab === 'overview' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {[
                ['Registered Users', String(data.profiles.length)],
                ['Active Bidders', String(biddersCount)],
                ['Active Sellers', String(sellersCount)],
                ['Total Auctions', String(data.auctions.length)],
                ['Active Auctions', String(activeAuctions)],
                ['Completed Auctions', String(completedAuctions)],
                ['Total Bids', String(data.totalBids)],
                ['Paid Orders', String(paidOrders.length)],
                ['Settled GMV', formatINR(gmv)],
                ['Platform Fee Rev', formatINR(feeRev)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-2xl border border-white/15 bg-[#0e1015]/85 p-4 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/50">{k}</p>
                  <p className="mt-1 text-xl font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>

            {/* Platform Settings */}
            <section className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-6 space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Settings className="h-4 w-4" />
                Platform Anti-Sniping &amp; Fee Policy
              </h2>
              <div className="grid gap-3 sm:grid-cols-5 text-xs">
                {[
                  ['default_window_sec', 'Trigger Window (sec)'],
                  ['default_extend_sec', 'Extension (sec)'],
                  ['default_max_extensions', 'Max Extensions'],
                  ['platform_fee_percent', 'Escrow Fee (%)'],
                  ['gst_percent', 'Fee GST (%)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-white/60">{label}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings[key] ?? 0}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value),
                        }))
                      }
                      className="h-10 w-full rounded-full border border-white/20 bg-black/40 px-3 text-white"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  adminAction(
                    { action: 'update_platform_settings', settings },
                    'Platform policy settings saved.'
                  )
                }
                className="smoky-cta-btn h-10 cursor-pointer rounded-full px-5 text-xs font-semibold text-white"
              >
                Save Platform Policy
              </button>
            </section>
          </div>
        ) : null}

        {tab === 'verifications' ? (
          <section className="space-y-3">
            {data.verifications.length > 0 ? (
              data.verifications.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#0e1015]/90 p-5 text-xs"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {v.business_name} ({v.seller_name})
                    </p>
                    <p className="mt-0.5 text-white/65">
                      {v.government_id_type}: {v.document_reference} &bull; Status:{' '}
                      <strong className="uppercase">{v.status}</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'review_verification',
                            sellerId: v.seller_id,
                            status: 'verified',
                            reviewNotes: 'Identity verified by SnipeShield Admin.',
                          },
                          'Seller marked Verified.'
                        )
                      }
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-white/25 bg-white/[0.06] px-3 font-medium text-white/85"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'review_verification',
                            sellerId: v.seller_id,
                            status: 'rejected',
                            reviewNotes: 'Document unclear or mismatched.',
                          },
                          'Verification rejected.'
                        )
                      }
                      className="h-8 cursor-pointer rounded-full border border-rose-300/35 bg-rose-950/50 px-3 font-medium text-rose-100"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-white/60">No pending seller verification requests.</p>
            )}
          </section>
        ) : null}

        {tab === 'fraud' ? (
          <section className="space-y-3">
            {data.fraudAlerts.length > 0 ? (
              data.fraudAlerts.map((f) => (
                <div
                  key={f.id}
                  className="rounded-3xl border border-white/15 bg-[#0e1015]/90 p-5 text-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold text-white">
                      <AlertOctagon className="h-4 w-4 text-white/80" />
                      {f.signal_type} &bull; Risk Score {f.risk_score}/100 ({f.severity})
                    </span>
                    <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] uppercase">
                      {f.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-white/75">
                    User: {f.user_name} &bull; {f.description}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'review_fraud_alert',
                            alertId: f.id,
                            status: 'false_positive',
                            resolutionNotes: 'Reviewed and cleared as benign burst.',
                          },
                          'Marked false positive.'
                        )
                      }
                      className="h-8 cursor-pointer rounded-full border border-white/25 bg-white/10 px-3 text-white"
                    >
                      Mark False Positive
                    </button>
                    {f.user_id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          adminAction(
                            {
                              action: 'review_fraud_alert',
                              alertId: f.id,
                              status: 'confirmed_action',
                              targetUserId: f.user_id,
                              suspendUser: true,
                              resolutionNotes: 'Confirmed abuse; account suspended.',
                            },
                            'Account suspended after admin confirmation.'
                          )
                        }
                        className="h-8 cursor-pointer rounded-full border border-rose-300/35 bg-rose-950/60 px-3 text-rose-100"
                      >
                        Confirm &amp; Restrict User
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-white/60">No ShieldGuard alerts logged.</p>
            )}
          </section>
        ) : null}

        {tab === 'disputes' ? (
          <section className="space-y-3">
            {data.disputes.length > 0 ? (
              data.disputes.map((d) => (
                <div
                  key={d.id}
                  className="rounded-3xl border border-white/15 bg-[#0e1015]/90 p-5 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold text-white">
                      <Scale className="h-4 w-4" />
                      {d.reason}
                    </span>
                    <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] uppercase">
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-white/70">{d.description}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'resolve_dispute',
                            disputeId: d.id,
                            orderId: d.order_id,
                            status: 'resolved_refund',
                            resolution: 'Admin approved buyer refund.',
                          },
                          'Dispute resolved with refund.'
                        )
                      }
                      className="h-8 cursor-pointer rounded-full border border-white/25 bg-white/[0.06] px-3 text-white/85"
                    >
                      <CheckCircle2 className="mr-1 inline h-3 w-3" /> Refund Buyer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'resolve_dispute',
                            disputeId: d.id,
                            orderId: d.order_id,
                            status: 'resolved_release',
                            resolution: 'Admin released funds to seller.',
                          },
                          'Dispute resolved; funds released.'
                        )
                      }
                      className="h-8 cursor-pointer rounded-full border border-white/25 bg-white/10 px-3 text-white"
                    >
                      Release to Seller
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-white/60">No disputes awaiting resolution.</p>
            )}
          </section>
        ) : null}

        {tab === 'moderation' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Gavel className="h-4 w-4" /> Auction Moderation
              </h2>
              {data.auctions.slice(0, 15).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{a.title}</p>
                    <p className="text-[11px] text-white/55">
                      {a.category} &bull; {a.moderation_status} &bull; {formatINR(a.current_price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'moderate_auction',
                            auctionId: a.id,
                            moderationStatus: 'flagged',
                            reason: 'Flagged for manual compliance review.',
                          },
                          'Auction flagged.'
                        )
                      }
                      className="h-7 cursor-pointer rounded-full border border-white/20 px-2.5 text-[11px] text-white/80"
                    >
                      Flag
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'moderate_auction',
                            auctionId: a.id,
                            moderationStatus: 'removed',
                            reason: 'Removed by moderator.',
                          },
                          'Auction removed.'
                        )
                      }
                      className="h-7 cursor-pointer rounded-full border border-rose-300/35 px-2.5 text-[11px] text-rose-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Users className="h-4 w-4" /> Registered Accounts
              </h2>
              {data.profiles.slice(0, 20).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {p.full_name || p.email} {p.is_demo ? '(DEMO)' : ''}
                    </p>
                    <p className="text-[11px] text-white/55">
                      {p.role} &bull; {p.verification_status} &bull;{' '}
                      {p.is_suspended ? 'SUSPENDED' : 'Active'}
                    </p>
                  </div>
                  {p.role !== 'admin' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        adminAction(
                          {
                            action: 'toggle_suspension',
                            targetUserId: p.id,
                            suspend: !p.is_suspended,
                          },
                          p.is_suspended ? 'Account reinstated.' : 'Account suspended.'
                        )
                      }
                      className="h-7 shrink-0 cursor-pointer rounded-full border border-white/25 px-3 text-[11px] text-white"
                    >
                      {p.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {tab === 'audit' ? (
          <section className="rounded-[28px] border border-white/15 bg-[#0e1015]/90 p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Audit Logs</h2>
            <ul className="space-y-2 text-xs">
              {data.auditLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5"
                >
                  <span>
                    <strong className="text-white">{log.action}</strong>{' '}
                    <span className="text-white/60">
                      ({log.entity_type} {log.entity_id ?? ''})
                    </span>
                  </span>
                  <span className="text-white/50">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
