-- Decisions about detected recurring charges, keyed by normalized merchant:
-- 'dismissed' hides a charge from future scans; 'bill'/'debt' rows link it to
-- existing expenses or debts (one charge may link to several of each).

create table public.recurring_links (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  merchant_key text not null,
  kind text not null check (kind in ('dismissed', 'bill', 'debt')),
  bill_id uuid references public.bills(id) on delete cascade,
  debt_id uuid references public.debts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_recurring_links_household on public.recurring_links(household_id, merchant_key);

alter table public.recurring_links enable row level security;

create policy "Household members can view recurring_links"
  on public.recurring_links for select using (household_id in (select user_household_ids()));
create policy "Household members can insert recurring_links"
  on public.recurring_links for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update recurring_links"
  on public.recurring_links for update using (household_id in (select user_household_ids()));
create policy "Household members can delete recurring_links"
  on public.recurring_links for delete using (household_id in (select user_household_ids()));
