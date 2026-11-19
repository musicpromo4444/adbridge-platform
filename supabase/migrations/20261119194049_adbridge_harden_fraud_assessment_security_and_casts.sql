drop policy if exists admin_read_adbridge_event_assessments on public.adbridge_event_assessments;
create policy admin_read_adbridge_event_assessments on public.adbridge_event_assessments
for select to authenticated using (private.current_user_profile_role()='admin');
grant select on public.adbridge_event_assessments to authenticated;

create or replace function public.admin_fraud_health()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
  select jsonb_build_object('events_24h',count(*),'verified_24h',count(*) filter(where verified),
    'review_queue',count(*) filter(where risk_status='review'),'blocked_24h',count(*) filter(where risk_status='blocked'),
    'payable_24h',count(*) filter(where payable)) into v_result
  from public.adbridge_event_assessments where created_at>=now()-interval '24 hours';
  return coalesce(v_result,'{}'::jsonb);
end; $$;
revoke all on function public.admin_fraud_health() from public,anon;
grant execute on function public.admin_fraud_health() to authenticated;

create or replace function public.adbridge_score_event(
  p_event_type text,p_source text,p_metadata jsonb,p_visitor_velocity integer default 0,p_ip_velocity integer default 0
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_score integer:=0; v_reasons text[]:='{}'; v_trusted boolean:=false; v_evidence boolean:=false;
  v_verified boolean:=false; v_status text:='low'; v_verification text:='unverified';
  v_type text:=lower(coalesce(p_event_type,'')); v_source text:=lower(coalesce(p_source,''));
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb); v_viewable numeric:=0; v_visible_ms integer:=0;
  v_watch numeric:=0; v_heartbeats integer:=0;
begin
  v_trusted:=v_source in ('platform_api_verified','first_party_player_verified','server_ad_sdk_verified')
    and coalesce(v_meta->>'server_verified','false')='true';
  if coalesce(v_meta->>'automation_detected','false')='true' or coalesce(v_meta->>'webdriver','false')='true'
     or coalesce(v_meta->>'headless','false')='true'
     or coalesce(v_meta->>'user_agent','') ~* '(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)' then
    v_score:=v_score+70; v_reasons:=array_append(v_reasons,'automation_signal');
  end if;
  if coalesce(p_visitor_velocity,0)>=50 then v_score:=v_score+70; v_reasons:=array_append(v_reasons,'visitor_velocity_critical');
  elsif coalesce(p_visitor_velocity,0)>=20 then v_score:=v_score+40; v_reasons:=array_append(v_reasons,'visitor_velocity_high'); end if;
  if coalesce(p_ip_velocity,0)>=60 then v_score:=v_score+70; v_reasons:=array_append(v_reasons,'ip_velocity_critical');
  elsif coalesce(p_ip_velocity,0)>=15 then v_score:=v_score+40; v_reasons:=array_append(v_reasons,'ip_velocity_high'); end if;
  if coalesce(v_meta->>'duplicate_signal','false')='true' then v_score:=v_score+100; v_reasons:=array_append(v_reasons,'duplicate_event_signal'); end if;
  if v_type not in ('click','impression','video_view','install','conversion') then v_score:=v_score+60; v_reasons:=array_append(v_reasons,'unsupported_event_type'); end if;
  if coalesce(v_meta->>'viewable_ratio','') ~ '^([0-9]+)([.][0-9]+)?$' then v_viewable:=(v_meta->>'viewable_ratio')::numeric; end if;
  if coalesce(v_meta->>'visible_ms','') ~ '^[0-9]+$' then v_visible_ms:=(v_meta->>'visible_ms')::integer; end if;
  if coalesce(v_meta->>'watch_seconds','') ~ '^([0-9]+)([.][0-9]+)?$' then v_watch:=(v_meta->>'watch_seconds')::numeric; end if;
  if coalesce(v_meta->>'heartbeat_count','') ~ '^[0-9]+$' then v_heartbeats:=(v_meta->>'heartbeat_count')::integer; end if;
  if v_type='impression' then
    v_evidence:=coalesce(v_meta->>'rendered','false')='true' and v_viewable>=0.5 and v_visible_ms>=1000;
    if not v_evidence then v_reasons:=array_append(v_reasons,'impression_viewability_unproven'); end if;
  elsif v_type='video_view' then
    v_evidence:=coalesce(v_meta->>'playback_started','false')='true' and v_watch>=2 and v_heartbeats>=2 and coalesce(v_meta->>'page_visible','false')='true';
    if not v_evidence then v_reasons:=array_append(v_reasons,'video_playback_unproven'); end if;
  elsif v_type='click' then
    v_evidence:=coalesce(v_meta->>'destination_loaded','false')='true';
    if not v_evidence then v_reasons:=array_append(v_reasons,'destination_load_unproven'); end if;
  elsif v_type in ('install','conversion') then
    v_evidence:=nullif(coalesce(v_meta->>'receipt_id',''),'') is not null;
    if not v_evidence then v_reasons:=array_append(v_reasons,'receipt_missing'); end if;
  end if;
  if v_score>=70 then v_status:='blocked'; elsif v_score>=40 then v_status:='review'; end if;
  v_verified:=v_trusted and v_evidence and v_status='low';
  if v_status='blocked' then v_verification:='rejected'; elsif v_status='review' then v_verification:='pending_review'; elsif v_verified then v_verification:='verified'; end if;
  return jsonb_build_object('risk_score',least(v_score,100),'risk_status',v_status,
    'verification_status',v_verification,'verified',v_verified,'payable',false,'risk_reasons',to_jsonb(v_reasons));
end; $$;
