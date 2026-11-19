create or replace function public.current_user_profile_role()
returns text language sql stable security definer set search_path=public,pg_temp
as $$ select p.role from public.profiles p where p.id=auth.uid() limit 1; $$;
create or replace function public.is_current_user_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;
revoke all on function public.current_user_profile_role() from public,anon;
revoke all on function public.is_current_user_admin() from public,anon;
grant execute on function public.current_user_profile_role() to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
using (id=(select auth.uid()) or public.is_current_user_admin())
with check ((id=(select auth.uid()) and role=public.current_user_profile_role()) or public.is_current_user_admin());
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert to authenticated
with check (id=(select auth.uid()) and role=any(array['creator'::text,'advertiser'::text,'publisher'::text]));
