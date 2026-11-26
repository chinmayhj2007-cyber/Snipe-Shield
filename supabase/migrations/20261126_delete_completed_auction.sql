-- Enable authenticated sellers to delete their own completed/ended auctions
-- while preserving bid & order records for audit purposes.

alter table public.bids alter column auction_id drop not null;
alter table public.bids drop constraint if exists bids_auction_id_fkey;
alter table public.bids
  add constraint bids_auction_id_fkey
  foreign key (auction_id) references public.auctions(id) on delete set null;

alter table public.orders alter column auction_id drop not null;
alter table public.orders drop constraint if exists orders_auction_id_fkey;
alter table public.orders
  add constraint orders_auction_id_fkey
  foreign key (auction_id) references public.auctions(id) on delete set null;

drop policy if exists "auctions_delete_own_ended" on public.auctions;
create policy "auctions_delete_own_ended"
  on public.auctions for delete to authenticated
  using (((select auth.uid()) = seller_id) and (status = 'ended' or ends_at <= now()));
