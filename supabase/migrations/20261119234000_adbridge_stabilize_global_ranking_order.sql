create or replace function public.get_adbridge_global_rankings()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $function$
select jsonb_build_object(
 'creators',coalesce((
  select jsonb_agg(jsonb_build_object('display_name',x.display_name,'verified_views',x.verified_views,'verified_clicks',x.verified_clicks,'verified_deliveries',x.verified_deliveries)
   order by x.score desc,x.verified_views desc,x.verified_clicks desc)
  from (
   select p.display_name,
    count(*) filter(where a.event_type='video_view')::bigint as verified_views,
    count(*) filter(where a.event_type='click')::bigint as verified_clicks,
    count(*)::bigint as verified_deliveries,
    (count(*) filter(where a.event_type='video_view')*3 + count(*) filter(where a.event_type='click')*2 + count(*))::bigint as score
   from public.adbridge_event_assessments a join public.profiles p on p.id=a.publisher_id
   where a.publisher_id is not null and a.verified=true and a.risk_status='low' and a.verification_status='verified'
     and p.role in ('creator','publisher')
   group by p.id,p.display_name
   order by score desc,verified_views desc,verified_clicks desc limit 20
  ) x
 ),'[]'::jsonb),
 'advertisers',coalesce((
  select jsonb_agg(jsonb_build_object('display_name',x.display_name,'budget_funded',x.budget_funded,'campaign_count',x.campaign_count)
   order by x.budget_funded desc,x.campaign_count desc)
  from (
   select p.display_name,count(distinct c.id)::bigint as campaign_count,
    coalesce(sum(cp.amount) filter(where cp.type='funding' and cp.status in ('held','released')),0)::numeric(18,2) as budget_funded
   from public.campaigns c join public.profiles p on p.id=c.advertiser_id
   left join public.campaign_payments cp on cp.campaign_id=c.id
   where c.advertiser_id is not null and p.role='advertiser'
   group by p.id,p.display_name
   order by budget_funded desc,campaign_count desc limit 20
  ) x
 ),'[]'::jsonb),
 'currency','NGN','updated_at',now()
);
$function$;
revoke all on function public.get_adbridge_global_rankings() from public,authenticated;
grant execute on function public.get_adbridge_global_rankings() to anon,authenticated;
