-- Delete Household Data Migration
-- Run this in the Supabase SQL Editor AFTER migration_households.sql
--
-- Adds an RPC that deletes the calling user's household. Every data table
-- (debts, income_sources, bills, transactions, checkins, bill_categories,
-- household_settings, savings_accounts, household_members) references
-- households(id) ON DELETE CASCADE, so deleting the household row wipes
-- all household data in one statement. The auth account itself is untouched;
-- a fresh empty household is created on next sign-in / reload.

create or replace function public.delete_household_for_user()
returns void
language plpgsql
security definer
as $$
declare
  calling_user_id uuid := auth.uid();
begin
  if calling_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.households
  where id in (
    select household_id from public.household_members
    where user_id = calling_user_id and status = 'active'
  );
end;
$$;
