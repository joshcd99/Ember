-- Student loan deferment: no payments scheduled until the end date, and
-- interest optionally paused (subsidized loans) or accruing (unsubsidized).

alter table public.debts
  add column deferment_end_date date,
  add column deferment_interest_accrues boolean not null default true;
