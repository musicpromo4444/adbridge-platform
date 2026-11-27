-- Publisher-facing reporting is aggregate-only. Raw event evidence remains admin-only.
create index if not exists adbridge_publisher_delivery_performance_idx
  on public.adbridge_event_assessments (publisher_id, created_at desc)
  where source_table = 'ad_placement_events';

create or replace function public.get_publisher_delivery_performance(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := coalesce(p_days, 30);
  v_from timestamptz;
  v_totals jsonb;
  v_types jsonb;
  v_daily jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'publisher'
  ) then
    raise exception 'Publisher account required' using errcode = '42501';
  end if;

  if v_days < 1 or v_days > 90 then
    raise exception 'Reporting window must be between 1 and 90 days' using errcode = '22023';
  end if;

  v_from := pg_catalog.now() - pg_catalog.make_interval(days => v_days);

  with scoped as (
    select a.event_type, a.risk_status, a.verification_status,
           a.verified, a.payable, a.created_at
    from public.adbridge_event_assessments a
    where a.publisher_id = v_uid
      and a.source_table = 'ad_placement_events'
      and a.created_at >= v_from
      and a.created_at <= pg_catalog.now()
  )
  select pg_catalog.jsonb_build_object(
    'total_events', pg_catalog.count(*),
    'verified_events', pg_catalog.count(*) filter (where verified),
    'payable_events', pg_catalog.count(*) filter (where payable),
    'under_review_events', pg_catalog.count(*) filter (where risk_status = 'review'),
    'blocked_events', pg_catalog.count(*) filter (where risk_status = 'blocked'),
    'rejected_events', pg_catalog.count(*) filter (where verification_status = 'rejected')
  ) into v_totals
  from scoped;

  with scoped as (
    select a.event_type, a.risk_status, a.verification_status,
           a.verified, a.payable
    from public.adbridge_event_assessments a
    where a.publisher_id = v_uid
      and a.source_table = 'ad_placement_events'
      and a.created_at >= v_from
      and a.created_at <= pg_catalog.now()
  ), grouped as (
    select event_type,
      pg_catalog.count(*) as total,
      pg_catalog.count(*) filter (where verified) as verified,
      pg_catalog.count(*) filter (where payable) as payable,
      pg_catalog.count(*) filter (where risk_status = 'review') as under_review,
      pg_catalog.count(*) filter (where risk_status = 'blocked') as blocked,
      pg_catalog.count(*) filter (where verification_status = 'rejected') as rejected
    from scoped
    group by event_type
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_type', event_type, 'total', total, 'verified', verified,
        'payable', payable, 'under_review', under_review,
        'blocked', blocked, 'rejected', rejected
      ) order by event_type
    ), '[]'::jsonb
  ) into v_types from grouped;

  with scoped as (
    select (a.created_at at time zone 'UTC')::date as event_day,
           a.verified, a.payable, a.risk_status, a.verification_status
    from public.adbridge_event_assessments a
    where a.publisher_id = v_uid
      and a.source_table = 'ad_placement_events'
      and a.created_at >= v_from
      and a.created_at <= pg_catalog.now()
  ), grouped as (
    select event_day,
      pg_catalog.count(*) as total,
      pg_catalog.count(*) filter (where verified) as verified,
      pg_catalog.count(*) filter (where payable) as payable,
      pg_catalog.count(*) filter (where risk_status = 'review') as under_review,
      pg_catalog.count(*) filter (where risk_status = 'blocked') as blocked,
      pg_catalog.count(*) filter (where verification_status = 'rejected') as rejected
    from scoped
    group by event_day
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'day', event_day, 'total', total, 'verified', verified,
        'payable', payable, 'under_review', under_review,
        'blocked', blocked, 'rejected', rejected
      ) order by event_day
    ), '[]'::jsonb
  ) into v_daily from grouped;

  return v_totals || pg_catalog.jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'generated_at', pg_catalog.now(),
    'event_types', v_types,
    'daily', v_daily
  );
end;
$function$;

revoke all on function public.get_publisher_delivery_performance(integer) from public, anon;
grant execute on function public.get_publisher_delivery_performance(integer) to authenticated;
