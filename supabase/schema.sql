-- Marigold Paradise — Supabase schema.
--
-- Run this once in the Supabase SQL Editor on a fresh project. See
-- CLAUDE.md's Database section for the setup steps this fits into
-- (creating the project, enabling the Google auth provider, etc).
--
-- Three tables, all scoped to the signed-in teacher via row-level
-- security (owner_id = auth.uid()) — no anonymous/public read path by
-- design (see CLAUDE.md: the island view also requires sign-in).
--
-- `growth` stores the whole progress object src/game/growth.js already
-- works with (currentTama, tamadex, closedTeens, closedBiomes,
-- unlockedSecrets, growthConsumedPts) as one jsonb blob — growth.js's pure
-- functions don't change at all, they just now read/write a blob that
-- happens to live in Postgres instead of localStorage.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.students (
  -- Not `default gen_random_uuid()` only — CSV import (see
  -- TeacherDashboard.jsx's parseClassCsv) preserves a spreadsheet's own
  -- UUID column when present by inserting it explicitly; the default only
  -- kicks in when the client omits `id` (manually-added students).
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  email text,
  gotchi_pts integer not null default 0,
  lifetime_pts integer not null default 0,
  -- 'current' (follow whatever's growing) or a stringified tamaId (a
  -- specific completed adult) — same union growth.js's resolveDisplayTama
  -- already handles, just stored as text since a column can't be "number
  -- or the literal string 'current'".
  display_tama_id text not null default 'current',
  growth jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per teacher — mirrors what used to be the localStorage store's
-- top-level `currentClassId`: which class is "live"/being projected, so
-- both the dashboard and the island agree on it.
create table public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  current_class_id uuid references public.classes(id) on delete set null
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.user_settings enable row level security;

create policy "owner full access" on public.classes
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- students has no owner_id of its own — ownership is via its class, same
-- as the app's own model (a student only ever exists inside one class).
create policy "owner full access via class" on public.students
  for all
  using (exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));

create policy "owner full access" on public.user_settings
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Realtime: both TeacherDashboard and IslandView subscribe to changes on
-- all three tables (src/data/useClassroomStore.js) so every signed-in
-- device — the teacher's device and whatever's projecting the island —
-- stays live without a reload.
alter publication supabase_realtime add table public.classes, public.students, public.user_settings;
