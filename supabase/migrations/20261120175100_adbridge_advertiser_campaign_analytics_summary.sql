-- Return advertiser-owned campaign aggregates without exposing raw creator or conversion rows.
-- The private helper is SECURITY DEFINER only because cpa_conversion_events is intentionally
-- not directly readable by authenticated clients. It filters by auth.uid() and returns
-- aggregate counts only; the public API wrapper remains SECURITY INVOKER.

create or replace function private.get_my_advertiser_campaign_analytics()
returns table (
  campaign_id uuid,
  campaign_name text,
  goal text,
  platform text,
  campaign_status text,
  payment_method text,
  payment_rate numeric,
  max_budget numeric,
  desired_results integer,
  verified_views numeric,
  verified_submissions bigint,
  tracked_submissions bigint,
  latest_metric_check_at timestamptz,
  stale_metric_submissions bigint,
  tracking_clicks numeric,
  unique_tracking_clicks numeric,
  approved_conversions bigint,
  confirmed_funding numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    c.id,
    c.name,
    c.goal,
    c.platform,
    c.status,
    c.payment_method,
    c.payment_rate,
    c.max_budget,
    c.desired_results,
    coalesce(metric.verified_views, 0)::numeric,
    coalesce(metric.verified_submissions, 0)::bigint,
    coalesce(metric.tracked_submissions, 0)::bigint,
    metric.latest_metric_check_at,
    coalesce(metric.stale_metric_submissions, 0)::bigint,
    coalesce(link_metrics.tracking_clicks, 0)::numeric,
    coalesce(link_metrics.unique_tracking_clicks, 0)::numeric,
    coalesce(conversion_metrics.approved_conversions, 0)::bigint,
    coalesce(funding_metrics.confirmed_funding, 0)::numeric
  from public.campaigns c
  left join lateral (
    select
      coalesce(sum(s.current_metric) filter (where s.metric_status = 'verified'), 0)::numeric as verified_views,
      count(*) filter (where s.metric_status = 'verified') as verified_submissions,
      count(*) filter (
        where s.metric_status in ('tracking', 'verified')
          and s.last_metric_check_at is not null
      ) as tracked_submissions,
      max(s.last_metric_check_at) filter (
        where s.metric_status in ('tracking', 'verified')
      ) as latest_metric_check_at,
      count(*) filter (
        where s.metric_status in ('tracking', 'verified')
          and (
            s.last_metric_check_at is null
            or s.last_metric_check_at < pg_catalog.now() - interval '24 hours'
          )
      ) as stale_metric_submissions
    from public.submissions s
    where s.campaign_id = c.id
  ) metric on true
  left join lateral (
    select
      coalesce(sum(t.click_count), 0)::numeric as tracking_clicks,
      coalesce(sum(t.unique_click_count), 0)::numeric as unique_tracking_clicks
    from public.tracking_links t
    where t.campaign_id = c.id
  ) link_metrics on true
  left join lateral (
    select count(*) as approved_conversions
    from public.cpa_conversion_events e
    where e.campaign_id = c.id
      and e.status = 'approved'
  ) conversion_metrics on true
  left join lateral (
    select coalesce(sum(p.amount), 0)::numeric as confirmed_funding
    from public.campaign_payments p
    where p.campaign_id = c.id
      and p.type = 'funding'
      and p.status in ('held', 'released')
  ) funding_metrics on true
  where c.advertiser_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'advertiser'
    )
  order by c.created_at desc;
$function$;

create or replace function public.get_my_advertiser_campaign_analytics()
returns table (
  campaign_id uuid,
  campaign_name text,
  goal text,
  platform text,
  campaign_status text,
  payment_method text,
  payment_rate numeric,
  max_budget numeric,
  desired_results integer,
  verified_views numeric,
  verified_submissions bigint,
  tracked_submissions bigint,
  latest_metric_check_at timestamptz,
  stale_metric_submissions bigint,
  tracking_clicks numeric,
  unique_tracking_clicks numeric,
  approved_conversions bigint,
  confirmed_funding numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from private.get_my_advertiser_campaign_analytics();
$function$;

grant usage on schema private to authenticated;

revoke all on function private.get_my_advertiser_campaign_analytics()
  from public, anon, authenticated;
grant execute on function private.get_my_advertiser_campaign_analytics()
  to authenticated;

revoke all on function public.get_my_advertiser_campaign_analytics()
  from public, anon, authenticated;
grant execute on function public.get_my_advertiser_campaign_analytics()
  to authenticated;

comment on function private.get_my_advertiser_campaign_analytics()
  is 'Returns aggregate-only analytics for campaigns owned by the authenticated advertiser; raw creator and conversion records are not exposed.';

comment on function public.get_my_advertiser_campaign_analytics()
  is 'Authenticated advertiser analytics summary with verified metric freshness, clicks, approved conversions, and confirmed funding.';
