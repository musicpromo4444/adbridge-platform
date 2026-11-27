-- Keep the scheduled metric refresh private and include publishers with verified inventory in the public leaderboard.

insert into public.adbridge_service_secrets(key_name, secret_value, updated_at)
values ('metrics_scheduler', gen_random_uuid()::text || gen_random_uuid()::text, now())
on conflict (key_name) do nothing;

do $migration$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'adbridge-metric-verification'
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      command := $command$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='adbridge_project_url') || '/functions/v1/track-all-metrics',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='adbridge_publishable_key'),
            'apikey',(select decrypted_secret from vault.decrypted_secrets where name='adbridge_publishable_key'),
            'x-adbridge-cron-secret',(select secret_value from public.adbridge_service_secrets where key_name='metrics_scheduler')
          ),
          body := jsonb_build_object('scheduled_at', now())
        ) as request_id;
      $command$
    );
  end if;
end
$migration$;

create or replace function public.get_adbridge_global_rankings()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
with social_view_by_post as (
  select s.creator_id,coalesce(s.external_video_id,s.id::text) as video_key,max(s.current_metric)::bigint as views
  from public.submissions s join public.profiles p on p.id=s.creator_id
  where s.metric_status='verified' and p.role='creator' and p.verified=true
  group by s.creator_id,coalesce(s.external_video_id,s.id::text)
),
social_views as (
  select creator_id,coalesce(sum(views),0)::bigint views from social_view_by_post group by creator_id
),
social_deliveries as (
  select s.creator_id,count(distinct coalesce(s.external_video_id,s.id::text))::bigint deliveries
  from public.submissions s join public.profiles p on p.id=s.creator_id
  where s.metric_status='verified' and p.role='creator' and p.verified=true
  group by s.creator_id
),
verified_link_clicks as (
  select tl.creator_id,count(*)::bigint clicks
  from public.tracking_clicks tc
  join public.tracking_links tl on tl.id=tc.tracking_link_id
  join public.adbridge_event_assessments a on a.source_table='tracking_clicks' and a.source_row_id=tc.id and a.verified=true and a.risk_status='low'
  join public.profiles p on p.id=tl.creator_id
  where (p.role='creator' and p.verified=true)
     or (p.role='publisher' and exists(select 1 from public.publisher_properties pp where pp.publisher_id=p.id and pp.verified=true))
  group by tl.creator_id
),
publisher_events as (
  select e.publisher_id,
    count(*) filter(where e.event_type='video_view')::bigint views,
    count(*) filter(where e.event_type='click')::bigint clicks,
    count(*) filter(where e.event_type='impression')::bigint deliveries
  from public.ad_placement_events e
  join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low'
  join public.profiles p on p.id=e.publisher_id
  where e.publisher_id is not null
    and ((p.role='creator' and p.verified=true)
      or (p.role='publisher' and exists(select 1 from public.publisher_properties pp where pp.publisher_id=p.id and pp.verified=true)))
  group by e.publisher_id
),
creator_totals as (
  select p.id,p.display_name,
    coalesce(sv.views,0)+coalesce(pe.views,0) verified_views,
    coalesce(lc.clicks,0)+coalesce(pe.clicks,0) verified_clicks,
    coalesce(sd.deliveries,0)+coalesce(pe.deliveries,0) verified_deliveries
  from public.profiles p
  left join social_views sv on sv.creator_id=p.id
  left join social_deliveries sd on sd.creator_id=p.id
  left join verified_link_clicks lc on lc.creator_id=p.id
  left join publisher_events pe on pe.publisher_id=p.id
  where (p.role='creator' and p.verified=true)
     or (p.role='publisher' and exists(select 1 from public.publisher_properties pp where pp.publisher_id=p.id and pp.verified=true))
),
ranked_creators as (
  select display_name,verified_views,verified_clicks,verified_deliveries,
    (verified_views*3+verified_clicks*2+verified_deliveries)::numeric score
  from creator_totals
  where verified_views>0 or verified_clicks>0 or verified_deliveries>0
  order by score desc,verified_views desc,verified_clicks desc,verified_deliveries desc
  limit 20
),
advertiser_totals as (
  select p.display_name,
    coalesce(sum(cp.amount) filter(where cp.type='funding' and cp.status in ('held','released')),0)::numeric(18,2) budget_funded,
    count(distinct c.id) filter(where cp.type='funding' and cp.status in ('held','released'))::bigint campaign_count
  from public.profiles p join public.campaigns c on c.advertiser_id=p.id
  left join public.campaign_payments cp on cp.campaign_id=c.id
  where p.role='advertiser'
  group by p.id,p.display_name
),
ranked_advertisers as (
  select display_name,budget_funded,campaign_count from advertiser_totals where budget_funded>0
  order by budget_funded desc,campaign_count desc limit 20
)
select jsonb_build_object(
  'creators',coalesce((select jsonb_agg(jsonb_build_object('display_name',display_name,'verified_views',verified_views,'verified_clicks',verified_clicks,'verified_deliveries',verified_deliveries) order by score desc,verified_views desc,verified_clicks desc,verified_deliveries desc) from ranked_creators),'[]'::jsonb),
  'advertisers',coalesce((select jsonb_agg(jsonb_build_object('display_name',display_name,'budget_funded',budget_funded,'campaign_count',campaign_count) order by budget_funded desc,campaign_count desc) from ranked_advertisers),'[]'::jsonb),
  'currency','NGN','updated_at',now()
);
$function$;
