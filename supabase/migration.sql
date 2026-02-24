-- Clearpath Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

create table public.debts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  current_balance numeric(12,2) not null,
  starting_balance numeric(12,2) not null,
  interest_rate numeric(6,4) not null, -- stored as decimal, e.g. 0.2199
  minimum_payment numeric(10,2) not null,
  due_day integer not null check (due_day between 1 and 31),
  created_at timestamptz default now() not null,
  last_verified_at timestamptz
);

create table public.income_sources (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric(10,2) not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  next_expected_date date not null,
  is_variable boolean default false not null
);

create table public.bills (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric(10,2) not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  next_due_date date not null,
  category text not null default 'other'
);

create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('income', 'expense', 'debt_payment')),
  amount numeric(10,2) not null,
  label text not null,
  date date not null default current_date,
  linked_income_source_id uuid references public.income_sources(id) on delete set null,
  linked_debt_id uuid references public.debts(id) on delete set null,
  is_projected boolean default false not null
);

create table public.checkins (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  completed_at timestamptz,
  unique (user_id, date)
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_debts_user on public.debts(user_id);
create index idx_income_sources_user on public.income_sources(user_id);
create index idx_bills_user on public.bills(user_id);
create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_date on public.transactions(user_id, date);
create index idx_checkins_user on public.checkins(user_id);
create index idx_checkins_date on public.checkins(user_id, date);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.debts enable row level security;
alter table public.income_sources enable row level security;
alter table public.bills enable row level security;
alter table public.transactions enable row level security;
alter table public.checkins enable row level security;

-- Each user can only see/modify their own data

create policy "Users can view own debts"
  on public.debts for select using (auth.uid() = user_id);
create policy "Users can insert own debts"
  on public.debts for insert with check (auth.uid() = user_id);
create policy "Users can update own debts"
  on public.debts for update using (auth.uid() = user_id);
create policy "Users can delete own debts"
  on public.debts for delete using (auth.uid() = user_id);

create policy "Users can view own income_sources"
  on public.income_sources for select using (auth.uid() = user_id);
create policy "Users can insert own income_sources"
  on public.income_sources for insert with check (auth.uid() = user_id);
create policy "Users can update own income_sources"
  on public.income_sources for update using (auth.uid() = user_id);
create policy "Users can delete own income_sources"
  on public.income_sources for delete using (auth.uid() = user_id);

create policy "Users can view own bills"
  on public.bills for select using (auth.uid() = user_id);
create policy "Users can insert own bills"
  on public.bills for insert with check (auth.uid() = user_id);
create policy "Users can update own bills"
  on public.bills for update using (auth.uid() = user_id);
create policy "Users can delete own bills"
  on public.bills for delete using (auth.uid() = user_id);

create policy "Users can view own transactions"
  on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions"
  on public.transactions for insert with check (auth.uid() = user_id);
create policy "Users can update own transactions"
  on public.transactions for update using (auth.uid() = user_id);
create policy "Users can delete own transactions"
  on public.transactions for delete using (auth.uid() = user_id);

create policy "Users can view own checkins"
  on public.checkins for select using (auth.uid() = user_id);
create policy "Users can insert own checkins"
  on public.checkins for insert with check (auth.uid() = user_id);
create policy "Users can update own checkins"
  on public.checkins for update using (auth.uid() = user_id);
create policy "Users can delete own checkins"
  on public.checkins for delete using (auth.uid() = user_id);
