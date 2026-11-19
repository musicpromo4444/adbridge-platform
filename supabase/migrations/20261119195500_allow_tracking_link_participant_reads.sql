drop policy if exists "tracking links participant read" on public.tracking_links;
create policy "tracking links participant read"
on public.tracking_links
for select
to authenticated
using (
  creator_id = (select auth.uid())
  or exists (
    select 1 from public.campaigns c
    where c.id = tracking_links.campaign_id
      and c.advertiser_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);
