begin;

create or replace function public.admin_get_fraud_flag_evidence(p_flag_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_flag public.fraud_flags%rowtype;
  v_campaign_name text;
  v_events jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if private.current_user_profile_role() <> 'admin' then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if p_flag_id is null then
    raise exception 'fraud flag id is required' using errcode = '22023';
  end if;

  select * into v_flag from public.fraud_flags where id = p_flag_id;
  if not found then
    raise exception 'fraud flag not found' using errcode = 'P0002';
  end if;

  select c.name into v_campaign_name
  from public.campaigns c
  where c.id = v_flag.campaign_id;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.risk_score desc, e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select
      a.source_table, a.source_row_id, a.event_id, a.event_type,
      a.risk_score, a.risk_status, a.verification_status,
      a.verified, a.payable, a.risk_reasons,
      a.ip_hash, a.visitor_hash, a.session_hash, a.user_agent_hash,
      a.evidence, a.created_at
    from public.adbridge_event_assessments a
    where v_flag.campaign_id is not null
      and v_flag.creator_id is not null
      and a.campaign_id = v_flag.campaign_id
      and a.publisher_id = v_flag.creator_id
      and a.created_at >= v_flag.created_at - interval '1 hour'
      and a.created_at <= v_flag.created_at + interval '5 minutes'
      and (
        a.risk_score >= 40
        or a.risk_status in ('review', 'blocked')
        or a.source_row_id = v_flag.tracking_event_id
        or a.source_row_id = v_flag.conversion_id
      )
    order by a.risk_score desc, a.created_at desc
    limit 25
  ) e;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  into v_payments
  from (
    select cp.id, cp.amount, cp.status, cp.created_at,
      cp.source_click_id, cp.source_event_id, cp.source_ad_placement_event_id
    from public.campaign_payments cp
    where v_flag.campaign_id is not null
      and v_flag.creator_id is not null
      and cp.campaign_id = v_flag.campaign_id
      and cp.creator_id = v_flag.creator_id
      and cp.type = 'creator_payment'
      and cp.created_at >= v_flag.created_at - interval '1 hour'
      and cp.created_at <= v_flag.created_at + interval '5 minutes'
    order by cp.created_at desc
    limit 25
  ) p;

  return jsonb_build_object(
    'ok', true,
    'flag', to_jsonb(v_flag),
    'campaign_name', v_campaign_name,
    'events', v_events,
    'payments', v_payments
  );
end;
$function$;

revoke all on function public.admin_get_fraud_flag_evidence(uuid) from public, anon;
grant execute on function public.admin_get_fraud_flag_evidence(uuid) to authenticated;

comment on function public.admin_get_fraud_flag_evidence(uuid) is
  'Admin-only, SECURITY INVOKER evidence drilldown for one fraud flag. RLS remains authoritative for every source table.';

commit;
