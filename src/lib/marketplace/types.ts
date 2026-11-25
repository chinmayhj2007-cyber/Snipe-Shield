import type { UserRole } from '@/lib/auth/validation';

export const AUCTION_CATEGORIES = [
  {
    id: 'Electronics',
    label: 'Electronics & Tech',
    subtitle: 'Flagship gadgets, wearables & smart gear',
  },
  {
    id: 'Laptops',
    label: 'Laptops & Workstations',
    subtitle: 'MacBooks, ultrabooks & creator rigs',
  },
  {
    id: 'Smartphones',
    label: 'Smartphones',
    subtitle: 'Unlocked flagships & limited editions',
  },
  {
    id: 'Audio',
    label: 'Audio & Studio',
    subtitle: 'Headphones, DACs & studio monitors',
  },
  {
    id: 'Gaming',
    label: 'Gaming & Consoles',
    subtitle: 'GPUs, handhelds & collector editions',
  },
  {
    id: 'Cameras',
    label: 'Cameras & Optics',
    subtitle: 'Mirrorless bodies, lenses & drones',
  },
  {
    id: 'Collectibles',
    label: 'Collectibles',
    subtitle: 'Limited memorabilia, watches & coins',
  },
  {
    id: 'Art',
    label: 'Art & Prints',
    subtitle: 'Signed editions, sculptures & studio works',
  },
  {
    id: 'Antiques',
    label: 'Antiques',
    subtitle: 'Heritage timepieces & vintage artifacts',
  },
  {
    id: 'Vehicles',
    label: 'Vehicles & EVs',
    subtitle: 'Superbikes, EV scooters & collector cars',
  },
  {
    id: 'Fashion',
    label: 'Fashion & Luxury',
    subtitle: 'Authenticated sneakers, bags & apparel',
  },
  {
    id: 'Sports',
    label: 'Sports Equipment',
    subtitle: 'Pro cycling, tennis & fitness gear',
  },
  {
    id: 'Home',
    label: 'Home & Furniture',
    subtitle: 'Designer lighting, espresso & smart home',
  },
  {
    id: 'Industrial',
    label: 'Industrial Equipment',
    subtitle: '3D printers, CNC & lab instrumentation',
  },
] as const;

export const AUCTION_CONDITIONS = [
  'Brand New',
  'Like New',
  'Good',
  'Fair',
  'Scratched',
  'Dented',
  'Cracked',
  'Broken',
  'Not Working',
  'Partially Working',
  'Missing Parts',
  'Refurbished',
  'Repaired',
  'Water Damaged',
  'For Parts Only',
  'Other Defects',
] as const;

export type AuctionCondition = (typeof AUCTION_CONDITIONS)[number];

/** Conditions where damage/condition evidence images and defect descriptions are optional */
export const OPTIONAL_PROOF_CONDITIONS = new Set<string>([
  'Brand New',
  'Like New',
  'Good',
]);

/** Returns whether the given condition requires mandatory condition proof images & defect description */
export function requiresConditionProof(condition: string): boolean {
  return !OPTIONAL_PROOF_CONDITIONS.has(condition);
}

export type VerificationStatus =
  | 'unverified'
  | 'identity_submitted'
  | 'under_review'
  | 'verified'
  | 'restricted';

export interface MarketplaceUser {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  verificationStatus?: VerificationStatus;
  trustScore?: number;
  isSuspended?: boolean;
  isDemo?: boolean;
}

export interface AuctionItem {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_verified?: boolean;
  seller_trust_score?: number;
  title: string;
  description: string;
  category: string;
  condition: string;
  defect_description?: string | null;
  condition_proof_urls?: string[];
  image_url: string | null;
  image_urls: string[];
  starting_price: number;
  current_price: number;
  min_increment: number;
  reserve_price: number | null;
  highest_bidder_id: string | null;
  highest_bidder_name: string | null;
  status: 'draft' | 'active' | 'ended' | 'cancelled';
  starts_at: string;
  ends_at: string;
  original_ends_at?: string | null;
  extensions_count: number;
  anti_snipe_window_sec?: number;
  anti_snipe_extend_sec?: number;
  max_extensions?: number;
  shipping_details?: string;
  delivery_info?: string;
  return_policy?: string;
  shipping_cost?: number;
  views_count?: number;
  is_demo?: boolean;
  paused?: boolean;
  moderation_status?: 'approved' | 'flagged' | 'removed';
  created_at: string;
  bid_count?: number;
}

export interface BidEntry {
  id: string;
  auction_id: string;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  is_auto_proxy: boolean;
  bid_source?: 'manual' | 'proxy' | 'autobid' | 'demo';
  created_at: string;
}

export interface AuctionExtensionEntry {
  id: string;
  auction_id: string;
  previous_ends_at: string;
  new_ends_at: string;
  extension_seconds: number;
  created_at: string;
}

export interface AutoBidConfig {
  id: string;
  auction_id: string;
  auction_title?: string;
  auction_current_price?: number;
  auction_ends_at?: string;
  auction_status?: string;
  auction_highest_bidder_id?: string | null;
  bidder_id: string;
  max_amount: number;
  increment_strategy: 'minimum' | 'step_2x' | 'conservative';
  stop_condition: 'max_budget' | 'max_5_bids' | 'outbid_twice';
  is_active: boolean;
  bids_placed: number;
  last_bid_at: string | null;
  created_at: string;
}

export interface AssetDocument {
  id: string;
  auction_id: string;
  seller_id: string;
  doc_type: 'invoice' | 'authenticity_certificate' | 'ownership_record' | 'condition_report' | 'supporting_doc';
  title: string;
  file_url: string | null;
  sha256_hash: string;
  verification_status: 'seller_submitted' | 'under_review' | 'independently_verified' | 'rejected';
  notes: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'info' | 'bid' | 'outbid' | 'won' | 'lost' | 'auction_ended' | 'payment' | 'order' | 'dispute' | 'system' | 'autobid' | 'extension';
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  auction_id: string;
  auction_title?: string;
  auction_image?: string | null;
  buyer_id: string;
  buyer_name?: string;
  seller_id: string;
  seller_name?: string;
  winning_bid_amount: number;
  platform_fee: number;
  shipping_cost: number;
  tax_amount: number;
  final_price: number;
  status: 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'disputed';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payment_method: string | null;
  tracking_number: string | null;
  shipping_address: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeItem {
  id: string;
  order_id: string;
  filed_by: string;
  reason: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved_refund' | 'resolved_release' | 'rejected';
  resolution: string | null;
  created_at: string;
}

export interface FraudAlertItem {
  id: string;
  user_id: string | null;
  user_name?: string;
  auction_id: string | null;
  auction_title?: string;
  signal_type: string;
  risk_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, unknown>;
  status: 'open' | 'investigating' | 'false_positive' | 'confirmed_action';
  resolution_notes: string | null;
  created_at: string;
}

export interface SellerVerificationItem {
  id: string;
  seller_id: string;
  seller_name?: string;
  business_name: string;
  government_id_type: string;
  document_reference: string;
  notes: string;
  status: 'identity_submitted' | 'under_review' | 'verified' | 'rejected' | 'restricted';
  review_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface ReviewItem {
  id: string;
  order_id: string | null;
  reviewer_id: string;
  reviewer_name?: string;
  reviewed_user_id: string;
  rating: number;
  comment: string;
  is_demo: boolean;
  created_at: string;
}

export interface TrueCostBreakdown {
  winningBid: number;
  platformFee: number;
  shippingCost: number;
  taxAmount: number;
  totalPayable: number;
}

export interface PriceInsight {
  lowEstimate: number;
  medianEstimate: number;
  highEstimate: number;
  comparableCount: number;
  basisNote: string;
}

export interface TrustScoreBreakdown {
  score: number;
  tier: 'Elite Verified' | 'Verified' | 'Standard' | 'New' | 'Restricted';
  factors: Array<{ label: string; points: number; maxPoints: number; status: string }>;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getAuctionPhase(
  auction: Pick<AuctionItem, 'status' | 'starts_at' | 'ends_at'>,
  nowMs: number = Date.now()
): 'live' | 'upcoming' | 'ended' {
  if (auction.status === 'ended' || auction.status === 'cancelled') {
    return 'ended';
  }
  const startsMs = new Date(auction.starts_at).getTime();
  const endsMs = new Date(auction.ends_at).getTime();
  if (nowMs >= endsMs) return 'ended';
  if (nowMs < startsMs) return 'upcoming';
  return 'live';
}

export function getPrimaryImage(auction: Pick<AuctionItem, 'image_url' | 'image_urls'>): string | null {
  if (auction.image_urls && auction.image_urls.length > 0 && auction.image_urls[0]) {
    return auction.image_urls[0];
  }
  return auction.image_url ?? null;
}
