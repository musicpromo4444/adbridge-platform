drop policy if exists "creator_campaigns own insert" on public.creator_campaigns;
create policy "creator_campaigns own insert"
on public.creator_campaigns
for insert
to authenticated
with check (
 creator_id=(select auth.uid())
 and status='accepted'
 and exists (
   select 1 from public.profiles p
   where p.id=(select auth.uid()) and p.role='creator'
 )
 and (
   not coalesce((select ps.require_creator_verification from public.platform_settings ps where ps.id=1),false)
   or exists (
     select 1 from public.profiles p
     where p.id=(select auth.uid()) and p.verified=true
   )
 )
 and exists (
   select 1 from public.campaigns c
   where c.id=creator_campaigns.campaign_id and c.status='active'
 )
 and (
   not exists(select 1 from public.campaign_tests t where t.campaign_id=creator_campaigns.campaign_id and t.required=true)
   or exists(
     select 1
     from public.campaign_tests t
     join public.creator_campaign_tests ct on ct.campaign_test_id=t.id
     where t.campaign_id=creator_campaigns.campaign_id
       and t.required=true
       and ct.creator_id=(select auth.uid())
       and ct.completed=true
   )
 )
);
