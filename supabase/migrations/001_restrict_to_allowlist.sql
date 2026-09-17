-- Incremental migration for an ALREADY-running project (i.e. yours right
-- now) — run this once in the SQL Editor. A brand-new project doesn't
-- need this file at all; schema.sql already bakes the same restriction
-- in from the start.
--
-- Locks every table down to two accounts — see schema.sql's
-- is_allowed_owner() (this migration creates that same function) and its
-- comment for how to change the list later.

create or replace function public.is_allowed_owner()
returns boolean as $$
  select auth.email() in ('glover.taylorjames@gmail.com', 'daewoomarigold@gmail.com');
$$ language sql stable;

drop policy "owner full access" on public.classes;
create policy "owner full access" on public.classes
  for all
  using (owner_id = auth.uid() and public.is_allowed_owner())
  with check (owner_id = auth.uid() and public.is_allowed_owner());

drop policy "owner full access via class" on public.students;
create policy "owner full access via class" on public.students
  for all
  using (
    exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid())
    and public.is_allowed_owner()
  )
  with check (
    exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid())
    and public.is_allowed_owner()
  );

drop policy "owner full access" on public.user_settings;
create policy "owner full access" on public.user_settings
  for all
  using (owner_id = auth.uid() and public.is_allowed_owner())
  with check (owner_id = auth.uid() and public.is_allowed_owner());
