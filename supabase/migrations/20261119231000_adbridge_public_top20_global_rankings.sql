-- Public rankings expose aggregate performance only; never expose user IDs or private campaign data.
create or replace function public.get_adbridge_global_rankings()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  with creator_metrics as (
    select a.publisher_id,
      count(*) filter (where a.event_type='video_view')::bigint as verified_views,
      count(*) filter (where a.event_type='click')::bigint as verified_clicks,
      count(*)::bigint as verified_deliveries
    from public.adbridge_event_assessments a
    where a.publisher_id is not null
      and a.verified=true
      and a.risk_status='low'
      and a.verification_status='verified'
    group by a.publisher_id
  ),
  creator_top as (
    select p.display_name as display_name,
      coalesce(m.verified_views,0) as verified_views,
      coalesce(m.verified_clicks,0) as verified_clicks,
      coalesce(m.verified_deliveries,0) as verified_deliveries
    from creator_metrics m
    join public.profiles p on p.id=m.publisher_id
    where p.role in ('creator','publisher')
    order by (coalesce(m.verified_views,0)*3 + coalesce(m.verified_clicks,0)*2 + coalesce(m.verified_deliveries,0)) desc,
      coalesce(m.verified_views,0) desc, coalesce(m.verified_clicks,0) desc
    limit 20
  ),
  advertiser_metrics as (
    select c.advertiser_id,
      count(distinct c.id)::bigint as campaign_count,
      coalesce(sum(cp.amount) filter(where cp.type='funding' and cp.status in ('held','released')),0)::numeric(18,2) as budget_funded
    from public.campaigns c
    left join public.campaign_payments cp on cp.campaign_id=c.id
    where c.advertiser_id is not null
    group by c.advertiser_id
  ),
  advertiser_top as (
    select p.display_name as display_name,
      coalesce(m.budget_funded,0) as budget_funded,
      coalesce(m.campaign_count,0) as campaign_count
    from advertiser_metrics m
    join public.profiles p on p.id=m.advertiser_id
    where p.role='advertiser'
    order by coalesce(m.budget_funded,0) desc, coalesce(m.campaign_count,0) desc
    limit 20
  )
  select jsonb_build_object(
    'creators',coalesce((select jsonb_agg(to_jsonb(x)) from creator_top x),'[]'::jsonb),
    'advertisers',coalesce((select jsonb_agg(to_jsonb(x)) from advertiser_top x),'[]'::jsonb),
    'currency','NGN',
    'updated_at',now()
  );
$function$;
revoke all on function public.get_adbridge_global_rankings() from public,authenticated;
grant execute on function public.get_adbridge_global_rankings() to anon,authenticated;
