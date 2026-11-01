-- Generalize savings_accounts into named cash accounts (checking + savings),
-- and give SimpleFIN accounts custom labels, classification, and a direct
-- link to a cash account instead of the single-savings boolean.

alter table public.savings_accounts
  add column name text not null default 'Savings',
  add column kind text not null default 'savings' check (kind in ('checking', 'savings')),
  add column created_at timestamptz not null default now();

-- Multiple cash accounts per household are now allowed
alter table public.savings_accounts drop constraint savings_accounts_household_id_key;

alter table public.simplefin_accounts
  add column display_name text,
  add column account_kind text check (account_kind in ('checking', 'savings', 'credit_card', 'loan', 'other')),
  add column linked_savings_account_id uuid references public.savings_accounts(id) on delete set null;

-- Carry over existing savings links before dropping the boolean
update public.simplefin_accounts sa
set linked_savings_account_id = s.id
from public.savings_accounts s
where sa.linked_savings and s.household_id = sa.household_id;

alter table public.simplefin_accounts drop column linked_savings;
