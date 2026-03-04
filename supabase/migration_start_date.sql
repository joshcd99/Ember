ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS start_date date;
