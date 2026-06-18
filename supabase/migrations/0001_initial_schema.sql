-- =============================================================================
-- 0001_initial_schema.sql
-- Bills app — initial schema, RLS policies, and storage bucket.
--
-- Apply via Supabase Dashboard -> SQL editor (paste + Run), or with the
-- Supabase CLI:  `supabase db push`.
--
-- Idempotent: safe to re-run on a fresh DB (uses if-not-exists / drop+create
-- on policies). Drops are limited to policies we own.
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- TABLES
-- =============================================================================

-- ---- cycles -----------------------------------------------------------------
-- One row per (user, year, month). The user-facing "month" tab in the editor.
create table if not exists public.cycles (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  label       text        not null,
  year        int         not null,
  month       int         not null check (month between 1 and 12),
  created_at  timestamptz not null default now(),
  unique (user_id, year, month)
);

-- ---- bills ------------------------------------------------------------------
-- Line items inside a cycle. Money is stored as integer CENTS.
create table if not exists public.bills (
  id            uuid        primary key default gen_random_uuid(),
  cycle_id      uuid        not null references public.cycles(id) on delete cascade,
  vendor        text        not null,
  provider      text,
  amount_cents  int         not null default 0 check (amount_cents >= 0),
  pdf_path      text,                                              -- key in storage bucket 'bills'
  recurring     boolean     not null default false,
  kind          text        check (kind in ('electricity','water','trash','internet')),
  position      int         not null default 0,
  created_at    timestamptz not null default now()
);

-- ---- roommates --------------------------------------------------------------
-- A user's persistent roster of roommates. archived_at hides without deleting
-- so historical cycles still resolve names.
create table if not exists public.roommates (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  position     int         not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---- cycle_splits -----------------------------------------------------------
-- Per-(cycle, roommate) override + assigned animal for share links.
-- A roommate can have AT MOST ONE override active (cents OR percent, not both).
create table if not exists public.cycle_splits (
  cycle_id          uuid not null references public.cycles(id)    on delete cascade,
  roommate_id       uuid not null references public.roommates(id) on delete cascade,
  override_cents    int  check (override_cents is null or override_cents >= 0),
  override_percent  int  check (override_percent is null or (override_percent between 1 and 99)),
  animal            text not null,
  primary key (cycle_id, roommate_id),
  constraint one_override_at_most check (override_cents is null or override_percent is null)
);

-- ---- share_tokens -----------------------------------------------------------
-- 8-char alphanumeric token = the secret. Anon proof page reads by token.
create table if not exists public.share_tokens (
  token        text        primary key,
  cycle_id     uuid        not null references public.cycles(id)    on delete cascade,
  roommate_id  uuid        not null references public.roommates(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Bills are loaded ordered by position within a cycle.
create index if not exists idx_bills_cycle           on public.bills(cycle_id, position);

-- MonthTabs lists a user's cycles in reverse chronological order.
create index if not exists idx_cycles_user_year      on public.cycles(user_id, year desc, month desc);

-- Active roommates for the editor side panel.
create index if not exists idx_roommates_user        on public.roommates(user_id, position)
  where archived_at is null;

-- Reverse lookup of splits by roommate (rare, but cheap).
create index if not exists idx_splits_roommate       on public.cycle_splits(roommate_id);

-- Share-link generation replaces tokens for a cycle (delete + insert).
create index if not exists idx_share_tokens_cycle    on public.share_tokens(cycle_id);

-- Background expiry sweeps.
create index if not exists idx_share_tokens_expires  on public.share_tokens(expires_at);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.cycles        enable row level security;
alter table public.bills         enable row level security;
alter table public.roommates     enable row level security;
alter table public.cycle_splits  enable row level security;
alter table public.share_tokens  enable row level security;

-- ---- cycles : owner-only ----------------------------------------------------
drop policy if exists cycles_owner on public.cycles;
create policy cycles_owner on public.cycles
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- bills : owner via cycles ----------------------------------------------
drop policy if exists bills_owner on public.bills;
create policy bills_owner on public.bills
  for all
  using (
    exists (
      select 1 from public.cycles c
      where c.id = bills.cycle_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cycles c
      where c.id = bills.cycle_id and c.user_id = auth.uid()
    )
  );

-- ---- roommates : owner-only ------------------------------------------------
drop policy if exists roommates_owner on public.roommates;
create policy roommates_owner on public.roommates
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- cycle_splits : owner via cycle ----------------------------------------
drop policy if exists splits_owner on public.cycle_splits;
create policy splits_owner on public.cycle_splits
  for all
  using (
    exists (
      select 1 from public.cycles c
      where c.id = cycle_splits.cycle_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cycles c
      where c.id = cycle_splits.cycle_id and c.user_id = auth.uid()
    )
  );

-- ---- share_tokens : anon SELECT (token is the secret) + owner write/delete --
-- The proof page reads share_tokens with the anon key, then chains to its
-- cycle/bills/etc through the service-role client (bypasses RLS server-side).
-- Anon SELECT is restricted to NON-EXPIRED tokens so leaked old links die.
drop policy if exists share_tokens_anon_read on public.share_tokens;
create policy share_tokens_anon_read on public.share_tokens
  for select
  using (expires_at > now());

drop policy if exists share_tokens_owner_insert on public.share_tokens;
create policy share_tokens_owner_insert on public.share_tokens
  for insert
  with check (
    exists (
      select 1 from public.cycles c
      where c.id = share_tokens.cycle_id and c.user_id = auth.uid()
    )
  );

drop policy if exists share_tokens_owner_delete on public.share_tokens;
create policy share_tokens_owner_delete on public.share_tokens
  for delete
  using (
    exists (
      select 1 from public.cycles c
      where c.id = share_tokens.cycle_id and c.user_id = auth.uid()
    )
  );

-- =============================================================================
-- STORAGE
-- =============================================================================

-- Private bucket. Bill PDFs are downloaded only via short-lived signed URLs
-- minted by the server (owner editor) or the service-role client (proof page).
insert into storage.buckets (id, name, public)
values ('bills', 'bills', false)
on conflict (id) do nothing;

-- Path convention: <user_id>/<cycle_id>/<bill_id>.pdf
-- Owner can read/write/update/delete only inside their own top-level folder.

drop policy if exists bills_storage_owner_read on storage.objects;
create policy bills_storage_owner_read on storage.objects
  for select
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bills_storage_owner_insert on storage.objects;
create policy bills_storage_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bills_storage_owner_update on storage.objects;
create policy bills_storage_owner_update on storage.objects
  for update
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bills_storage_owner_delete on storage.objects;
create policy bills_storage_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anon does NOT need direct storage access; the proof page receives a signed
-- URL minted server-side per request (7-day TTL).
