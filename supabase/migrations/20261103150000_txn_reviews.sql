-- Daily transaction review: every synced bank transaction gets matched to
-- a planned bill / income source / debt payment, marked as a transfer, or
-- categorized as spending (category labels shared with bill_categories).

create table public.txn_reviews (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  sf_txn_id uuid references public.simplefin_transactions(id) on delete cascade not null unique,
  kind text not null check (kind in ('bill', 'income', 'debt', 'spending', 'transfer', 'ignore')),
  bill_id uuid references public.bills(id) on delete set null,
  income_source_id uuid references public.income_sources(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  category text,
  created_at timestamptz not null default now()
);

create index idx_txn_reviews_household on public.txn_reviews(household_id);

alter table public.txn_reviews enable row level security;

create policy "Household members can view txn_reviews"
  on public.txn_reviews for select using (household_id in (select user_household_ids()));
create policy "Household members can insert txn_reviews"
  on public.txn_reviews for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update txn_reviews"
  on public.txn_reviews for update using (household_id in (select user_household_ids()));
create policy "Household members can delete txn_reviews"
  on public.txn_reviews for delete using (household_id in (select user_household_ids()));
