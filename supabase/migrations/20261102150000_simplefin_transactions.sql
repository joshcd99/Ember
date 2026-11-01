-- Raw bank transaction feed from SimpleFIN, for every synced account
-- (not just debt-linked ones). Separate from the curated transactions
-- register; powers recurring-charge detection and auditing.

create table public.simplefin_transactions (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  account_id uuid references public.simplefin_accounts(id) on delete cascade not null,
  sf_txn_id text not null,
  posted date not null,
  amount numeric(12,2) not null,
  description text not null default '',
  pending boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, sf_txn_id)
);

create index idx_simplefin_transactions_household_posted
  on public.simplefin_transactions(household_id, posted desc);

alter table public.simplefin_transactions enable row level security;

create policy "Household members can view simplefin_transactions"
  on public.simplefin_transactions for select using (household_id in (select user_household_ids()));
create policy "Household members can insert simplefin_transactions"
  on public.simplefin_transactions for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update simplefin_transactions"
  on public.simplefin_transactions for update using (household_id in (select user_household_ids()));
create policy "Household members can delete simplefin_transactions"
  on public.simplefin_transactions for delete using (household_id in (select user_household_ids()));
