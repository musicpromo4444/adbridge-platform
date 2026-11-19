drop policy if exists "submissions creator insert" on public.submissions;
create policy "submissions creator insert"
on public.submissions
for insert
to authenticated
with check (
 creator_id=(select auth.uid())
 and status='waiting'
 and current_metric=0
 and metric_verified_at is null
 and last_metric_check_at is null
 and tracking_error is null
 and external_video_id is null
 and posted_url ~* '^https?://'
 and exists (
   select 1
   from public.creator_campaigns j
   join public.campaigns c on c.id=j.campaign_id
   where j.id=submissions.creator_campaign_id
     and j.creator_id=(select auth.uid())
     and j.campaign_id=submissions.campaign_id
     and j.status in ('accepted','in_progress','changes_requested')
     and (
       (
         lower(coalesce(c.payment_method,'')) in ('cpm','views')
         and submissions.metric_status='pending'
         and submissions.target_metric=c.desired_results
         and exists (
           select 1 from public.campaign_platforms cp
           where cp.campaign_id=c.id
             and cp.enabled=true
             and (cp.platform=submissions.tracking_platform or cp.platform='all')
         )
       )
       or
       (
         lower(coalesce(c.payment_method,'')) not in ('cpm','views')
         and submissions.metric_status='not_required'
         and submissions.target_metric is null
       )
     )
 )
);
