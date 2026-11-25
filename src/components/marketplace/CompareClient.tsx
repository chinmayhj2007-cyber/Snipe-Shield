'use client';

import { BadgeCheck, GitCompare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { calculateTrueCost } from '@/lib/marketplace/intelligence';
import { type AuctionItem, formatINR, type MarketplaceUser } from '@/lib/marketplace/types';

interface CompareClientProps {
  user: MarketplaceUser;
  allAuctions: AuctionItem[];
}

export function CompareClient({ user, allAuctions }: CompareClientProps) {
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('snipeshield_compare_ids');
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      setCompareIds(Array.isArray(ids) ? ids : []);
    } catch {
      setCompareIds([]);
    }
  }, []);

  const selected = useMemo(
    () => allAuctions.filter((a) => compareIds.includes(a.id)),
    [allAuctions, compareIds]
  );

  function removeId(id: string) {
    const next = compareIds.filter((c) => c !== id);
    setCompareIds(next);
    localStorage.setItem('snipeshield_compare_ids', JSON.stringify(next));
    window.dispatchEvent(new Event('snipeshield-compare-change'));
  }

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Item Comparison
            </h1>
            <p className="mt-1 text-xs text-white/65">
              Compare price, condition, seller TrustScore, shipping, and estimated TrueCost side by side.
            </p>
          </div>
          <Link
            href={user.role === 'seller' ? '/seller/home' : '/bidder/home'}
            className="smoky-cta-btn inline-flex h-10 items-center rounded-xl px-5 text-xs font-medium text-white"
          >
            Add More Items
          </Link>
        </div>

        {selected.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0d1016]/90 p-5">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-4 text-white/55">Attribute</th>
                  {selected.map((item) => (
                    <th key={item.id} className="px-3 py-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/auctions/${item.id}`}
                          className="text-sm font-semibold text-white hover:underline"
                        >
                          {item.title}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeId(item.id)}
                          aria-label="Remove item"
                          className="cursor-pointer rounded-full p-1 text-white/50 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                <tr>
                  <td className="py-3 pr-4 text-white/55">Current Bid</td>
                  {selected.map((item) => (
                    <td key={item.id} className="px-3 py-3 font-semibold text-white">
                      {formatINR(item.current_price)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white/55">Est. TrueCost Total</td>
                  {selected.map((item) => {
                    const tc = calculateTrueCost(item.current_price, item.shipping_cost ?? 0);
                    return (
                      <td key={item.id} className="px-3 py-3 font-semibold text-emerald-200">
                        {formatINR(tc.totalPayable)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white/55">Condition</td>
                  {selected.map((item) => (
                    <td key={item.id} className="px-3 py-3">{item.condition}</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white/55">Seller &amp; TrustScore</td>
                  {selected.map((item) => (
                    <td key={item.id} className="px-3 py-3">
                      <span className="inline-flex items-center gap-1">
                        {item.seller_name}
                        {item.seller_verified ? (
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
                        ) : null}
                      </span>
                      <span className="block text-[11px] text-white/55">
                        TrustScore: {item.seller_trust_score ?? 50}/100
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white/55">Shipping</td>
                  {selected.map((item) => (
                    <td key={item.id} className="px-3 py-3">
                      {item.shipping_cost ? formatINR(item.shipping_cost) : 'Free'} &bull;{' '}
                      {item.delivery_info || 'Standard tracked'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white/55">Ends At</td>
                  {selected.map((item) => (
                    <td key={item.id} className="px-3 py-3">
                      {new Date(item.ends_at).toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[28px] border border-white/15 bg-[#0e1015]/85 p-12 text-center">
            <GitCompare className="mx-auto h-8 w-8 text-white/45" />
            <h2 className="mt-3 text-base font-semibold text-white">
              No Items Selected for Comparison
            </h2>
            <p className="mt-1 text-xs text-white/60">
              Click the compare icon on any auction card to compare up to 4 items side by side.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
