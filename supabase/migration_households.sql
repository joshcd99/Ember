-- Clearpath Household Migration
-- Run this in the Supabase SQL Editor AFTER migration.sql
-- Converts per-user data scoping to per-household

-- ============================================
-- 1a. NEW TABLES
-- ============================================

create table public.households (
  id uuid default uuid_generate_v4() primary key,
  name text not null default 'My Household',
  created_at timestamptz default now() not null
);

create table public.household_members (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  status text not null default 'active' check (status in ('active', 'pending')),
  joined_at timestamptz default now(),
  unique (household_id, user_id)
);

-- ============================================
-- 1b. ADD household_id COLUMNS (nullable initially)
-- ============================================

alter table public.debts add column household_id uuid references public.households(id) on delete cascade;
alter table public.income_sources add column household_id uuid references public.households(id) on delete cascade;
alter table public.bills add column household_id uuid references public.households(id) on delete cascade;
alter table public.transactions add column household_id uuid references public.households(id) on delete cascade;
alter table public.checkins add column household_id uuid references public.households(id) on delete cascade;

-- ============================================
-- 1c. BACKFILL existing data
-- ============================================

do $$
declare
  uid uuid;
  hid uuid;
begin
  for uid in
    select distinct user_id from public.debts
    union select distinct user_id from public.income_sources
    union select distinct user_id from public.bills
    union select distinct user_id from public.transactions
    union select distinct user_id from public.checkins
  loop
    insert into public.households (name) values ('My Household') returning id into hid;
    insert into public.household_members (household_id, user_id, status) values (hid, uid, 'active');
    update public.debts set household_id = hid where user_id = uid;
    update public.income_sources set household_id = hid where user_id = uid;
    update public.bills set household_id = hid where user_id = uid;
    update public.transactions set household_id = hid where user_id = uid;
    update public.checkins set household_id = hid where user_id = uid;
  end loop;
end $$;

-- ============================================
-- 1d. MAKE household_id NOT NULL
-- ============================================

alter table public.debts alter column household_id set not null;
alter table public.income_sources alter column household_id set not null;
alter table public.bills alter column household_id set not null;
alter table public.transactions alter column household_id set not null;
alter table public.checkins alter column household_id set not null;

-- ============================================
-- 1e. DROP OLD RLS POLICIES (must happen before dropping user_id columns)
-- ============================================

drop policy if exists "Users can view own debts" on public.debts;
drop policy if exists "Users can insert own debts" on public.debts;
drop policy if exists "Users can update own debts" on public.debts;
drop policy if exists "Users can delete own debts" on public.debts;

drop policy if exists "Users can view own income_sources" on public.income_sources;
drop policy if exists "Users can insert own income_sources" on public.income_sources;
drop policy if exists "Users can update own income_sources" on public.income_sources;
drop policy if exists "Users can delete own income_sources" on public.income_sources;

drop policy if exists "Users can view own bills" on public.bills;
drop policy if exists "Users can insert own bills" on public.bills;
drop policy if exists "Users can update own bills" on public.bills;
drop policy if exists "Users can delete own bills" on public.bills;

drop policy if exists "Users can view own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

drop policy if exists "Users can view own checkins" on public.checkins;
drop policy if exists "Users can insert own checkins" on public.checkins;
drop policy if exists "Users can update own checkins" on public.checkins;
drop policy if exists "Users can delete own checkins" on public.checkins;

-- ============================================
-- 1f. DROP user_id from shared tables
-- ============================================

-- Drop old indexes first
drop index if exists idx_debts_user;
drop index if exists idx_income_sources_user;
drop index if exists idx_bills_user;

alter table public.debts drop column user_id;
alter table public.income_sources drop column user_id;
alter table public.bills drop column user_id;

-- ============================================
-- 1g. UPDATE checkins unique constraint
-- ============================================

alter table public.checkins drop constraint checkins_user_id_date_key;
alter table public.checkins add constraint checkins_household_user_date_key unique (household_id, user_id, date);

-- ============================================
-- 1h. NEW INDEXES on household_id
-- ============================================

create index idx_debts_household on public.debts(household_id);
create index idx_income_sources_household on public.income_sources(household_id);
create index idx_bills_household on public.bills(household_id);
create index idx_transactions_household on public.transactions(household_id);
create index idx_transactions_household_date on public.transactions(household_id, date);
create index idx_checkins_household on public.checkins(household_id);
create index idx_checkins_household_date on public.checkins(household_id, user_id, date);

-- ============================================
-- 1i. HELPER FUNCTIONS
-- ============================================

-- RLS helper: returns household_ids the current user belongs to
create or replace function public.user_household_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select household_id from public.household_members
  where user_id = auth.uid() and status = 'active';
$$;

-- RPC: create a new household + membership for the calling user (bypasses RLS)
create or replace function public.create_household_for_user(household_name text default 'My Household')
returns uuid
language plpgsql
security definer
as $$
declare
  new_household_id uuid;
  calling_user_id uuid := auth.uid();
  calling_email text;
begin
  if calling_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select email into calling_email from auth.users where id = calling_user_id;

  insert into public.households (name) values (household_name) returning id into new_household_id;
  insert into public.household_members (household_id, user_id, invited_email, status)
    values (new_household_id, calling_user_id, calling_email, 'active');

  return new_household_id;
end;
$$;

-- RPC: accept a pending invite (bypasses RLS)
create or replace function public.accept_household_invite(invite_email text)
returns uuid
language plpgsql
security definer
as $$
declare
  calling_user_id uuid := auth.uid();
  found_household_id uuid;
  found_member_id uuid;
begin
  if calling_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id, household_id into found_member_id, found_household_id
    from public.household_members
    where invited_email = invite_email and status = 'pending'
    limit 1;

  if found_member_id is null then
    return null;
  end if;

  update public.household_members
    set user_id = calling_user_id, status = 'active', joined_at = now()
    where id = found_member_id;

  return found_household_id;
end;
$$;

-- ============================================
-- NEW HOUSEHOLD-SCOPED RLS POLICIES
-- ============================================

-- Debts
create policy "Household members can view debts"
  on public.debts for select using (household_id in (select user_household_ids()));
create policy "Household members can insert debts"
  on public.debts for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update debts"
  on public.debts for update using (household_id in (select user_household_ids()));
create policy "Household members can delete debts"
  on public.debts for delete using (household_id in (select user_household_ids()));

-- Income Sources
create policy "Household members can view income_sources"
  on public.income_sources for select using (household_id in (select user_household_ids()));
create policy "Household members can insert income_sources"
  on public.income_sources for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update income_sources"
  on public.income_sources for update using (household_id in (select user_household_ids()));
create policy "Household members can delete income_sources"
  on public.income_sources for delete using (household_id in (select user_household_ids()));

-- Bills
create policy "Household members can view bills"
  on public.bills for select using (household_id in (select user_household_ids()));
create policy "Household members can insert bills"
  on public.bills for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update bills"
  on public.bills for update using (household_id in (select user_household_ids()));
create policy "Household members can delete bills"
  on public.bills for delete using (household_id in (select user_household_ids()));

-- Transactions
create policy "Household members can view transactions"
  on public.transactions for select using (household_id in (select user_household_ids()));
create policy "Household members can insert transactions"
  on public.transactions for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update transactions"
  on public.transactions for update using (household_id in (select user_household_ids()));
create policy "Household members can delete transactions"
  on public.transactions for delete using (household_id in (select user_household_ids()));

-- Checkins
create policy "Household members can view checkins"
  on public.checkins for select using (household_id in (select user_household_ids()));
create policy "Household members can insert checkins"
  on public.checkins for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update checkins"
  on public.checkins for update using (household_id in (select user_household_ids()));
create policy "Household members can delete checkins"
  on public.checkins for delete using (household_id in (select user_household_ids()));

-- Households
alter table public.households enable row level security;

create policy "Members can view their households"
  on public.households for select using (id in (select user_household_ids()));
create policy "Members can update their households"
  on public.households for update using (id in (select user_household_ids()));
create policy "Authenticated users can create households"
  on public.households for insert with check (auth.uid() is not null);

-- Household Members
alter table public.household_members enable row level security;

create policy "Members can view household members"
  on public.household_members for select using (household_id in (select user_household_ids()));
create policy "Members can invite to their households"
  on public.household_members for insert with check (
    household_id in (select user_household_ids())
    or (user_id = auth.uid() and status = 'active')
  );
create policy "Members can update household members"
  on public.household_members for update using (
    household_id in (select user_household_ids())
    or user_id = auth.uid()
  );
create policy "Members can remove from their households"
  on public.household_members for delete using (household_id in (select user_household_ids()));
