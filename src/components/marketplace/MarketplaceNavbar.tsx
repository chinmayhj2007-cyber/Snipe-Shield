'use client';

import {
  BarChart3,
  Bell,
  Bookmark,
  Bot,
  Gavel,
  GitCompare,
  Home,
  Menu,
  Package,
  Plus,
  Search,
  Shield,
  Store,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { MarketplaceUser, NotificationItem } from '@/lib/marketplace/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface MarketplaceNavbarProps {
  user: MarketplaceUser;
}

export function MarketplaceNavbar({ user }: MarketplaceNavbarProps) {
  const pathname = usePathname();
  const isSeller = user.role === 'seller';
  const isAdmin = user.role === 'admin';
  const homeHref = isAdmin ? '/admin' : isSeller ? '/seller/home' : '/bidder/home';
  const savedHref = isSeller ? '/seller/saved' : '/bidder/saved';
  const isOnHome = pathname === '/bidder/home' || pathname === '/seller/home';

  const initial = user.displayName.trim().charAt(0).toUpperCase() || 'S';

  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [compareCount, setCompareCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setBellOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!bellOpen) return;
    function handleOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [bellOpen]);

  useEffect(() => {
    let active = true;
    async function loadNotifs() {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const data = (await res.json()) as { notifications?: NotificationItem[] };
        if (!active || !data.notifications) return;
        setRecentNotifications(data.notifications.slice(0, 6));
        setUnreadCount(data.notifications.filter((n) => !n.is_read).length);
      } catch {
        // non-blocking
      }
    }
    void loadNotifs();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`nav-notifs-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const item = payload.new as NotificationItem;
          setRecentNotifications((prev) => [item, ...prev].slice(0, 6));
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user.id]);

  useEffect(() => {
    function syncCompare() {
      try {
        const raw = localStorage.getItem('snipeshield_compare_ids');
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        setCompareCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setCompareCount(0);
      }
    }
    syncCompare();
    window.addEventListener('snipeshield-compare-change', syncCompare);
    return () => window.removeEventListener('snipeshield-compare-change', syncCompare);
  }, []);

  async function handleMarkAllRead() {
    setUnreadCount(0);
    setRecentNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    }).catch(() => {});
  }

  function handleSearchNavClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isOnHome) return;
    const searchEl = document.getElementById('unified-auction-search') as HTMLInputElement | null;
    if (searchEl) {
      e.preventDefault();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchEl.focus({ preventScroll: true });
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090b0f]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        {/* Left: Snipe Shield logo & brand */}
        <Link
          href={homeHref}
          prefetch
          className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/snipe-shield-logo.webp"
            alt="Snipe Shield"
            width={32}
            height={32}
            decoding="async"
            className="h-8 w-8 rounded-lg object-contain"
          />
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium italic tracking-tight text-white">
              Snipe Shield
            </span>
            <span
              className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:inline-flex ${
                isAdmin
                  ? 'border-white/30 bg-white/15 text-white'
                  : isSeller
                    ? 'border-white/35 bg-[#e2e4e8] text-neutral-950'
                    : 'border-white/15 bg-white/10 text-white/90'
              }`}
            >
              {isAdmin ? (
                <Shield className="h-2.5 w-2.5" aria-hidden="true" />
              ) : isSeller ? (
                <Store className="h-2.5 w-2.5" aria-hidden="true" />
              ) : (
                <Gavel className="h-2.5 w-2.5" aria-hidden="true" />
              )}
              {isAdmin ? 'Admin' : isSeller ? 'Seller' : 'Bidder'}
            </span>
          </div>
        </Link>

        {/* Right: Desktop Navigation + Mobile Controls */}
        <div className="flex items-center gap-1.5">
          <nav aria-label="Primary navigation" className="hidden items-center gap-1.5 md:flex">
            <Link
              href={homeHref}
              prefetch
              aria-label="Home"
              aria-current={isOnHome ? 'page' : undefined}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                isOnHome
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Home</span>
            </Link>

            <Link
              href="/search"
              prefetch
              onClick={handleSearchNavClick}
              aria-label="Search"
              aria-current={pathname === '/search' ? 'page' : undefined}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                pathname === '/search'
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Search</span>
            </Link>

            {!isAdmin ? (
              <Link
                href={savedHref}
                prefetch
                aria-label="Saved"
                aria-current={pathname === savedHref ? 'page' : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                  pathname === savedHref
                    ? 'border-white/30 bg-white/12 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden xl:inline">Saved</span>
              </Link>
            ) : null}

            {!isSeller && !isAdmin ? (
              <Link
                href="/autobid"
                prefetch
                aria-label="AutoBid AI"
                aria-current={pathname === '/autobid' ? 'page' : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                  pathname === '/autobid'
                    ? 'border-white/30 bg-white/12 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden lg:inline">AutoBid</span>
              </Link>
            ) : null}

            <Link
              href="/compare"
              prefetch
              aria-label="Compare items"
              aria-current={pathname === '/compare' ? 'page' : undefined}
              className={`relative flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                pathname === '/compare'
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <GitCompare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Compare</span>
              {compareCount > 0 ? (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#e2e4e8] px-1 text-[10px] font-bold text-neutral-950">
                  {compareCount}
                </span>
              ) : null}
            </Link>

            <Link
              href="/orders"
              prefetch
              aria-label="Orders and Payments"
              aria-current={pathname === '/orders' ? 'page' : undefined}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                pathname === '/orders'
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Orders</span>
            </Link>

            <Link
              href="/analytics"
              prefetch
              aria-label="Analytics"
              aria-current={pathname === '/analytics' ? 'page' : undefined}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                pathname === '/analytics'
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Analytics</span>
            </Link>

            {isSeller ? (
              <Link
                href="/seller/create-listing"
                prefetch
                aria-label="Sell New Item"
                aria-current={pathname === '/seller/create-listing' ? 'page' : undefined}
                className={`smoky-cta-btn flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-white transition ${
                  pathname === '/seller/create-listing' ? 'ring-2 ring-white/40' : ''
                }`}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Sell</span>
              </Link>
            ) : null}

            {isAdmin ? (
              <Link
                href="/admin"
                prefetch
                aria-label="Admin Console"
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                  pathname === '/admin'
                    ? 'border-white/40 bg-white/15 text-white'
                    : 'border-white/20 bg-white/10 text-white hover:border-white/40'
                }`}
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Admin</span>
              </Link>
            ) : null}
          </nav>

          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notifications"
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/80 transition hover:border-white/30 hover:text-white"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-neutral-950">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </button>

            {bellOpen ? (
              <div className="fixed inset-x-4 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-white/15 bg-[#0d1016]/95 p-3 shadow-2xl backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-semibold text-white">Notifications</span>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="cursor-pointer text-[11px] text-white/65 hover:text-white"
                      >
                        Mark all read
                      </button>
                    ) : null}
                    <Link
                      href="/notifications"
                      onClick={() => setBellOpen(false)}
                      className="text-[11px] font-medium text-[#e2e4e8] underline"
                    >
                      View all
                    </Link>
                  </div>
                </div>

                {recentNotifications.length > 0 ? (
                  <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                    {recentNotifications.map((n) => (
                      <li key={n.id}>
                        <Link
                          href={n.link || '/notifications'}
                          onClick={() => setBellOpen(false)}
                          className={`block rounded-xl border px-3 py-2 text-xs transition ${
                            n.is_read
                              ? 'border-white/10 bg-white/[0.02] text-white/65'
                              : 'border-white/25 bg-white/[0.07] text-white'
                          }`}
                        >
                          <p className="font-medium">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-white/60">
                            {n.message}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-xs text-white/55">
                    No notifications yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <Link
            href="/profile"
            prefetch
            aria-label="Profile"
            aria-current={pathname === '/profile' ? 'page' : undefined}
            className={`flex h-9 items-center gap-2 rounded-full border pl-1.5 pr-2.5 text-xs font-medium transition ${
              pathname === '/profile'
                ? 'border-white/35 bg-white/15 text-white'
                : 'border-white/15 bg-white/[0.03] text-white/85 hover:border-white/30 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold text-white">
              {initial || <User className="h-3.5 w-3.5" />}
            </span>
            <span className="hidden max-w-[90px] truncate lg:inline">
              {user.displayName}
            </span>
          </Link>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/80 transition hover:border-white/30 hover:text-white md:hidden"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Drawer */}
      {mobileMenuOpen ? (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-white/10 bg-[#0b0d12]/95 px-4 py-3 backdrop-blur-2xl md:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={homeHref}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                isOnHome
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/75'
              }`}
            >
              <Home className="h-4 w-4" /> Home
            </Link>
            <Link
              href="/search"
              onClick={handleSearchNavClick}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                pathname === '/search'
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/75'
              }`}
            >
              <Search className="h-4 w-4" /> Search
            </Link>
            {!isAdmin ? (
              <Link
                href={savedHref}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                  pathname === savedHref
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/75'
                }`}
              >
                <Bookmark className="h-4 w-4" /> Saved
              </Link>
            ) : null}
            {!isSeller && !isAdmin ? (
              <Link
                href="/autobid"
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                  pathname === '/autobid'
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-white/75'
                }`}
              >
                <Bot className="h-4 w-4" /> AutoBid AI
              </Link>
            ) : null}
            <Link
              href="/compare"
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-medium ${
                pathname === '/compare'
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/75'
              }`}
            >
              <span className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" /> Compare
              </span>
              {compareCount > 0 ? (
                <span className="rounded-full bg-[#e2e4e8] px-1.5 py-0.5 text-[10px] font-bold text-neutral-950">
                  {compareCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/orders"
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                pathname === '/orders'
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/75'
              }`}
            >
              <Package className="h-4 w-4" /> Orders
            </Link>
            <Link
              href="/analytics"
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                pathname === '/analytics'
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/75'
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Analytics
            </Link>
            {isSeller ? (
              <Link
                href="/seller/create-listing"
                className="smoky-cta-btn col-span-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Sell New Item
              </Link>
            ) : null}
            {isAdmin ? (
              <Link
                href="/admin"
                className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white"
              >
                <Shield className="h-4 w-4" /> Admin Console
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
