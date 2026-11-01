-- Optional free-text owner label on debts and cash accounts
-- (e.g. a household member's name, or "Joint"); null = unspecified/shared.

alter table public.debts add column owner text;
alter table public.savings_accounts add column owner text;
