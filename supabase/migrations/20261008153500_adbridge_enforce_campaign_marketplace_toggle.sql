-- Enforce the admin marketplace switch at the database boundary.
drop policy if exists "campaigns advertiser insert" on public.campaigns;
create policy "campaigns advertiser insert"
on public.campaigns
for insert to authenticated
with check (
  (advertiser_id = auth.uid())
  and (
    exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
    or (
      exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'advertiser')
      and coalesce((select allow_new_campaigns from public.platform_settings where id=1),true)
    )
  )
);
