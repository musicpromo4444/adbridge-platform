drop policy if exists "public destination url read" on public.campaign_destination_urls;
create policy "participants read campaign destinations"
on public.campaign_destination_urls
for select
to authenticated
using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_destination_urls.campaign_id
      and (
        c.status in ('funded','active')
        or c.advertiser_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin'
        )
      )
  )
);
revoke select on table public.campaign_destination_urls from anon;
grant select on table public.campaign_destination_urls to authenticated;
