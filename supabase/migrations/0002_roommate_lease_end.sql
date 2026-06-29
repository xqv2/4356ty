-- 0002_roommate_lease_end.sql
-- Adds optional lease-end date to roommates. Surfaced under the name on the
-- roommate card (e.g. "Aug 2026 · 20% discount").

alter table public.roommates
  add column if not exists lease_end_date date;
