-- Clearpath Savings Migration
-- Run this in the Supabase SQL Editor AFTER migration_households.sql

-- ============================================
-- SAVINGS ACCOUNTS TABLE (one per household)
-- ============================================

create table public.savings_accounts (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  current_balance numeric(12,2) not null default 0,
  apy numeric(6,4) not null default 0,  -- decimal like interest_rate (0.045 = 4.5%)
  last_verified_at timestamptz default now(),
  unique (household_id)
);

create index idx_savings_accounts_household on public.savings_accounts(household_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.savings_accounts enable row level security;

create policy "Household members can view savings_accounts"
  on public.savings_accounts for select using (household_id in (select user_household_ids()));
create policy "Household members can insert savings_accounts"
  on public.savings_accounts for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update savings_accounts"
  on public.savings_accounts for update using (household_id in (select user_household_ids()));
create policy "Household members can delete savings_accounts"
  on public.savings_accounts for delete using (household_id in (select user_household_ids()));
