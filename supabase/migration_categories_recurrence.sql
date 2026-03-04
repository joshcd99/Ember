-- Bill Categories + Recurrence Fields Migration
-- Additive migration — safe to run on existing data

-- 1. Create bill_categories table
CREATE TABLE IF NOT EXISTS public.bill_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#8C8578',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique name per household
CREATE UNIQUE INDEX IF NOT EXISTS bill_categories_household_name_idx
  ON public.bill_categories(household_id, name);

-- RLS policies
ALTER TABLE public.bill_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household bill categories"
  ON public.bill_categories FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can insert bill categories for their household"
  ON public.bill_categories FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can update their household bill categories"
  ON public.bill_categories FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can delete their household bill categories"
  ON public.bill_categories FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- 2. Add recurrence columns to bills (all nullable for backward compat)
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_unit TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_days_of_week INTEGER[],
  ADD COLUMN IF NOT EXISTS recurrence_end_type TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end_occurrences INTEGER;

-- Check constraints for enum-like columns
ALTER TABLE public.bills
  ADD CONSTRAINT bills_recurrence_type_check
    CHECK (recurrence_type IS NULL OR recurrence_type IN ('weekly', 'biweekly', 'monthly', 'yearly', 'custom'));

ALTER TABLE public.bills
  ADD CONSTRAINT bills_recurrence_unit_check
    CHECK (recurrence_unit IS NULL OR recurrence_unit IN ('day', 'week', 'month', 'year'));

ALTER TABLE public.bills
  ADD CONSTRAINT bills_recurrence_end_type_check
    CHECK (recurrence_end_type IS NULL OR recurrence_end_type IN ('never', 'on_date', 'after_occurrences'));

ALTER TABLE public.bills
  ADD CONSTRAINT bills_recurrence_interval_positive
    CHECK (recurrence_interval IS NULL OR recurrence_interval > 0);

-- 3. Backfill recurrence fields from existing frequency column
UPDATE public.bills SET
  recurrence_type = CASE
    WHEN frequency = 'weekly' THEN 'weekly'
    WHEN frequency = 'biweekly' THEN 'custom'
    WHEN frequency = 'monthly' THEN 'monthly'
    ELSE 'monthly'
  END,
  recurrence_interval = CASE WHEN frequency = 'biweekly' THEN 2 ELSE 1 END,
  recurrence_unit = CASE
    WHEN frequency IN ('weekly', 'biweekly') THEN 'week'
    ELSE 'month'
  END,
  recurrence_end_type = 'never'
WHERE recurrence_type IS NULL;
