drop policy if exists "publisher_campaigns_insert_own" on public.publisher_campaigns;
create policy "publisher_campaigns_insert_own" on public.publisher_campaigns for insert to authenticated
with check (
 publisher_id=(select auth.uid()) and private.current_user_profile_role()='publisher'
 and exists(select 1 from public.campaigns c where c.id=publisher_campaigns.campaign_id and c.status in ('funded','active'))
 and exists(select 1 from public.campaign_platforms cp where cp.campaign_id=publisher_campaigns.campaign_id and (cp.platform=publisher_campaigns.selected_platform or cp.platform='all') and cp.enabled=true)
 and exists(select 1 from public.campaign_formats cf where cf.campaign_id=publisher_campaigns.campaign_id and cf.format=publisher_campaigns.selected_format and cf.status='ready')
);
drop policy if exists "publisher_campaigns_update_own" on public.publisher_campaigns;
create policy "publisher_campaigns_advertiser_admin_update" on public.publisher_campaigns for update to authenticated
using (exists(select 1 from public.campaigns c where c.id=publisher_campaigns.campaign_id and c.advertiser_id=(select auth.uid())) or private.current_user_profile_role()='admin')
with check (exists(select 1 from public.campaigns c where c.id=publisher_campaigns.campaign_id and c.advertiser_id=(select auth.uid())) or private.current_user_profile_role()='admin');
drop policy if exists "publisher_properties owner insert" on public.publisher_properties;
create policy "publisher_properties owner insert" on public.publisher_properties for insert to authenticated
with check (publisher_id=(select auth.uid()) and private.current_user_profile_role()='publisher');
