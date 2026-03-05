-- Promotional balances, deferred interest tracking, and per-debt payment amounts
-- Run this in the Supabase SQL Editor

alter table public.debts
  add column promo_type text,
  -- 'deferred_interest' | 'true_zero' | null (null = no promo)
  add column promo_apr numeric(6,4),
  -- promotional rate (usually 0.00)
  add column promo_end_date date,
  -- when the promotional period expires
  add column promo_balance numeric(12,2),
  -- the balance subject to promotional terms
  add column regular_apr numeric(6,4),
  -- the post-promo APR (what kicks in after deadline)
  -- for non-promo debts this mirrors interest_rate
  add column actual_payment numeric(10,2);
  -- what the user is actually paying monthly on this debt
  -- null means "just the minimum"
