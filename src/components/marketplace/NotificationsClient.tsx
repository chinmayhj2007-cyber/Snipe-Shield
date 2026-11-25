'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import type { MarketplaceUser, NotificationItem } from '@/lib/marketplace/types';

interface NotificationsClientProps {
  user: MarketplaceUser;
  initialNotifications: NotificationItem[];
  initialPrefs: {
    in_app_bids: boolean;
    in_app_outbid: boolean;
    in_app_ending_soon: boolean;
    email_enabled: boolean;
  };
}

export function NotificationsClient({
  user,
  initialNotifications,
  initialPrefs,
}: NotificationsClientProps) {
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
  }

  async function markOneRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', notificationId: id }),
    });
  }

  async function togglePref(key: keyof typeof prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_prefs', preferences: next }),
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Notification Center
            </h1>
            <p className="mt-1 text-xs text-white/65">
              Real-time bid alerts, outbid notifications, AutoBid updates, extensions &amp; orders.
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 text-xs font-medium text-white hover:border-white/40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark All Read
          </button>
        </div>

        {/* Preferences */}
        <section className="rounded-[28px] border border-white/15 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/75">
              Notification Preferences
            </h2>
            {savingPrefs ? <span className="text-[11px] text-white/50">Saving...</span> : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {(
              [
                ['in_app_bids', 'Bid Activity'],
                ['in_app_outbid', 'Outbid Alerts'],
                ['in_app_ending_soon', 'Watchlist Ending Soon'],
                ['email_enabled', 'Email Summaries'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/15 bg-black/30 px-3.5 py-2.5"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  className="accent-white"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Notification List */}
        {items.length > 0 ? (
          <ul className="space-y-2.5">
            {items.map((n) => (
              <li
                key={n.id}
                onClick={() => (!n.is_read ? void markOneRead(n.id) : undefined)}
                className={`rounded-3xl border p-4 transition ${
                  n.is_read
                    ? 'border-white/10 bg-[#0e1015]/70 text-white/70'
                    : 'border-white/25 bg-white/[0.06] text-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {!n.is_read ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-white/60">
                      {n.type}
                    </span>
                  </div>
                  <span className="text-[11px] text-white/45">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/75">{n.message}</p>
                {n.link ? (
                  <Link href={n.link} className="mt-2 inline-block text-xs font-medium text-white underline">
                    Open Details →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/80 p-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-white/45" />
            <p className="mt-3 text-sm font-medium text-white">No notifications yet</p>
          </div>
        )}
      </main>
    </div>
  );
}
