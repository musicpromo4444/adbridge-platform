-- Associate AdBridge ad placements with verified publisher-owned web/app inventory.
alter table public.ad_placements
  add column if not exists publisher_id uuid references public.profiles(id) on delete set null,
  add column if not exists publisher_property_id uuid references public.publisher_properties(id) on delete set null;
create index if not exists ad_placements_publisher_property_idx on public.ad_placements(publisher_property_id) where publisher_property_id is not null;
create index if not exists ad_placements_publisher_idx on public.ad_placements(publisher_id) where publisher_id is not null;

create or replace function public.sync_ad_placement_publisher()
returns trigger language plpgsql set search_path = '' as $$
declare v_owner uuid; v_verified boolean;
begin
  if new.publisher_property_id is not null then
    select publisher_id,verified into v_owner,v_verified from public.publisher_properties where id=new.publisher_property_id;
    if v_owner is null or not coalesce(v_verified,false) then raise exception 'publisher property must be verified before ad delivery' using errcode='42501'; end if;
    if new.publisher_id is not null and new.publisher_id<>v_owner then raise exception 'publisher property does not belong to this publisher' using errcode='42501'; end if;
    new.publisher_id:=v_owner;
  end if;
  return new;
end; $$;
drop trigger if exists sync_ad_placement_publisher_owner on public.ad_placements;
create trigger sync_ad_placement_publisher_owner before insert or update of publisher_id,publisher_property_id
on public.ad_placements for each row execute function public.sync_ad_placement_publisher();

alter table public.adbridge_event_assessments drop constraint if exists adbridge_event_assessments_source_table_check;
alter table public.adbridge_event_assessments add constraint adbridge_event_assessments_source_table_check
check(source_table in ('tracking_events','ad_placement_events','cpa_conversion_events','submission_metrics'));
create index if not exists submission_metrics_submission_time_idx on public.submission_metrics(submission_id,checked_at desc);

create or replace function public.adbridge_score_event(
  p_event_type text,p_source text,p_metadata jsonb,p_visitor_velocity integer default 0,p_ip_velocity integer default 0
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_score integer:=0; v_reasons text[]:='{}'; v_trusted boolean:=false; v_evidence boolean:=false;
  v_verified boolean:=false; v_status text:='low'; v_verification text:='unverified';
  v_type text:=lower(coalesce(p_event_type,'')); v_source text:=lower(coalesce(p_source,''));
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb); v_viewable numeric:=0; v_visible_ms integer:=0;
  v_watch numeric:=0; v_heartbeats integer:=0; v_views bigint:=0; v_delta bigint:=0; v_seconds numeric:=0; v_rate numeric:=0;
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
  if coalesce(v_meta->>'verified_view_count','') ~ '^[0-9]+$' then v_views:=(v_meta->>'verified_view_count')::bigint; end if;
  if coalesce(v_meta->>'delta_views','') ~ '^[0-9]+$' then v_delta:=(v_meta->>'delta_views')::bigint; end if;
  if coalesce(v_meta->>'seconds_since_previous','') ~ '^([0-9]+)([.][0-9]+)?$' then v_seconds:=(v_meta->>'seconds_since_previous')::numeric; end if;
  if v_seconds>0 then v_rate:=(v_delta::numeric*60)/v_seconds; end if;
  if v_rate>=500000 then v_score:=v_score+55; v_reasons:=array_append(v_reasons,'extreme_platform_view_velocity');
  elsif v_rate>=100000 then v_score:=v_score+35; v_reasons:=array_append(v_reasons,'unusual_platform_view_velocity'); end if;
  if v_type not in ('click','impression','video_view','install','conversion') then v_score:=v_score+60; v_reasons:=array_append(v_reasons,'unsupported_event_type'); end if;
  if coalesce(v_meta->>'viewable_ratio','') ~ '^([0-9]+)([.][0-9]+)?$' then v_viewable:=(v_meta->>'viewable_ratio')::numeric; end if;
  if coalesce(v_meta->>'visible_ms','') ~ '^[0-9]+$' then v_visible_ms:=(v_meta->>'visible_ms')::integer; end if;
  if coalesce(v_meta->>'watch_seconds','') ~ '^([0-9]+)([.][0-9]+)?$' then v_watch:=(v_meta->>'watch_seconds')::numeric; end if;
  if coalesce(v_meta->>'heartbeat_count','') ~ '^[0-9]+$' then v_heartbeats:=(v_meta->>'heartbeat_count')::integer; end if;
  if v_type='impression' then
    v_evidence:=coalesce(v_meta->>'rendered','false')='true' and v_viewable>=0.5 and v_visible_ms>=1000;
    if not v_evidence then v_reasons:=array_append(v_reasons,'impression_viewability_unproven'); end if;
  elsif v_type='video_view' then
    if v_source='platform_api_verified' then v_evidence:=v_trusted and v_views>=0;
    else v_evidence:=coalesce(v_meta->>'playback_started','false')='true' and v_watch>=2 and v_heartbeats>=2 and coalesce(v_meta->>'page_visible','false')='true'; end if;
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
  return jsonb_build_object('event_type',v_type,'risk_score',least(v_score,100),'risk_status',v_status,
    'verification_status',v_verification,'verified',v_verified,'payable',false,'risk_reasons',to_jsonb(v_reasons));
end; $$;

create or replace function public.assess_submission_metric_fraud()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_submission public.submissions%rowtype; v_previous bigint:=0; v_previous_at timestamptz;
  v_delta bigint:=0; v_seconds numeric:=0; v_meta jsonb; v_result jsonb; v_reasons text[];
begin
  if lower(coalesce(new.metric_name,''))<>'views' then return new; end if;
  select * into v_submission from public.submissions where id=new.submission_id;
  if not found then return new; end if;
  select metric_value,checked_at into v_previous,v_previous_at
  from public.submission_metrics where submission_id=new.submission_id and id<>new.id and checked_at<new.checked_at
  order by checked_at desc limit 1;
  if v_previous_at is not null then v_delta:=greatest(new.metric_value-coalesce(v_previous,0),0); v_seconds:=greatest(extract(epoch from (new.checked_at-v_previous_at)),1); end if;
  v_meta:=jsonb_build_object('server_verified',true,'verified_view_count',new.metric_value,'delta_views',v_delta,
    'seconds_since_previous',v_seconds,'platform',new.platform,'external_video_id',new.external_video_id);
  v_result:=public.adbridge_score_event('video_view','platform_api_verified',v_meta,0,0);
  v_reasons:=array(select jsonb_array_elements_text(v_result->'risk_reasons'));
  insert into public.adbridge_event_assessments(source_table,source_row_id,event_id,campaign_id,publisher_id,event_type,
    risk_score,risk_status,verification_status,verified,payable,risk_reasons,evidence)
  values('submission_metrics',new.id,new.id::text,v_submission.campaign_id,v_submission.creator_id,'video_view',
    (v_result->>'risk_score')::smallint,v_result->>'risk_status',v_result->>'verification_status',
    (v_result->>'verified')::boolean,false,v_reasons,v_meta);
  if (v_result->>'risk_score')::integer>=40 then
    insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
    values(v_submission.campaign_id,v_submission.creator_id,'platform_view_velocity',
      case when v_result->>'risk_status'='blocked' then 'high' else 'review' end,
      array_to_string(v_reasons,', '),(v_result->>'risk_score')::numeric,'open')
    on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
    do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
  end if;
  return new;
end; $$;
drop trigger if exists submission_metric_fraud_assessment on public.submission_metrics;
create trigger submission_metric_fraud_assessment after insert on public.submission_metrics
for each row execute function public.assess_submission_metric_fraud();

create or replace function public.assess_ad_placement_event_fraud()
returns trigger language plpgsql set search_path = '' as $$
declare v_placement public.ad_placements%rowtype; v_visitor_count integer:=0; v_ip_count integer:=0;
  v_result jsonb; v_reasons text[]; v_campaign uuid; v_publisher uuid;
begin
  select * into v_placement from public.ad_placements where id=new.placement_id;
  v_campaign:=coalesce(new.campaign_id,v_placement.campaign_id); v_publisher:=coalesce(new.publisher_id,v_placement.publisher_id);
  if nullif(new.visitor_key,'') is not null then
    select count(*) into v_visitor_count from public.ad_placement_events e
    where e.placement_id=new.placement_id and e.visitor_key=new.visitor_key and e.occurred_at>=now()-interval '10 minutes';
  end if;
  if nullif(new.ip_hash,'') is not null then
    select count(*) into v_ip_count from public.ad_placement_events e
    where e.placement_id=new.placement_id and e.ip_hash=new.ip_hash and e.occurred_at>=now()-interval '10 minutes';
  end if;
  v_result:=public.adbridge_score_event(new.event_type,'server_ad_sdk_verified',new.metadata,v_visitor_count,v_ip_count);
  v_reasons:=array(select jsonb_array_elements_text(v_result->'risk_reasons'));
  insert into public.adbridge_event_assessments(source_table,source_row_id,event_id,campaign_id,publisher_id,event_type,
    risk_score,risk_status,verification_status,verified,payable,risk_reasons,ip_hash,visitor_hash,session_hash,user_agent_hash,evidence)
  values('ad_placement_events',new.id,new.event_id,v_campaign,v_publisher,new.event_type,
    (v_result->>'risk_score')::smallint,v_result->>'risk_status',v_result->>'verification_status',
    (v_result->>'verified')::boolean,false,v_reasons,new.ip_hash,
    encode(extensions.digest(new.visitor_key,'sha256'),'hex'),
    case when new.session_id is null then null else encode(extensions.digest(new.session_id,'sha256'),'hex') end,
    new.user_agent_hash,new.metadata);
  if (v_result->>'risk_score')::integer>=40 and v_campaign is not null and v_publisher is not null then
    insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status)
    values(v_campaign,v_publisher,'publisher_ad_event_'||lower(new.event_type),
      case when v_result->>'risk_status'='blocked' then 'high' else 'review' end,
      array_to_string(v_reasons,', '),(v_result->>'risk_score')::numeric,'open')
    on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
    do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
  end if;
  return new;
end; $$;
