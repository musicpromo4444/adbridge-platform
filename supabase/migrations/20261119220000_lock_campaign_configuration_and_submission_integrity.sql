drop policy if exists "campaign_platforms_insert_owner" on public.campaign_platforms;
create policy "campaign_platforms_insert_owner" on public.campaign_platforms for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_platforms.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_platforms_update_owner" on public.campaign_platforms;
create policy "campaign_platforms_update_owner" on public.campaign_platforms for update to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_platforms.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin')
with check (exists(select 1 from public.campaigns c where c.id=campaign_platforms.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_platforms_delete_owner" on public.campaign_platforms;
create policy "campaign_platforms_delete_owner" on public.campaign_platforms for delete to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_platforms.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "advertisers create campaign formats" on public.campaign_formats;
create policy "advertisers create campaign formats" on public.campaign_formats for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_formats.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "advertisers update campaign formats" on public.campaign_formats;
create policy "advertisers update campaign formats" on public.campaign_formats for update to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_formats.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin')
with check (exists(select 1 from public.campaigns c where c.id=campaign_formats.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_formats_delete_owner" on public.campaign_formats;
create policy "campaign_formats_delete_owner" on public.campaign_formats for delete to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_formats.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_delivery_options_insert_owner" on public.campaign_delivery_options;
create policy "campaign_delivery_options_insert_owner" on public.campaign_delivery_options for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_delivery_options.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_delivery_options_update_owner" on public.campaign_delivery_options;
create policy "campaign_delivery_options_update_owner" on public.campaign_delivery_options for update to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_delivery_options.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin')
with check (exists(select 1 from public.campaigns c where c.id=campaign_delivery_options.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "campaign_delivery_options_delete_owner" on public.campaign_delivery_options;
create policy "campaign_delivery_options_delete_owner" on public.campaign_delivery_options for delete to authenticated
using (exists(select 1 from public.campaigns c where c.id=campaign_delivery_options.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "advertiser destination url insert" on public.campaign_destination_urls;
create policy "advertiser destination url insert" on public.campaign_destination_urls for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_destination_urls.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
create unique index if not exists campaign_destination_urls_one_per_campaign on public.campaign_destination_urls(campaign_id);
drop policy if exists "advertiser create tracking rules" on public.campaign_tracking_rules;
create policy "advertiser create tracking rules" on public.campaign_tracking_rules for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_tracking_rules.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "advertiser create campaign tests" on public.campaign_tests;
create policy "advertiser create campaign tests" on public.campaign_tests for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_tests.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "advertiser create campaign assets" on public.campaign_assets;
create policy "advertiser create campaign assets" on public.campaign_assets for insert to authenticated
with check (exists(select 1 from public.campaigns c where c.id=campaign_assets.campaign_id and c.advertiser_id=(select auth.uid()) and c.status='draft' and coalesce(c.funded_amount,0)=0) or private.current_user_profile_role()='admin');
drop policy if exists "submissions creator insert" on public.submissions;
create policy "submissions creator insert" on public.submissions for insert to authenticated
with check (
 creator_id=(select auth.uid()) and status='waiting' and current_metric=0
 and metric_status='pending' and metric_verified_at is null
 and last_metric_check_at is null and tracking_error is null
 and external_video_id is null and posted_url ~* '^https?://'
 and exists(
  select 1 from public.creator_campaigns j join public.campaigns c on c.id=j.campaign_id
  where j.id=submissions.creator_campaign_id and j.creator_id=(select auth.uid())
   and j.campaign_id=submissions.campaign_id
   and j.status=any(array['accepted','in_progress','changes_requested'])
   and (
    lower(coalesce(c.payment_method,'')) not in ('cpm','views')
    or (submissions.target_metric=c.desired_results and exists(
      select 1 from public.campaign_platforms cp where cp.campaign_id=c.id and cp.enabled=true
       and (cp.platform=submissions.tracking_platform or cp.platform='all')
    ))
   )
 )
);
drop policy if exists "creator insert metric verifications" on public.metric_verifications;
create policy "creator insert metric verifications" on public.metric_verifications for insert to authenticated
with check (status='pending' and reviewed_at is null and claimed_metric>=0 and exists(select 1 from public.submissions s where s.id=metric_verifications.submission_id and s.creator_id=(select auth.uid())));
