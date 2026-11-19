drop policy if exists "publisher_properties owner insert" on public.publisher_properties;
create policy "publisher_properties owner insert" on public.publisher_properties for insert to authenticated
with check (publisher_id=(select auth.uid()) and private.current_user_profile_role()='publisher' and coalesce(verified,false)=false);
drop policy if exists "publisher_channels_insert_own" on public.publisher_channels;
create policy "publisher_channels_insert_own" on public.publisher_channels for insert to authenticated
with check (publisher_id=(select auth.uid()) and private.current_user_profile_role()='publisher' and coalesce(verified,false)=false);
