'use client';

import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LegalModal, type LegalDocumentType } from '@/components/auth/LegalModal';

interface SiteFooterProps {
  sellHref?: string;
}

export function SiteFooter({ sellHref = '/seller/create-listing' }: SiteFooterProps) {
  const [legalDoc, setLegalDoc] = useState<LegalDocumentType | null>(null);

  return (
    <>
      <footer className="border-t border-white/10 bg-[#07080b] text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.45fr_0.85fr_0.9fr_1.25fr_0.95fr] lg:gap-8">
            {/* 1. Brand Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/snipe-shield-logo.webp"
                  alt="SnipeShield"
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-md object-contain"
                />
                <span className="text-base font-semibold tracking-tight text-white">
                  SnipeShield
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
                  DedSec
                </span>
              </div>

              <p className="max-w-xs text-xs leading-relaxed text-white/55">
                A modern online auction platform where users can list products, discover curated
                finds, and participate in competitive, anti-snipe protected live bidding.
              </p>
            </div>

            {/* 2. Quick Navigation */}
            <div className="space-y-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                Quick Navigation
              </h3>
              <ul className="space-y-2.5 text-xs text-white/55">
                <li>
                  <Link href="/" className="transition hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="transition hover:text-white">
                    Browse Auctions
                  </Link>
                </li>
                <li>
                  <Link href="/#live-auctions" className="transition hover:text-white">
                    Live Auctions
                  </Link>
                </li>
                <li>
                  <Link href="/analytics" className="transition hover:text-white">
                    Bid Intelligence
                  </Link>
                </li>
                <li>
                  <a href="#contact-developers" className="transition hover:text-white">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>

            {/* 3. Auction Information */}
            <div className="space-y-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                Auction Information
              </h3>
              <ul className="space-y-2.5 text-xs text-white/55">
                <li>
                  <Link href="/#how-it-works" className="transition hover:text-white">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/#featured-auctions" className="transition hover:text-white">
                    Featured Lots
                  </Link>
                </li>
                <li>
                  <Link href={sellHref} className="transition hover:text-white">
                    Sell an Item
                  </Link>
                </li>
                <li>
                  <Link href="/autobid" className="transition hover:text-white">
                    AutoBid AI
                  </Link>
                </li>
                <li>
                  <Link href="/compare" className="transition hover:text-white">
                    Compare Items
                  </Link>
                </li>
              </ul>
            </div>

            {/* 4. Contact the Developers */}
            <div id="contact-developers" className="space-y-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                Contact the Developers
              </h3>
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[11px] font-semibold text-white/90">Developer 1</p>
                  <div className="mt-1.5 space-y-1 text-white/60">
                    <a
                      href="mailto:joelkazhudadiyil@gmail.com"
                      className="flex items-center gap-2 break-all transition hover:text-white"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
                      <span>joelkazhudadiyil@gmail.com</span>
                    </a>
                    <a
                      href="tel:+918431646115"
                      className="flex items-center gap-2 tabular-nums transition hover:text-white"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
                      <span>+91 8431646115</span>
                    </a>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[11px] font-semibold text-white/90">Developer 2</p>
                  <div className="mt-1.5 space-y-1 text-white/60">
                    <a
                      href="mailto:chinmayhj2007@gmail.com"
                      className="flex items-center gap-2 break-all transition hover:text-white"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
                      <span>chinmayhj2007@gmail.com</span>
                    </a>
                    <a
                      href="tel:+917892741541"
                      className="flex items-center gap-2 tabular-nums transition hover:text-white"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
                      <span>+91 7892741541</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Legal & Policies */}
            <div className="space-y-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                Legal &amp; Policies
              </h3>
              <ul className="space-y-2.5 text-xs text-white/55">
                <li>
                  <button
                    type="button"
                    onClick={() => setLegalDoc('privacy')}
                    className="cursor-pointer text-left transition hover:text-white"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setLegalDoc('terms')}
                    className="cursor-pointer text-left transition hover:text-white"
                  >
                    Terms &amp; Conditions
                  </button>
                </li>
                <li>
                  <Link href="/orders" className="transition hover:text-white">
                    Escrow &amp; Order Protection
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* 6. Bottom Copyright Bar */}
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.08] pt-6 text-xs text-white/45 sm:flex-row sm:items-center">
            <p>&copy; 2026 SnipeShield. All Rights Reserved.</p>
            <p className="text-white/50">Built with DedSec</p>
          </div>
        </div>
      </footer>

      <LegalModal
        documentType={legalDoc}
        onClose={() => setLegalDoc(null)}
        onAccept={() => setLegalDoc(null)}
      />
    </>
  );
}
