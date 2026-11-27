-- Read-only, role-scoped campaign analytics for advertiser and creator dashboards.
-- SECURITY INVOKER keeps the caller's table privileges and RLS policies in force.
-- Apply only after the AdBridge Supabase project is resumed and this migration is reviewed.

create or replace function public.get_my_campaign_analytics()
returns table (
  campaign_count bigint,
  platform_reported_views bigint,
  tracked_clicks bigint,
  approved_conversions bigint,
  released_earnings numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = v_actor_id;

  if coalesce(v_actor_role, '') not in ('advertiser', 'creator') then
    raise exception using errcode = '42501', message = 'Campaign analytics are not available for this account';
  end if;

  if v_actor_role = 'advertiser' then
    return query
    select
      (
        select count(*)::bigint
          from public.campaigns c
         where c.advertiser_id = v_actor_id
      ),
      coalesce((
        select sum(greatest(coalesce(s.current_metric, 0), 0))
          from public.submissions s
          join public.campaigns c on c.id = s.campaign_id
         where c.advertiser_id = v_actor_id
           and s.last_metric_check_at is not null
           and s.metric_status in ('tracking', 'target_reached')
           and s.tracking_error is null
      ), 0)::bigint,
      coalesce((
        select sum(greatest(coalesce(tl.click_count, 0), 0))
          from public.tracking_links tl
          join public.campaigns c on c.id = tl.campaign_id
         where c.advertiser_id = v_actor_id
      ), 0)::bigint,
      (
        select count(*)::bigint
          from public.cpa_conversion_events e
          join public.campaigns c on c.id = e.campaign_id
         where c.advertiser_id = v_actor_id
           and e.status = 'approved'
      ),
      0::numeric;
  else
    return query
    select
      (
        select count(distinct j.campaign_id)::bigint
          from public.creator_campaigns j
         where j.creator_id = v_actor_id
      ),
      coalesce((
        select sum(greatest(coalesce(s.current_metric, 0), 0))
          from public.submissions s
         where s.creator_id = v_actor_id
           and s.last_metric_check_at is not null
           and s.metric_status in ('tracking', 'target_reached')
           and s.tracking_error is null
      ), 0)::bigint,
      coalesce((
        select sum(greatest(coalesce(tl.click_count, 0), 0))
          from public.tracking_links tl
         where tl.creator_id = v_actor_id
      ), 0)::bigint,
      0::bigint,
      coalesce((
        select sum(greatest(coalesce(cp.amount, 0), 0))
          from public.campaign_payments cp
         where cp.creator_id = v_actor_id
           and cp.type = 'creator_payment'
           and cp.status = 'released'
      ), 0)::numeric;
  end if;
end;
$function$;

-- The RPC is read-only and runs with caller privileges; no table grants or RLS
-- policies are widened. It is callable only by authenticated sessions.
revoke all on function public.get_my_campaign_analytics()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_campaign_analytics()
  to authenticated;

comment on function public.get_my_campaign_analytics() is
  'Returns only the authenticated advertiser or creator analytics permitted by existing table grants and RLS. Views are latest platform API-reported counts, not independently audited totals.';
