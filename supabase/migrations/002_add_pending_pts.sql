-- Incremental migration for the already-running project — run once in
-- the SQL Editor. A brand-new project doesn't need this; schema.sql
-- already includes this column.
--
-- "Tama Time": points given during a lesson queue up here instead of
-- applying immediately (the island isn't always visible while class is
-- happening) — see useClassroomStore.js's distributeClass for where this
-- actually gets applied.

alter table public.students add column pending_pts integer not null default 0;
