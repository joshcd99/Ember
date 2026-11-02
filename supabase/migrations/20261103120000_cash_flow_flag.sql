-- Per-account control over which cash accounts anchor the cash-flow
-- register and calendar running balances.

alter table public.savings_accounts
  add column if not exists include_in_cash_flow boolean not null default true;
