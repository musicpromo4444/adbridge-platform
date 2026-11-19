-- Publisher applications must be backed by a verified property owned by the applicant.
drop policy if exists "publisher_campaigns_insert_own" on public.publisher_campaigns;

create policy "publisher_campaigns_insert_own" on public.publisher_campaigns
for insert to authenticated
with check (
  publisher_id = (select auth.uid())
  and private.current_user_profile_role() = 'publisher'
  and exists (
    select 1
    from public.campaigns c
    where c.id = publisher_campaigns.campaign_id
      and c.status in ('funded', 'active')
  )
  and exists (
    select 1
    from public.campaign_platforms cp
    where cp.campaign_id = publisher_campaigns.campaign_id
      and (cp.platform = publisher_campaigns.selected_platform or cp.platform = 'all')
      and cp.enabled = true
  )
  and exists (
    select 1
    from public.campaign_formats cf
    where cf.campaign_id = publisher_campaigns.campaign_id
      and cf.format = publisher_campaigns.selected_format
      and cf.status = 'ready'
  )
  and exists (
    select 1
    from public.publisher_properties pp
    where pp.publisher_id = (select auth.uid())
      and pp.verified = true
      and pp.platforms @> array[publisher_campaigns.selected_platform]::text[]
      and pp.ad_formats @> array[publisher_campaigns.selected_format]::text[]
  )
);
