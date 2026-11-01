-- Multiple promotional balances per debt (e.g. store cards granting separate
-- 6/12/18-month interest-free windows per purchase). Replaces the single-promo
-- columns on debts; those columns are kept in place (unused) so stale clients
-- keep working, but new clients read and write debt_promos only.

create table public.debt_promos (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  debt_id uuid references public.debts(id) on delete cascade not null,
  label text not null default '',
  promo_type text not null check (promo_type in ('deferred_interest', 'true_zero')),
  promo_apr numeric(6,4) not null default 0,
  promo_end_date date not null,
  promo_balance numeric(12,2) not null,
  deferred_interest_accrued numeric(12,2),
  created_at timestamptz not null default now()
);

create index idx_debt_promos_debt on public.debt_promos(debt_id);
create index idx_debt_promos_household on public.debt_promos(household_id);

alter table public.debt_promos enable row level security;

create policy "Household members can view debt_promos"
  on public.debt_promos for select using (household_id in (select user_household_ids()));
create policy "Household members can insert debt_promos"
  on public.debt_promos for insert with check (household_id in (select user_household_ids()));
create policy "Household members can update debt_promos"
  on public.debt_promos for update using (household_id in (select user_household_ids()));
create policy "Household members can delete debt_promos"
  on public.debt_promos for delete using (household_id in (select user_household_ids()));

-- Backfill: carry each debt's single promo over as one debt_promos row
insert into public.debt_promos (household_id, debt_id, promo_type, promo_apr, promo_end_date, promo_balance, deferred_interest_accrued)
select household_id, id, promo_type, coalesce(promo_apr, 0), promo_end_date::date, coalesce(promo_balance, current_balance), deferred_interest_accrued
from public.debts
where promo_type is not null and promo_end_date is not null;
