-- Add deferred_interest_accrued column to debts table
-- Stores the user-entered amount of deferred interest already accrued (from their statement)
ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS deferred_interest_accrued NUMERIC DEFAULT NULL;
