drop policy if exists "creator_campaigns own insert" on public.creator_campaigns;
create policy "creator_campaigns own insert" on public.creator_campaigns for insert to authenticated
with check (
 creator_id=(select auth.uid()) and status='accepted'
 and exists(select 1 from public.campaigns c where c.id=creator_campaigns.campaign_id and c.status='active')
 and (
  not exists(select 1 from public.campaign_tests t where t.campaign_id=creator_campaigns.campaign_id and t.required=true)
  or exists(select 1 from public.campaign_tests t join public.creator_campaign_tests ct on ct.campaign_test_id=t.id
   where t.campaign_id=creator_campaigns.campaign_id and t.required=true and ct.creator_id=(select auth.uid()) and ct.completed=true)
 )
);
drop policy if exists "creator test progress own insert" on public.creator_campaign_tests;
create policy "creator test progress own insert" on public.creator_campaign_tests for insert to authenticated
with check (creator_id=(select auth.uid()) and exists(select 1 from public.campaign_tests t where t.id=creator_campaign_tests.campaign_test_id and t.required=true));
