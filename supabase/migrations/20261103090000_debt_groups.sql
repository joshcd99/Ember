-- Debt groups: debts sharing a group_name (e.g. 14 federal student loans
-- billed as one servicer payment) display as one combined card/payment,
-- while payoff math stays per-loan.

alter table public.debts add column if not exists group_name text;

-- Payment plan: 'rap' = federal Repayment Assistance Plan (unpaid interest
-- waived, >= min($50, payment)/mo principal reduction, 30-year forgiveness)
alter table public.debts add column if not exists payment_plan text;
