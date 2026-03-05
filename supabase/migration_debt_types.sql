-- Add debt_type column to debts table
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS debt_type TEXT NOT NULL DEFAULT 'other';
