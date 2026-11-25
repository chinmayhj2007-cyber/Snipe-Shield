-- ============================================================================
-- SnipeShield — Complete Production Ecosystem Migration
-- Covers: Admin Role, Verification & TrustScore, Configurable Anti-Snipe,
--         ShieldLock Idempotency, Bid Rejections, AutoBid AI, ShieldGuard Fraud,
--         Asset Passport, Notifications, Orders/Payments, Disputes, Reviews,
--         Recently Viewed, Preferences, Platform Settings, Audit Logs.
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1. EXTEND PROFILES (add admin role, verification, trustscore, demo flag, suspension)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('bidder', 'seller', 'admin'));

alter table public.profiles add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'identity_submitted', 'under_review', 'verified', 'restricted'));
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists specialization text not null default '';
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists trust_score integer not null default 50 check (trust_score >= 0 and trust_score <= 100);
alter table public.profiles add column if not exists response_rate integer not null default 95 check (response_rate >= 0 and response_rate <= 100);
alter table public.profiles add column if not exists avg_response_minutes integer not null default 25;

-- Non-recursive SECURITY DEFINER admin check helper (prevents RLS infinite recursion on profiles)
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (private.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Update prevent_profile_role_escalation trigger so admins/service_role can manage roles/verification/suspension safely
create or replace function private.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  select role into v_caller_role from public.profiles where id = auth.uid();

  if new.role is distinct from old.role and v_caller_role is distinct from 'admin' then
    raise exception 'Profile role cannot be modified directly.';
  end if;

  if (new.verification_status is distinct from old.verification_status
      or new.is_suspended is distinct from old.is_suspended
      or new.trust_score is distinct from old.trust_score)
     and v_caller_role is distinct from 'admin' then
    raise exception 'Verification, trust score, and suspension status require administrator privileges.';
  end if;

  return new;
end;
$$;

-- 2. EXTEND AUCTIONS (shipping, policies, configurable anti-snipe, views, demo, moderation, edit history)
alter table public.auctions add column if not exists shipping_details text not null default 'Insured tracked courier dispatch within 48 hours of payment.';
alter table public.auctions add column if not exists delivery_info text not null default 'Pan-India delivery in 3-5 business days.';
alter table public.auctions add column if not exists return_policy text not null default '7-day SnipeShield escrow protection for mismatched descriptions.';
alter table public.auctions add column if not exists shipping_cost numeric(10, 2) not null default 0 check (shipping_cost >= 0);
alter table public.auctions add column if not exists anti_snipe_window_sec integer not null default 30 check (anti_snipe_window_sec >= 10 and anti_snipe_window_sec <= 300);
alter table public.auctions add column if not exists anti_snipe_extend_sec integer not null default 30 check (anti_snipe_extend_sec >= 10 and anti_snipe_extend_sec <= 300);
alter table public.auctions add column if not exists max_extensions integer not null default 10 check (max_extensions >= 0 and max_extensions <= 100);
alter table public.auctions add column if not exists original_ends_at timestamptz;
alter table public.auctions add column if not exists views_count integer not null default 0;
alter table public.auctions add column if not exists is_demo boolean not null default false;
alter table public.auctions add column if not exists moderation_status text not null default 'approved' check (moderation_status in ('approved', 'flagged', 'removed'));
alter table public.auctions add column if not exists moderation_reason text;
alter table public.auctions add column if not exists edit_history jsonb not null default '[]'::jsonb;
alter table public.auctions add column if not exists paused boolean not null default false;

update public.auctions set original_ends_at = ends_at where original_ends_at is null;

grant select (
  shipping_details,
  delivery_info,
  return_policy,
  shipping_cost,
  anti_snipe_window_sec,
  anti_snipe_extend_sec,
  max_extensions,
  original_ends_at,
  views_count,
  is_demo,
  moderation_status,
  moderation_reason,
  edit_history,
  paused
) on table public.auctions to anon, authenticated;

drop policy if exists "auctions_update_admin" on public.auctions;
create policy "auctions_update_admin"
  on public.auctions for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "auctions_select_visible" on public.auctions;
create policy "auctions_select_visible"
  on public.auctions for select to anon, authenticated
  using (
    (status in ('active', 'ended') and moderation_status <> 'removed')
    or (select auth.uid()) = seller_id
    or private.is_admin()
  );

-- 3. EXTEND BIDS WITH IDEMPOTENCY KEY & SOURCE
alter table public.bids add column if not exists idempotency_key text;
alter table public.bids add column if not exists bid_source text not null default 'manual' check (bid_source in ('manual', 'proxy', 'autobid', 'demo'));
create unique index if not exists idx_bids_idempotency_unique
  on public.bids(auction_id, bidder_id, idempotency_key)
  where idempotency_key is not null;

-- 4. BID REJECTIONS LOG
create table if not exists public.bid_rejections (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  attempted_amount numeric(12, 2),
  reason text not null,
  idempotency_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bid_rejections_auction on public.bid_rejections(auction_id, created_at desc);
create index if not exists idx_bid_rejections_bidder on public.bid_rejections(bidder_id, created_at desc);
revoke all on table public.bid_rejections from public, anon, authenticated;
grant select on table public.bid_rejections to authenticated;
grant all on table public.bid_rejections to service_role;
alter table public.bid_rejections enable row level security;
drop policy if exists "bid_rejections_select_own_or_admin" on public.bid_rejections;
create policy "bid_rejections_select_own_or_admin"
  on public.bid_rejections for select to authenticated
  using ((select auth.uid()) = bidder_id or private.is_admin());

-- 5. AUCTION EXTENSIONS HISTORY (SnipeShield / FAIRClose)
create table if not exists public.auction_extensions (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  triggered_by_bidder_id uuid references public.profiles(id) on delete set null,
  previous_ends_at timestamptz not null,
  new_ends_at timestamptz not null,
  extension_seconds integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_auction_extensions_auction on public.auction_extensions(auction_id, created_at desc);
revoke all on table public.auction_extensions from public, anon, authenticated;
grant select on table public.auction_extensions to authenticated;
grant all on table public.auction_extensions to service_role;
alter table public.auction_extensions enable row level security;
drop policy if exists "auction_extensions_select_all" on public.auction_extensions;
create policy "auction_extensions_select_all"
  on public.auction_extensions for select to authenticated using (true);

-- 6. AUTOBID AI TABLES
create table if not exists public.auto_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  max_amount numeric(12, 2) not null check (max_amount > 0),
  increment_strategy text not null default 'minimum' check (increment_strategy in ('minimum', 'step_2x', 'conservative')),
  stop_condition text not null default 'max_budget' check (stop_condition in ('max_budget', 'max_5_bids', 'outbid_twice')),
  is_active boolean not null default true,
  bids_placed integer not null default 0,
  last_bid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id, bidder_id)
);
create index if not exists idx_auto_bids_auction on public.auto_bids(auction_id, is_active);
create index if not exists idx_auto_bids_bidder on public.auto_bids(bidder_id);
revoke all on table public.auto_bids from public, anon, authenticated;
grant select, insert, update, delete on table public.auto_bids to authenticated;
grant all on table public.auto_bids to service_role;
alter table public.auto_bids enable row level security;
drop policy if exists "auto_bids_select_own" on public.auto_bids;
create policy "auto_bids_select_own" on public.auto_bids for select to authenticated using ((select auth.uid()) = bidder_id);
drop policy if exists "auto_bids_insert_own" on public.auto_bids;
create policy "auto_bids_insert_own" on public.auto_bids for insert to authenticated with check ((select auth.uid()) = bidder_id);
drop policy if exists "auto_bids_update_own" on public.auto_bids;
create policy "auto_bids_update_own" on public.auto_bids for update to authenticated using ((select auth.uid()) = bidder_id);
drop policy if exists "auto_bids_delete_own" on public.auto_bids;
create policy "auto_bids_delete_own" on public.auto_bids for delete to authenticated using ((select auth.uid()) = bidder_id);

create table if not exists public.auto_bid_logs (
  id uuid primary key default gen_random_uuid(),
  auto_bid_id uuid references public.auto_bids(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  bid_amount numeric(12, 2),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_auto_bid_logs_bidder on public.auto_bid_logs(bidder_id, created_at desc);
revoke all on table public.auto_bid_logs from public, anon, authenticated;
grant select, insert on table public.auto_bid_logs to authenticated;
grant all on table public.auto_bid_logs to service_role;
alter table public.auto_bid_logs enable row level security;
drop policy if exists "auto_bid_logs_select_own" on public.auto_bid_logs;
create policy "auto_bid_logs_select_own" on public.auto_bid_logs for select to authenticated using ((select auth.uid()) = bidder_id);
drop policy if exists "auto_bid_logs_insert_own" on public.auto_bid_logs;
create policy "auto_bid_logs_insert_own" on public.auto_bid_logs for insert to authenticated with check ((select auth.uid()) = bidder_id);

-- 7. SELLER VERIFICATIONS
create table if not exists public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade unique,
  business_name text not null,
  government_id_type text not null default 'PAN / Aadhaar',
  document_reference text not null,
  notes text not null default '',
  status text not null default 'identity_submitted' check (status in ('identity_submitted', 'under_review', 'verified', 'rejected', 'restricted')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
revoke all on table public.seller_verifications from public, anon, authenticated;
grant select, insert, update on table public.seller_verifications to authenticated;
grant all on table public.seller_verifications to service_role;
alter table public.seller_verifications enable row level security;
drop policy if exists "seller_verif_select_own_or_admin" on public.seller_verifications;
create policy "seller_verif_select_own_or_admin" on public.seller_verifications for select to authenticated
  using ((select auth.uid()) = seller_id or private.is_admin());
drop policy if exists "seller_verif_insert_own" on public.seller_verifications;
create policy "seller_verif_insert_own" on public.seller_verifications for insert to authenticated
  with check ((select auth.uid()) = seller_id);
drop policy if exists "seller_verif_update_own_or_admin" on public.seller_verifications;
create policy "seller_verif_update_own_or_admin" on public.seller_verifications for update to authenticated
  using ((select auth.uid()) = seller_id or private.is_admin());

-- 8. SHIELDGUARD FRAUD ALERTS
create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  auction_id uuid references public.auctions(id) on delete cascade,
  signal_type text not null,
  risk_score integer not null check (risk_score >= 0 and risk_score <= 100),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'investigating', 'false_positive', 'confirmed_action')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fraud_alerts_status on public.fraud_alerts(status, created_at desc);
revoke all on table public.fraud_alerts from public, anon, authenticated;
grant select, insert, update on table public.fraud_alerts to authenticated;
grant all on table public.fraud_alerts to service_role;
alter table public.fraud_alerts enable row level security;
drop policy if exists "fraud_alerts_admin_all" on public.fraud_alerts;
create policy "fraud_alerts_admin_all" on public.fraud_alerts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- 9. ASSET PASSPORT DOCUMENTS
create table if not exists public.asset_documents (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'authenticity_certificate', 'ownership_record', 'condition_report', 'supporting_doc')),
  title text not null,
  file_url text,
  sha256_hash text not null,
  verification_status text not null default 'seller_submitted' check (verification_status in ('seller_submitted', 'under_review', 'independently_verified', 'rejected')),
  verified_by uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_documents_auction on public.asset_documents(auction_id, created_at desc);
revoke all on table public.asset_documents from public, anon, authenticated;
grant select, insert, update on table public.asset_documents to authenticated;
grant all on table public.asset_documents to service_role;
alter table public.asset_documents enable row level security;
drop policy if exists "asset_docs_select_auth" on public.asset_documents;
create policy "asset_docs_select_auth" on public.asset_documents for select to authenticated using (true);
drop policy if exists "asset_docs_insert_seller" on public.asset_documents;
create policy "asset_docs_insert_seller" on public.asset_documents for insert to authenticated with check ((select auth.uid()) = seller_id);
drop policy if exists "asset_docs_update_admin" on public.asset_documents;
create policy "asset_docs_update_admin" on public.asset_documents for update to authenticated using (private.is_admin());

-- 10. NOTIFICATIONS & PREFERENCES
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info' check (type in ('info','bid','outbid','won','lost','auction_ended','payment','order','dispute','system','autobid','extension')),
  title text not null,
  message text not null default '',
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read, created_at desc);
revoke all on table public.notifications from public, anon, authenticated;
grant select, insert, update on table public.notifications to authenticated;
grant all on table public.notifications to service_role;
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "notifications_insert_auth" on public.notifications;
create policy "notifications_insert_auth" on public.notifications for insert to authenticated with check ((select auth.uid()) = user_id);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_bids boolean not null default true,
  in_app_outbid boolean not null default true,
  in_app_ending_soon boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;
alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own" on public.notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 11. ORDERS, PAYMENTS & DISPUTES
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade unique,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  winning_bid_amount numeric(12, 2) not null check (winning_bid_amount > 0),
  platform_fee numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  final_price numeric(12, 2) not null check (final_price > 0),
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','shipped','delivered','cancelled','refunded','disputed')),
  razorpay_order_id text,
  razorpay_payment_id text,
  payment_method text,
  shipping_address jsonb,
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_buyer on public.orders(buyer_id, created_at desc);
create index if not exists idx_orders_seller on public.orders(seller_id, created_at desc);
revoke all on table public.orders from public, anon, authenticated;
grant select, insert, update on table public.orders to authenticated;
grant all on table public.orders to service_role;
alter table public.orders enable row level security;
drop policy if exists "orders_select_party_or_admin" on public.orders;
create policy "orders_select_party_or_admin" on public.orders for select to authenticated
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id or private.is_admin());
drop policy if exists "orders_insert_party" on public.orders;
create policy "orders_insert_party" on public.orders for insert to authenticated
  with check ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);
drop policy if exists "orders_update_party_or_admin" on public.orders;
create policy "orders_update_party_or_admin" on public.orders for update to authenticated
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id or private.is_admin());

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text not null,
  provider_payment_id text unique,
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','authorized','captured','failed','refunded')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
revoke all on table public.payments from public, anon, authenticated;
grant select, insert, update on table public.payments to authenticated;
grant all on table public.payments to service_role;
alter table public.payments enable row level security;
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments for select to authenticated
  using ((select auth.uid()) = user_id or private.is_admin());
drop policy if exists "payments_insert_own" on public.payments;
create policy "payments_insert_own" on public.payments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  filed_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','under_review','resolved_refund','resolved_release','rejected')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table public.disputes from public, anon, authenticated;
grant select, insert, update on table public.disputes to authenticated;
grant all on table public.disputes to service_role;
alter table public.disputes enable row level security;
drop policy if exists "disputes_select_party_or_admin" on public.disputes;
create policy "disputes_select_party_or_admin" on public.disputes for select to authenticated
  using (
    (select auth.uid()) = filed_by
    or exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.buyer_id or (select auth.uid()) = o.seller_id))
    or private.is_admin()
  );
drop policy if exists "disputes_insert_party" on public.disputes;
create policy "disputes_insert_party" on public.disputes for insert to authenticated
  with check (
    (select auth.uid()) = filed_by
    and exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.buyer_id or (select auth.uid()) = o.seller_id))
  );
drop policy if exists "disputes_update_admin" on public.disputes;
create policy "disputes_update_admin" on public.disputes for update to authenticated using (private.is_admin());

-- 12. REVIEWS
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_reviewed_user on public.reviews(reviewed_user_id);
revoke all on table public.reviews from public, anon, authenticated;
grant select, insert on table public.reviews to authenticated;
grant all on table public.reviews to service_role;
alter table public.reviews enable row level security;
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews for select to authenticated using (true);
drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check ((select auth.uid()) = reviewer_id);

-- 13. AUDIT LOGS, RECENTLY VIEWED, USER PREFERENCES & PLATFORM SETTINGS
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
revoke all on table public.audit_logs from public, anon, authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin" on public.audit_logs for select to authenticated
  using ((select auth.uid()) = user_id or private.is_admin());
drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
create policy "audit_logs_insert_auth" on public.audit_logs for insert to authenticated with check ((select auth.uid()) = user_id);

create table if not exists public.recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, auction_id)
);
revoke all on table public.recently_viewed from public, anon, authenticated;
grant select, insert, update, delete on table public.recently_viewed to authenticated;
grant all on table public.recently_viewed to service_role;
alter table public.recently_viewed enable row level security;
drop policy if exists "recently_viewed_own" on public.recently_viewed;
create policy "recently_viewed_own" on public.recently_viewed for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_categories text[] not null default '{}',
  search_history text[] not null default '{}',
  personalization_enabled boolean not null default true,
  show_completed_purchases boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on table public.user_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant all on table public.user_preferences to service_role;
alter table public.user_preferences enable row level security;
drop policy if exists "user_preferences_own" on public.user_preferences;
create policy "user_preferences_own" on public.user_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value)
values (
  'anti_sniping',
  '{"default_window_sec": 30, "default_extend_sec": 30, "default_max_extensions": 10, "platform_fee_percent": 2.5, "gst_percent": 18}'::jsonb
) on conflict (key) do nothing;
revoke all on table public.platform_settings from public, anon, authenticated;
grant select, insert, update on table public.platform_settings to authenticated;
grant all on table public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
drop policy if exists "platform_settings_read" on public.platform_settings;
create policy "platform_settings_read" on public.platform_settings for select to authenticated using (true);
drop policy if exists "platform_settings_write_admin" on public.platform_settings;
create policy "platform_settings_write_admin" on public.platform_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- 14. UPDATE get_public_profiles TO INCLUDE TRUST & VERIFICATION FIELDS
drop function if exists public.get_public_profiles(uuid[]);
create or replace function public.get_public_profiles(p_ids uuid[])
returns table(
  id uuid,
  display_name text,
  role text,
  avatar_url text,
  verification_status text,
  trust_score integer,
  is_demo boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(
      nullif(trim(p.full_name), ''),
      case
        when position('@' in p.email) > 2 then left(split_part(p.email, '@', 1), 2) || '•••'
        when length(p.email) > 2 then left(p.email, 2) || '•••'
        else 'User'
      end
    ) as display_name,
    p.role,
    p.avatar_url,
    p.verification_status,
    p.trust_score,
    p.is_demo,
    p.created_at
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(p_ids);
$$;
revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated, service_role;

-- 15. RECORD VIEW RPC
create or replace function public.record_auction_view(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  update public.auctions set views_count = views_count + 1 where id = p_auction_id;
  insert into public.recently_viewed (user_id, auction_id, viewed_at)
  values (v_uid, p_auction_id, now())
  on conflict (user_id, auction_id)
  do update set viewed_at = now();
end;
$$;
revoke all on function public.record_auction_view(uuid) from public, anon;
grant execute on function public.record_auction_view(uuid) to authenticated, service_role;

-- 16. SERVER-SIDE AUCTION CLOSING & ORDER GENERATION RPC
create or replace function public.finalize_auction(p_auction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_auction public.auctions%rowtype;
  v_fee numeric(12, 2);
  v_tax numeric(12, 2);
  v_total numeric(12, 2);
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Auction not found.';
  end if;

  if v_auction.status = 'active' and now() < v_auction.ends_at then
    return jsonb_build_object('closed', false, 'reason', 'Auction has not reached closing time yet.');
  end if;

  if v_auction.status = 'active' and now() >= v_auction.ends_at then
    perform set_config('app.in_place_bid', 'true', true);
    update public.auctions
    set status = 'ended', updated_at = now()
    where id = p_auction_id;
    v_auction.status := 'ended';
  end if;

  if v_auction.status = 'ended' and v_auction.highest_bidder_id is not null then
    -- Check reserve price if set
    if v_auction.reserve_price is null or v_auction.current_price >= v_auction.reserve_price then
      v_fee := least(2500, round(v_auction.current_price * 0.025, 2));
      v_tax := round(v_fee * 0.18, 2);
      v_total := round(v_auction.current_price + v_fee + coalesce(v_auction.shipping_cost, 0) + v_tax, 2);

      insert into public.orders (
        auction_id, buyer_id, seller_id, winning_bid_amount, platform_fee, shipping_cost, tax_amount, final_price, status
      ) values (
        p_auction_id, v_auction.highest_bidder_id, v_auction.seller_id,
        v_auction.current_price, v_fee, coalesce(v_auction.shipping_cost, 0), v_tax, v_total, 'pending_payment'
      )
      on conflict (auction_id) do nothing
      returning id into v_order_id;

      if v_order_id is not null then
        insert into public.notifications (user_id, type, title, message, link)
        values
          (v_auction.highest_bidder_id, 'won', 'Auction Won! Payment Required',
           format('Congratulations! You won "%s" for ₹%s. Complete payment in Orders.', v_auction.title, v_total),
           '/orders'),
          (v_auction.seller_id, 'auction_ended', 'Auction Sold',
           format('Your auction "%s" closed at ₹%s. Order created.', v_auction.title, v_auction.current_price),
           '/orders');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'closed', true,
    'status', v_auction.status,
    'highest_bidder_id', v_auction.highest_bidder_id,
    'order_id', v_order_id
  );
end;
$$;
revoke all on function public.finalize_auction(uuid) from public, anon;
grant execute on function public.finalize_auction(uuid) to authenticated, service_role;

-- 17. UPGRADED SHIELDLOCK + AUTOBID + ANTI-SNIPE + NOTIFICATIONS + SHIELDGUARD place_bid RPC
drop function if exists public.place_bid(uuid, numeric, numeric);
create or replace function public.place_bid(
  p_auction_id uuid,
  p_amount numeric,
  p_max_proxy numeric default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_auction public.auctions%rowtype;
  v_min_required numeric(12, 2);
  v_manual_amount numeric(12, 2);
  v_new_ceiling numeric(12, 2);
  v_existing_own_proxy numeric(12, 2);
  v_prev_highest uuid;
  v_prev_proxy_bidder uuid;
  v_prev_proxy_max numeric(12, 2);
  v_final_price numeric(12, 2);
  v_winner uuid;
  v_extended boolean := false;
  v_new_ends_at timestamptz;
  v_bids_inserted integer := 0;
  v_manual_ts timestamptz;
  v_proxy_ts timestamptz;
  v_existing_bid public.bids%rowtype;
  v_recent_bid_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required to place a bid.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if coalesce(v_profile.is_suspended, false) then
    raise exception 'Your account is currently suspended pending review.';
  end if;
  if v_profile.role is distinct from 'bidder' then
    raise exception 'Only Bidder accounts can place bids.';
  end if;

  -- Idempotency dedup check
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select * into v_existing_bid
    from public.bids
    where auction_id = p_auction_id
      and bidder_id = v_uid
      and idempotency_key = p_idempotency_key
    limit 1;

    if found then
      select * into v_auction from public.auctions where id = p_auction_id;
      return jsonb_build_object(
        'success', true,
        'deduplicated', true,
        'current_price', v_auction.current_price,
        'highest_bidder_id', v_auction.highest_bidder_id,
        'is_leading', (v_auction.highest_bidder_id = v_uid),
        'ends_at', v_auction.ends_at,
        'extended', false,
        'bid_count', v_auction.bid_count
      );
    end if;
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, 'Invalid bid amount', p_idempotency_key);
    raise exception 'Please enter a valid bid amount.';
  end if;

  -- SHIELDLOCK: Row-level exclusive lock serializes concurrent bids atomically
  select * into v_auction
  from public.auctions
  where id = p_auction_id
  for update;

  if not found then
    raise exception 'Auction not found.';
  end if;

  if v_auction.seller_id = v_uid then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, 'Seller attempted self-bid', p_idempotency_key);
    raise exception 'Sellers cannot bid on their own auction.';
  end if;

  if v_auction.status <> 'active' or v_auction.paused or v_auction.moderation_status = 'removed' then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, 'Auction inactive or paused', p_idempotency_key);
    raise exception 'This auction is not active.';
  end if;

  if now() < v_auction.starts_at then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, 'Auction not started', p_idempotency_key);
    raise exception 'Bidding has not started yet.';
  end if;

  if now() >= v_auction.ends_at then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, 'Auction already ended', p_idempotency_key);
    raise exception 'This auction has already ended.';
  end if;

  v_prev_highest := v_auction.highest_bidder_id;

  if v_auction.highest_bidder_id = v_uid then
    if p_max_proxy is null then
      raise exception 'You are already the highest bidder on this auction.';
    end if;
    select pb.max_amount into v_existing_own_proxy
    from public.proxy_bids pb
    where pb.auction_id = p_auction_id and pb.bidder_id = v_uid;

    v_new_ceiling := round(p_max_proxy, 2);
    if v_new_ceiling <= coalesce(v_existing_own_proxy, v_auction.current_price) then
      raise exception 'You are already the highest bidder. Enter a higher auto-proxy max ceiling to raise your limit.';
    end if;

    insert into public.proxy_bids (auction_id, bidder_id, max_amount)
    values (p_auction_id, v_uid, v_new_ceiling)
    on conflict (auction_id, bidder_id)
    do update set max_amount = greatest(public.proxy_bids.max_amount, excluded.max_amount), updated_at = now();

    return jsonb_build_object(
      'success', true,
      'current_price', v_auction.current_price,
      'highest_bidder_id', v_auction.highest_bidder_id,
      'is_leading', true,
      'ends_at', v_auction.ends_at,
      'extended', false,
      'bid_count', v_auction.bid_count
    );
  end if;

  if v_auction.highest_bidder_id is null then
    v_min_required := v_auction.starting_price;
  else
    v_min_required := v_auction.current_price + v_auction.min_increment;
  end if;

  if p_amount < v_min_required then
    insert into public.bid_rejections (auction_id, bidder_id, attempted_amount, reason, idempotency_key)
    values (p_auction_id, v_uid, p_amount, format('Below minimum bid %s', v_min_required), p_idempotency_key);
    raise exception 'Bid must be at least %.', v_min_required;
  end if;

  v_manual_amount := round(p_amount, 2);
  v_new_ceiling := round(coalesce(p_max_proxy, p_amount), 2);
  v_new_ends_at := v_auction.ends_at;

  -- Configurable SnipeShield Anti-Sniping Reset (respects max_extensions cap)
  if (v_auction.ends_at - now()) <= make_interval(secs => v_auction.anti_snipe_window_sec)
     and v_auction.extensions_count < v_auction.max_extensions then
    v_new_ends_at := greatest(v_auction.ends_at, now() + make_interval(secs => v_auction.anti_snipe_extend_sec));
    v_extended := true;

    insert into public.auction_extensions (
      auction_id, triggered_by_bidder_id, previous_ends_at, new_ends_at, extension_seconds
    ) values (
      p_auction_id, v_uid, v_auction.ends_at, v_new_ends_at, v_auction.anti_snipe_extend_sec
    );
  end if;

  v_manual_ts := clock_timestamp();
  v_proxy_ts := greatest(clock_timestamp(), v_manual_ts + interval '1 millisecond');

  insert into public.bids (auction_id, bidder_id, amount, is_auto_proxy, idempotency_key, bid_source, created_at)
  values (p_auction_id, v_uid, v_manual_amount, false, p_idempotency_key, 'manual', v_manual_ts);
  v_bids_inserted := v_bids_inserted + 1;

  if p_max_proxy is not null then
    insert into public.proxy_bids (auction_id, bidder_id, max_amount)
    values (p_auction_id, v_uid, round(p_max_proxy, 2))
    on conflict (auction_id, bidder_id)
    do update set max_amount = greatest(public.proxy_bids.max_amount, excluded.max_amount), updated_at = now();
  end if;

  if v_auction.highest_bidder_id is not null then
    select pb.bidder_id, pb.max_amount
    into v_prev_proxy_bidder, v_prev_proxy_max
    from public.proxy_bids pb
    where pb.auction_id = p_auction_id and pb.bidder_id = v_auction.highest_bidder_id;

    if v_prev_proxy_bidder is null then
      select ab.bidder_id, ab.max_amount
      into v_prev_proxy_bidder, v_prev_proxy_max
      from public.auto_bids ab
      where ab.auction_id = p_auction_id
        and ab.bidder_id = v_auction.highest_bidder_id
        and ab.is_active = true;
    end if;
  end if;

  if v_prev_proxy_bidder is not null and v_prev_proxy_max >= v_new_ceiling then
    v_winner := v_prev_proxy_bidder;
    v_final_price := least(v_prev_proxy_max, round(v_new_ceiling + v_auction.min_increment, 2));
    if v_final_price < v_manual_amount then
      v_final_price := v_manual_amount;
    end if;

    insert into public.bids (auction_id, bidder_id, amount, is_auto_proxy, bid_source, created_at)
    values (p_auction_id, v_prev_proxy_bidder, v_final_price, true, 'autobid', v_proxy_ts);
    v_bids_inserted := v_bids_inserted + 1;

    update public.auto_bids
    set bids_placed = bids_placed + 1, last_bid_at = v_proxy_ts, updated_at = now()
    where auction_id = p_auction_id and bidder_id = v_prev_proxy_bidder and is_active = true;
  elsif v_prev_proxy_bidder is not null and v_new_ceiling > v_prev_proxy_max then
    v_winner := v_uid;
    v_final_price := greatest(v_manual_amount, least(v_new_ceiling, round(v_prev_proxy_max + v_auction.min_increment, 2)));
    if v_final_price > v_manual_amount then
      insert into public.bids (auction_id, bidder_id, amount, is_auto_proxy, bid_source, created_at)
      values (p_auction_id, v_uid, v_final_price, true, 'proxy', v_proxy_ts);
      v_bids_inserted := v_bids_inserted + 1;
    end if;

    update public.auto_bids set is_active = false, updated_at = now()
    where auction_id = p_auction_id and bidder_id = v_prev_proxy_bidder and is_active = true;

    insert into public.notifications (user_id, type, title, message, link)
    values (v_prev_proxy_bidder, 'autobid', 'AutoBid Budget Reached',
      format('Your AutoBid ceiling on "%s" has been surpassed.', v_auction.title),
      format('/auctions/%s', p_auction_id));
  else
    v_winner := v_uid;
    v_final_price := v_manual_amount;
  end if;

  perform set_config('app.in_place_bid', 'true', true);

  update public.auctions
  set current_price = v_final_price,
      highest_bidder_id = v_winner,
      bid_count = bid_count + v_bids_inserted,
      ends_at = v_new_ends_at,
      extensions_count = case when v_extended then extensions_count + 1 else extensions_count end,
      updated_at = now()
  where id = p_auction_id;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    v_auction.seller_id,
    'bid',
    'New Bid Received',
    format('"%s" reached ₹%s.', v_auction.title, v_final_price),
    format('/auctions/%s', p_auction_id)
  );

  if v_prev_highest is not null and v_prev_highest <> v_winner then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      v_prev_highest,
      'outbid',
      'You Were Outbid',
      format('A higher bid of ₹%s was placed on "%s".', v_final_price, v_auction.title),
      format('/auctions/%s', p_auction_id)
    );
  end if;

  select count(*) into v_recent_bid_count
  from public.bids
  where bidder_id = v_uid and created_at > now() - interval '60 seconds';

  if v_recent_bid_count >= 6 then
    insert into public.fraud_alerts (user_id, auction_id, signal_type, risk_score, severity, description, evidence)
    values (
      v_uid,
      p_auction_id,
      'rapid_bid_burst',
      74,
      'high',
      format('Bidder placed %s bids within 60 seconds.', v_recent_bid_count),
      jsonb_build_object('bids_in_60s', v_recent_bid_count, 'latest_amount', v_final_price)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'current_price', v_final_price,
    'highest_bidder_id', v_winner,
    'is_leading', (v_winner = v_uid),
    'ends_at', v_new_ends_at,
    'extended', v_extended,
    'bid_count', v_auction.bid_count + v_bids_inserted
  );
end;
$$;

revoke all on function public.place_bid(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.place_bid(uuid, numeric, numeric, text) to authenticated, service_role;

-- 18. REALTIME PUBLICATIONS FOR NEW TABLES
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.auto_bids; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.auction_extensions; exception when duplicate_object then null; end $$;

-- 19. CONDITION PROOF & DEFECT DESCRIPTION COLUMNS
alter table public.auctions add column if not exists defect_description text;
alter table public.auctions add column if not exists condition_proof_urls text[] not null default '{}'::text[];

