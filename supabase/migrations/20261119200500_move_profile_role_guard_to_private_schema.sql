create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.current_user_profile_role()
returns text language sql stable security definer set search_path=public,pg_temp
as $$ select p.role from public.profiles p where p.id=auth.uid() limit 1; $$;
revoke all on function private.current_user_profile_role() from public,anon;
grant execute on function private.current_user_profile_role() to authenticated;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
using (id=(select auth.uid()) or private.current_user_profile_role()='admin')
with check ((id=(select auth.uid()) and role=private.current_user_profile_role()) or private.current_user_profile_role()='admin');
drop function if exists public.is_current_user_admin();
drop function if exists public.current_user_profile_role();
