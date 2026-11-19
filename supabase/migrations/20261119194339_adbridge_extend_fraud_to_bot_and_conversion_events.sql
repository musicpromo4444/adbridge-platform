create or replace function public.flag_tracking_click_velocity()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_campaign_id uuid; v_creator_id uuid; v_ip_count integer:=0; v_visitor_count integer:=0; v_bot boolean:=false;
begin
  select campaign_id,creator_id into v_campaign_id,v_creator_id from public.tracking_links where id=new.tracking_link_id;
  if v_campaign_id is null or v_creator_id is null then return new; end if;
  v_bot:=coalesce(new.user_agent,'') ~* '(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)';
  if v_bot then
    insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
    values(v_campaign_id,v_creator_id,'automated_user_agent','high','Tracking click used an automated or headless browser user-agent signature.',95,'open')
    on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
    do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
  end if;
  if nullif(trim(coalesce(new.ip_hash,'')),'') is not null then
    select count(*) into v_ip_count from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id
    where tl.campaign_id=v_campaign_id and tl.creator_id=v_creator_id and tc.ip_hash=new.ip_hash
      and tc.clicked_at>=now()-interval '10 minutes';
    if v_ip_count>=15 then
      insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
      values(v_campaign_id,v_creator_id,'click_ip_velocity','high','At least 15 tracked clicks from the same hashed IP within 10 minutes. Review for automated or incentivized traffic.',85,'open')
      on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
      do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
    end if;
  end if;
  if nullif(trim(coalesce(new.visitor_key,'')),'') is not null then
    select count(*) into v_visitor_count from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id
    where tl.creator_id=v_creator_id and tc.visitor_key=new.visitor_key and tc.clicked_at>=now()-interval '10 minutes';
    if v_visitor_count>=30 then
      insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
      values(v_campaign_id,v_creator_id,'visitor_click_velocity','high','At least 30 tracked clicks from the same visitor key across this publisher links within 10 minutes. Review for automated traffic.',90,'open')
      on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
      do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
    end if;
  end if;
  return new;
end; $function$;

alter table public.adbridge_event_assessments drop constraint if exists adbridge_event_assessments_source_table_check;
alter table public.adbridge_event_assessments add constraint adbridge_event_assessments_source_table_check
check(source_table in ('tracking_events','ad_placement_events','cpa_conversion_events'));
create index if not exists cpa_conversion_events_creator_velocity_idx on public.cpa_conversion_events(campaign_id,creator_id,converted_at desc);

create or replace function public.assess_cpa_conversion_fraud()
returns trigger language plpgsql set search_path = '' as $$
declare v_velocity integer:=0; v_result jsonb; v_reasons text[];
begin
  if new.creator_id is not null then
    select count(*) into v_velocity from public.cpa_conversion_events e
    where e.campaign_id=new.campaign_id and e.creator_id=new.creator_id
      and e.converted_at>=now()-interval '10 minutes';
  end if;
  v_result:=public.adbridge_score_event('conversion','platform_api_verified',
    jsonb_build_object('server_verified',true,'receipt_id',new.external_conversion_id),v_velocity,0);
  v_reasons:=array(select jsonb_array_elements_text(v_result->'risk_reasons'));
  insert into public.adbridge_event_assessments(source_table,source_row_id,event_id,campaign_id,publisher_id,event_type,
    risk_score,risk_status,verification_status,verified,payable,risk_reasons,evidence)
  values('cpa_conversion_events',new.id,new.external_conversion_id,new.campaign_id,new.creator_id,
    coalesce(new.action_type,'conversion'),(v_result->>'risk_score')::smallint,v_result->>'risk_status',
    v_result->>'verification_status',(v_result->>'verified')::boolean,false,v_reasons,
    jsonb_build_object('external_conversion_id',new.external_conversion_id,'action_type',new.action_type));
  if (v_result->>'risk_score')::integer>=40 and new.creator_id is not null then
    insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
    values(new.campaign_id,new.creator_id,'cpa_conversion_velocity',
      case when v_result->>'risk_status'='blocked' then 'high' else 'review' end,
      array_to_string(v_reasons,', '),(v_result->>'risk_score')::numeric,'open')
    on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
    do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
  end if;
  return new;
end; $$;
drop trigger if exists cpa_conversion_fraud_assessment on public.cpa_conversion_events;
create trigger cpa_conversion_fraud_assessment after insert on public.cpa_conversion_events
for each row execute function public.assess_cpa_conversion_fraud();
