'use client';

import {
  ArrowLeft,
  AlertTriangle,
  Camera,
  Eye,
  ImagePlus,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { AuctionCard } from '@/components/marketplace/AuctionCard';
import { MarketplaceNavbar } from '@/components/marketplace/MarketplaceNavbar';
import { ShinyButton } from '@/components/ui/shiny-button';
import {
  AUCTION_CATEGORIES,
  AUCTION_CONDITIONS,
  requiresConditionProof,
  type AuctionItem,
  type MarketplaceUser,
} from '@/lib/marketplace/types';

interface CreateListingFormProps {
  user: MarketplaceUser;
}

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function safeIsoString(value: string, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
}

export function CreateListingForm({ user }: CreateListingFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const proofFileInputRef = useRef<HTMLInputElement | null>(null);
  const publishInFlightRef = useRef(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(AUCTION_CATEGORIES[0].id);
  const [condition, setCondition] = useState<string>(AUCTION_CONDITIONS[0]);
  const [defectDescription, setDefectDescription] = useState('');
  const [conditionProofUrls, setConditionProofUrls] = useState<string[]>([]);
  const [uploadingProofImages, setUploadingProofImages] = useState(false);
  const [startingPrice, setStartingPrice] = useState('5000');
  const [minIncrement, setMinIncrement] = useState('250');
  const [reservePrice, setReservePrice] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [shippingDetails, setShippingDetails] = useState(
    'Insured tracked courier dispatch within 48 hours of payment.'
  );
  const [deliveryInfo, setDeliveryInfo] = useState('Pan-India delivery in 3-5 business days.');
  const [returnPolicy, setReturnPolicy] = useState(
    '7-day SnipeShield escrow protection if item differs from description.'
  );
  const [antiSnipeWindowSec, setAntiSnipeWindowSec] = useState('30');
  const [antiSnipeExtendSec, setAntiSnipeExtendSec] = useState('30');
  const [maxExtensions, setMaxExtensions] = useState('10');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  const [uploadingImages, setUploadingImages] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    setStartsAt((prev) => prev || toLocalDateTimeInput(start));
    setEndsAt((prev) => prev || toLocalDateTimeInput(end));
  }, []);

  async function handleImageSelection(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (imageUrls.length + files.length > 5) {
      setErrorMessage('You can upload up to 5 product images per auction.');
      return;
    }

    setErrorMessage(null);
    setUploadingImages(true);

    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/seller/upload-image', {
          method: 'POST',
          body: fd,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setErrorMessage(data.error ?? 'Failed to upload one of the images.');
          break;
        }
        uploaded.push(data.url);
      }

      if (uploaded.length > 0) {
        setImageUrls((prev) => [...prev, ...uploaded]);
      }
    } catch {
      setErrorMessage('Network error while uploading image.');
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function removeImage(urlToRemove: string) {
    setImageUrls((prev) => prev.filter((u) => u !== urlToRemove));
  }

  async function handleProofImageSelection(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (conditionProofUrls.length + files.length > 6) {
      setErrorMessage('You can upload up to 6 condition evidence images.');
      return;
    }

    setErrorMessage(null);
    setUploadingProofImages(true);

    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/seller/upload-image', {
          method: 'POST',
          body: fd,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setErrorMessage(data.error ?? 'Failed to upload one of the evidence images.');
          break;
        }
        uploaded.push(data.url);
      }

      if (uploaded.length > 0) {
        setConditionProofUrls((prev) => [...prev, ...uploaded]);
      }
    } catch {
      setErrorMessage('Network error while uploading condition proof image.');
    } finally {
      setUploadingProofImages(false);
      if (proofFileInputRef.current) {
        proofFileInputRef.current.value = '';
      }
    }
  }

  function removeProofImage(urlToRemove: string) {
    setConditionProofUrls((prev) => prev.filter((u) => u !== urlToRemove));
  }

  function replaceProofImage(index: number) {
    // Prompt user to select replacement
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadingProofImages(true);
      setErrorMessage(null);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/seller/upload-image', {
          method: 'POST',
          body: fd,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setErrorMessage(data.error ?? 'Failed to upload replacement image.');
          return;
        }
        setConditionProofUrls((prev) => {
          const next = [...prev];
          next[index] = data.url!;
          return next;
        });
      } catch {
        setErrorMessage('Network error while replacing proof image.');
      } finally {
        setUploadingProofImages(false);
      }
    };
    input.click();
  }

  async function handlePublish(e?: FormEvent) {
    e?.preventDefault();
    if (publishInFlightRef.current || publishing || uploadingImages || uploadingProofImages) return;
    setErrorMessage(null);

    const startNum = Number(startingPrice);
    const incNum = Number(minIncrement);
    const resNum = reservePrice.trim() ? Number(reservePrice) : null;
    const shipNum = Number(shippingCost) || 0;

    if (title.trim().length < 4) {
      setErrorMessage('Please enter an item title (at least 4 characters).');
      return;
    }
    if (description.trim().length < 15) {
      setErrorMessage('Please write a detailed description (at least 15 characters).');
      return;
    }

    // Condition evidence & defect description validation
    if (requiresConditionProof(condition)) {
      if (conditionProofUrls.length < 2) {
        setErrorMessage(
          `Condition "${condition}" requires at least 2 damage/condition evidence images. You currently have ${conditionProofUrls.length}.`
        );
        return;
      }
      if (conditionProofUrls.length > 6) {
        setErrorMessage(
          `Condition "${condition}" allows a maximum of 6 damage/condition evidence images.`
        );
        return;
      }
      if (!defectDescription.trim() || defectDescription.trim().length < 5) {
        setErrorMessage(
          'Please describe the product condition and explain any scratches, dents, broken components, or missing accessories (at least 5 characters).'
        );
        return;
      }
    }
    if (!Number.isFinite(startNum) || startNum < 1) {
      setErrorMessage('Starting bid price must be at least ₹1.');
      return;
    }
    if (!Number.isFinite(incNum) || incNum < 1) {
      setErrorMessage('Minimum bid increment must be at least ₹1.');
      return;
    }
    if (resNum !== null && (!Number.isFinite(resNum) || resNum < startNum)) {
      setErrorMessage('Optional reserve price must be equal to or higher than starting bid.');
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setErrorMessage('Please select valid start and end dates.');
      return;
    }
    if (endDate.getTime() <= Date.now()) {
      setErrorMessage('Auction end time must be in the future.');
      return;
    }
    if (endDate.getTime() <= startDate.getTime() + 5 * 60 * 1000) {
      setErrorMessage('Auction end time must be at least 5 minutes after start time.');
      return;
    }

    publishInFlightRef.current = true;
    setPublishing(true);

    try {
      const res = await fetch('/api/seller/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          condition,
          defectDescription: defectDescription.trim() || undefined,
          conditionProofUrls: conditionProofUrls,
          startingPrice: startNum,
          minIncrement: incNum,
          reservePrice: resNum,
          shippingCost: shipNum,
          shippingDetails,
          deliveryInfo,
          returnPolicy,
          antiSnipeWindowSec: Number(antiSnipeWindowSec) || 30,
          antiSnipeExtendSec: Number(antiSnipeExtendSec) || 30,
          maxExtensions: Number(maxExtensions) || 10,
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          imageUrls,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setErrorMessage(data.error ?? 'Unable to publish listing.');
        return;
      }

      router.push(`/auctions/${data.id}`);
    } catch {
      setErrorMessage('Network error while publishing auction.');
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  }

  const previewAuction: AuctionItem = {
    id: 'preview',
    seller_id: user.id,
    seller_name: user.displayName,
    seller_verified: user.verificationStatus === 'verified',
    seller_trust_score: user.trustScore ?? 50,
    title: title.trim() || 'Untitled Item',
    description:
      description.trim() || 'Your detailed item description will appear here for bidders.',
    category,
    condition,
    image_url: imageUrls[0] ?? null,
    image_urls: imageUrls,
    starting_price: Number(startingPrice) || 5000,
    current_price: Number(startingPrice) || 5000,
    min_increment: Number(minIncrement) || 250,
    reserve_price: reservePrice.trim() ? Number(reservePrice) : null,
    highest_bidder_id: null,
    highest_bidder_name: null,
    status: 'active',
    starts_at: safeIsoString(startsAt, '1970-01-01T00:00:00.000Z'),
    ends_at: safeIsoString(endsAt, '1970-01-02T00:00:00.000Z'),
    extensions_count: 0,
    created_at: safeIsoString(startsAt, '1970-01-01T00:00:00.000Z'),
    bid_count: 0,
  };

  return (
    <div className="smoky-ambient-page min-h-dvh text-white">
      <MarketplaceNavbar user={user} />

      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/seller/home"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition hover:border-white/35 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Seller Studio
          </Link>

          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/10"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {showPreview ? 'Hide Preview' : 'Preview Listing'}
          </button>
        </div>

        <div className={`grid gap-7 ${showPreview ? 'lg:grid-cols-[1.45fr_1fr]' : ''}`}>
          <form
            onSubmit={handlePublish}
            className="smoky-glass-card rounded-[34px] border border-white/20 p-6 backdrop-blur-2xl sm:p-8"
          >
            <div className="relative z-10 space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/80">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  SnipeShield Listing Studio &bull; Asset Passport Ready
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  Sell New Item
                </h1>
                <p className="mt-1 text-xs text-white/65">
                  Configure reserve pricing, shipping &amp; return policies, and FAIRClose
                  anti-sniping rules. You can attach Asset Passport documents after publishing.
                </p>
              </div>

              {/* Multi-image Upload */}
              <div>
                <label className="mb-2 block pl-1 text-xs font-medium text-white/85">
                  Product Images (Up to 5 &bull; JPG, PNG, WEBP &le; 5MB)
                </label>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imageUrls.map((url, idx) => (
                    <div
                      key={url}
                      className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/20 bg-black/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={failedImages.has(url) ? '/snipe-shield-logo.webp' : url}
                        alt={`Product upload ${idx + 1}`}
                        onError={() =>
                          setFailedImages((prev) => new Set(prev).add(url))
                        }
                        className="h-full w-full object-cover"
                      />
                      {idx === 0 ? (
                        <span className="absolute left-2 top-2 rounded-full border border-white/25 bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white">
                          Cover
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        aria-label="Remove image"
                        className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/75 text-white/85 transition hover:bg-rose-950 hover:text-rose-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {imageUrls.length < 5 ? (
                    <button
                      type="button"
                      disabled={uploadingImages || publishing}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 bg-white/[0.03] text-xs text-white/70 transition hover:border-white/45 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingImages ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-5 w-5" />
                      )}
                      <span>{uploadingImages ? 'Uploading...' : 'Add Photos'}</span>
                    </button>
                  ) : null}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleImageSelection}
                  className="hidden"
                />
              </div>

              {/* Title */}
              <div>
                <label
                  htmlFor="listing-title"
                  className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                >
                  Item Title
                </label>
                <input
                  id="listing-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. MacBook Pro M3 Max 14-inch (Space Black)"
                  maxLength={120}
                  required
                  className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/[0.08] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="listing-desc"
                  className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                >
                  Detailed Description
                </label>
                <textarea
                  id="listing-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={3000}
                  required
                  placeholder="Include specs, serial/warranty status, condition details, and included accessories..."
                  className="w-full rounded-3xl border border-white/20 bg-white/[0.045] p-4 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/[0.08] focus:outline-none"
                />
              </div>

              {/* Category & Condition */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="listing-category"
                    className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                  >
                    Category
                  </label>
                  <select
                    id="listing-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white focus:border-white/50 focus:outline-none"
                  >
                    {AUCTION_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#101217] text-white">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="listing-condition"
                    className="mb-1.5 flex items-center justify-between pl-1 text-xs font-medium text-white/80"
                  >
                    <span>Item Condition</span>
                    {requiresConditionProof(condition) ? (
                      <span className="text-[10px] font-semibold text-amber-300">
                        Evidence Photos Required (2-6)
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/50">Photos Optional</span>
                    )}
                  </label>
                  <select
                    id="listing-condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white focus:border-white/50 focus:outline-none"
                  >
                    {AUCTION_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond} className="bg-[#101217] text-white">
                        {cond}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conditional Damage & Condition Evidence Upload + Defect Description */}
              {requiresConditionProof(condition) ? (
                <div className="space-y-4 rounded-3xl border border-amber-400/25 bg-amber-950/20 p-5 backdrop-blur-md">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Condition &amp; Damage Evidence Required
                      </h3>
                      <p className="mt-0.5 text-xs text-amber-200/80">
                        Because you selected <strong className="text-amber-200">&ldquo;{condition}&rdquo;</strong>, SnipeShield buyer-protection requires mandatory visual proof and a defect description before bidders can participate.
                      </p>
                    </div>
                  </div>

                  {/* Mandatory Defect Description Field */}
                  <div>
                    <label
                      htmlFor="defect-description"
                      className="mb-1.5 flex items-center justify-between pl-1 text-xs font-semibold text-white/90"
                    >
                      <span>Describe the Product Condition &bull; <span className="text-amber-300 font-normal">Mandatory</span></span>
                      <span className="text-[11px] font-normal text-white/50">
                        {defectDescription.length}/2000
                      </span>
                    </label>
                    <textarea
                      id="defect-description"
                      value={defectDescription}
                      onChange={(e) => setDefectDescription(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      required
                      placeholder="Explain the scratches, dents, broken components, missing accessories, or other defects in detail..."
                      className="w-full rounded-2xl border border-amber-300/30 bg-black/40 p-3.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400/60 focus:bg-black/60 focus:outline-none"
                    />
                  </div>

                  {/* Condition Proof Images Upload (2 to 6 images) */}
                  <div>
                    <div className="mb-2 flex items-center justify-between pl-1">
                      <label className="text-xs font-semibold text-white/90">
                        Condition Proof Images ({conditionProofUrls.length}/6 uploaded)
                      </label>
                      <span className={`text-[11px] font-medium ${conditionProofUrls.length >= 2 ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {conditionProofUrls.length >= 2 ? '✓ Minimum requirement met' : `Need at least ${2 - conditionProofUrls.length} more image${2 - conditionProofUrls.length === 1 ? '' : 's'}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                      {conditionProofUrls.map((url, idx) => (
                        <div
                          key={url}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-white/20 bg-black/40"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Condition proof ${idx + 1}`}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => replaceProofImage(idx)}
                              disabled={uploadingProofImages || publishing}
                              title="Replace photo"
                              className="rounded-full bg-white/20 p-1.5 text-white hover:bg-white/40"
                            >
                              <Camera className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeProofImage(url)}
                              disabled={uploadingProofImages || publishing}
                              title="Remove photo"
                              className="rounded-full bg-rose-600/80 p-1.5 text-white hover:bg-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {conditionProofUrls.length < 6 ? (
                        <button
                          type="button"
                          disabled={uploadingProofImages || publishing}
                          onClick={() => proofFileInputRef.current?.click()}
                          className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-400/40 bg-amber-950/20 text-center text-[10px] text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {uploadingProofImages ? (
                            <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                          ) : (
                            <ImagePlus className="h-4 w-4 text-amber-300" />
                          )}
                          <span>{uploadingProofImages ? 'Uploading...' : '+ Add Proof'}</span>
                        </button>
                      ) : null}
                    </div>

                    <input
                      ref={proofFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleProofImageSelection}
                      className="hidden"
                    />
                    <p className="mt-2 text-[10px] text-white/50">
                      JPG, PNG, or WEBP (up to 5MB each). Min 2, max 6 proof images required.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Pricing */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Starting Bid (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={startingPrice}
                    onChange={(e) => setStartingPrice(e.target.value)}
                    required
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Min Increment (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={minIncrement}
                    onChange={(e) => setMinIncrement(e.target.value)}
                    required
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Reserve (Optional ₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={reservePrice}
                    onChange={(e) => setReservePrice(e.target.value)}
                    placeholder="Hidden min"
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white placeholder:text-white/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Shipping Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white"
                  />
                </div>
              </div>

              {/* Shipping, Delivery, Returns */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Shipping Details
                  </label>
                  <input
                    type="text"
                    value={shippingDetails}
                    onChange={(e) => setShippingDetails(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Delivery Timeline
                  </label>
                  <input
                    type="text"
                    value={deliveryInfo}
                    onChange={(e) => setDeliveryInfo(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Return Policy
                  </label>
                  <input
                    type="text"
                    value={returnPolicy}
                    onChange={(e) => setReturnPolicy(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
              </div>

              {/* Anti-Snipe Config + Dates */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Anti-Snipe Window (sec)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={antiSnipeWindowSec}
                    onChange={(e) => setAntiSnipeWindowSec(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Extension Duration (sec)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={antiSnipeExtendSec}
                    onChange={(e) => setAntiSnipeExtendSec(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block pl-1 text-xs font-medium text-white/80">
                    Max Extensions Cap
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={maxExtensions}
                    onChange={(e) => setMaxExtensions(e.target.value)}
                    className="h-11 w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="listing-starts-at"
                    className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                  >
                    Auction Start Date &amp; Time
                  </label>
                  <input
                    id="listing-starts-at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="listing-ends-at"
                    className="mb-1.5 block pl-1 text-xs font-medium text-white/80"
                  >
                    Auction End Date &amp; Time
                  </label>
                  <input
                    id="listing-ends-at"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                    className="h-[46px] w-full rounded-full border border-white/20 bg-white/[0.045] px-4 text-sm text-white [color-scheme:dark]"
                  />
                </div>
              </div>

              {errorMessage ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-rose-300/25 bg-rose-950/50 px-4 py-3 text-center text-xs text-rose-100"
                >
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowPreview((prev) => !prev)}
                  className="flex h-[46px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.05] text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {showPreview ? 'Hide Preview' : 'Preview Listing'}
                </button>

                <div className="flex-1">
                  <ShinyButton
                    type="submit"
                    disabled={publishing || uploadingImages}
                    label={publishing ? 'Publishing...' : 'Publish Auction'}
                    fillColor="#0b0c10"
                    labelColor="#ffffff"
                    accentColor="#a7adb6"
                    accentSoftColor="#e2e4e8"
                    cornerRadius={9999}
                    speckleOpacity={0.28}
                    className="flex h-[46px] w-full items-center justify-center !p-0 !text-sm !font-medium shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                  />
                </div>
              </div>
            </div>
          </form>

          {showPreview ? (
            <aside className="space-y-4">
              <div className="rounded-[28px] border border-white/20 bg-white/[0.04] p-5 backdrop-blur-xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/65">
                  Marketplace Card Preview
                </p>
                <AuctionCard
                  auction={previewAuction}
                  isSaved={false}
                  viewerRole="bidder"
                />
              </div>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
