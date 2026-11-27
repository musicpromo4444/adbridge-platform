do $$
declare r jsonb;
begin

  if not exists (
    select 1 from public.adbridge_service_secrets
    where key_name='metrics_scheduler' and length(secret_value)>=32
  ) then raise exception 'private metrics scheduler secret is missing or too short'; end if;
  if not exists (
    select 1 from cron.job
    where jobname='adbridge-video-metric-refresh'
      and active
      and position('x-adbridge-cron-secret' in command)>0
  ) then raise exception 'video metric refresh cron job is inactive or missing its private scheduler authentication header'; end if;

  if has_function_privilege('anon','public.resolve_tracking_destination(text)','EXECUTE') then raise exception 'anonymous clients can call destination resolver directly'; end if;
  if has_function_privilege('authenticated','public.resolve_tracking_destination(text)','EXECUTE') then raise exception 'signed-in clients can call destination resolver directly'; end if;
  if not has_function_privilege('service_role','public.resolve_tracking_destination(text)','EXECUTE') then raise exception 'server role cannot call destination resolver'; end if;
  if has_function_privilege('anon','public.record_tracking_click(text,text,text,text,text)','EXECUTE') then raise exception 'anonymous clients can call click payout RPC'; end if;
  if has_function_privilege('authenticated','public.record_tracking_click(text,text,text,text,text)','EXECUTE') then raise exception 'signed-in clients can call click payout RPC'; end if;
  if not has_function_privilege('service_role','public.record_tracking_click(text,text,text,text,text)','EXECUTE') then raise exception 'server role cannot call click payout RPC'; end if;

  if to_regprocedure('public.get_campaign_stop_quote(uuid,text)') is null
     or to_regprocedure('public.confirm_campaign_stop(uuid,text)') is null
     or to_regprocedure('public.admin_set_campaign_stop_fee_policy(numeric,numeric)') is null then
    raise exception 'campaign stop quote/confirmation RPCs are missing';
  end if;
  if has_function_privilege('anon','public.get_campaign_stop_quote(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.confirm_campaign_stop(uuid,text)','EXECUTE') then
    raise exception 'anonymous clients can access campaign stop/refund RPCs';
  end if;

  if to_regprocedure('public.admin_confirm_campaign_refund(uuid,text)') is null
     or to_regprocedure('public.admin_get_campaign_stop_fee_policy()') is null then
    raise exception 'admin refund settlement or campaign fee policy RPC is missing';
  end if;
  if has_function_privilege('anon','public.admin_confirm_campaign_refund(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.admin_get_campaign_stop_fee_policy()','EXECUTE') then
    raise exception 'anonymous clients can access admin campaign refund controls';
  end if;

  if not exists(select 1 from public.campaign_stop_fee_policy where id=1 and pause_fee_percent=0) then
    raise exception 'campaign pause must remain fee-free';
  end if;

  if to_regclass('public.adbridge_paystack_refund_attempts') is null
     or to_regprocedure('public.admin_prepare_paystack_campaign_refund(uuid)') is null
     or to_regprocedure('public.admin_update_paystack_refund_attempt(uuid,text,text,text)') is null
     or to_regprocedure('public.paystack_reconcile_refund_webhook(text,text,text)') is null then
    raise exception 'Paystack refund automation schema or RPCs are missing';
  end if;
  if has_table_privilege('anon','public.adbridge_paystack_refund_attempts','SELECT')
     or has_table_privilege('authenticated','public.adbridge_paystack_refund_attempts','SELECT') then
    raise exception 'client roles can read private Paystack refund attempts';
  end if;
  if has_function_privilege('anon','public.admin_prepare_paystack_campaign_refund(uuid)','EXECUTE')
     or has_function_privilege('anon','public.admin_update_paystack_refund_attempt(uuid,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.paystack_reconcile_refund_webhook(text,text,text)','EXECUTE') then
    raise exception 'unauthorized role can execute Paystack refund controls';
  end if;

  r:=public.adbridge_score_event('video_view','client','{"playback_started":true,"watch_seconds":30,"heartbeat_count":10,"page_visible":true}'::jsonb,0,0);
  if (r->>'verified')::boolean or (r->>'payable')::boolean then raise exception 'client-only video view was accepted'; end if;

  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true}'::jsonb,0,0);
  if (r->>'verified')::boolean then raise exception 'platform view without an explicit verified count was accepted'; end if;

  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true,"verified_view_count":2500,"delta_views":100,"seconds_since_previous":60}'::jsonb,0,0);
  if not (r->>'verified')::boolean or (r->>'payable')::boolean then raise exception 'trusted platform view metric gate failed'; end if;

  r:=public.adbridge_score_event('video_view','platform_api_verified','{"server_verified":true,"verified_view_count":900000,"delta_views":600000,"seconds_since_previous":60}'::jsonb,0,0);
  if r->>'risk_status'<>'review' or (r->>'verified')::boolean then raise exception 'extreme platform view velocity did not enter review'; end if;

  r:=public.adbridge_score_event('click','platform_api_verified','{"server_verified":true,"destination_loaded":true}'::jsonb,0,0);
  if r->>'event_type'<>'click' or (r->>'payable')::boolean then raise exception 'click was conflated with a payable view'; end if;

  r:=public.adbridge_score_event('video_view','client','{"watch_seconds":"not-a-number","heartbeat_count":"oops"}'::jsonb,0,0);
  if (r->>'verified')::boolean then raise exception 'malformed playback evidence passed'; end if;

  r:=public.adbridge_score_event('click','client','{"destination_loaded":true}'::jsonb,25,0);
  if r->>'risk_status'<>'review' then raise exception 'visitor velocity did not trigger review'; end if;

  r:=public.adbridge_score_event('impression','client','{"automation_detected":true}'::jsonb,0,0);
  if r->>'risk_status'<>'blocked' then raise exception 'automation signal did not block event'; end if;
end $$;