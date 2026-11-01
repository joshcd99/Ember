-- Free-text notes on the main entities
alter table public.debts add column notes text;
alter table public.income_sources add column notes text;
alter table public.bills add column notes text;
