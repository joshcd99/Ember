-- SimpleFIN bank sync
-- Connections hold a household's SimpleFIN Bridge access URL (read-only credentials).
-- Accounts mirror the bank accounts exposed by that connection and can be linked
-- to a debt or the household savings account so syncs update real balances.

create table public.simplefin_connections (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  access_url text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text
);

create index idx_simplefin_connections_household on public.simplefin_connections(household_id);

create table public.simplefin_accounts (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  connection_id uuid references public.simplefin_connections(id) on delete cascade not null,
  simplefin_id text not null,
  name text not null default '',
  org_name text not null default '',
  currency text not null default 'USD',
  balance numeric(12,2),
  available_balance numeric(12,2),
  balance_date timestamptz,
  linked_debt_id uuid references public.debts(id) on delete set null,
  linked_savings boolean not null default false,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (connection_id, simplefin_id)
);

create index idx_simplefin_accounts_household on public.simplefin_accounts(household_id);

-- Imported-transaction tracking: NULLs never collide under the default
-- NULLS DISTINCT, so manual transactions are unaffected by the unique index.
alter table public.transactions add column if not exists simplefin_txn_id text;
alter table public.transactions add column if not exists source text not null default 'manual';
create unique index if not exists idx_transactions_simplefin_txn
  on public.transactions(household_id, simplefin_txn_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.simplefin_connections enable row level security;
alter table public.simplefin_accounts enable row level security;

create policy "Household members can view simplefin_connections"
  on public.simplefin_connections for select using (household_id in (select user_household_ids()));
create policy "Household members can insert simplefin_connections"
  on public.simplefin_connections for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update simplefin_connections"
  on public.simplefin_connections for update using (household_id in (select user_household_ids()));
create policy "Household members can delete simplefin_connections"
  on public.simplefin_connections for delete using (household_id in (select user_household_ids()));

create policy "Household members can view simplefin_accounts"
  on public.simplefin_accounts for select using (household_id in (select user_household_ids()));
create policy "Household members can insert simplefin_accounts"
  on public.simplefin_accounts for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update simplefin_accounts"
  on public.simplefin_accounts for update using (household_id in (select user_household_ids()));
create policy "Household members can delete simplefin_accounts"
  on public.simplefin_accounts for delete using (household_id in (select user_household_ids()));
