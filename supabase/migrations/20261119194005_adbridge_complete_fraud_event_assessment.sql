-- AdBridge unified fraud assessment: social tracking + website/app ad placements.
create table if not exists public.adbridge_event_assessments (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('tracking_events','ad_placement_events')),
  source_row_id uuid not null,
  event_id text,
  campaign_id uuid,
  publisher_id uuid,
  event_type text not null,
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  risk_status text not null default 'low' check (risk_status in ('low','review','blocked')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending_review','verified','rejected')),
  verified boolean not null default false,
  payable boolean not null default false,
  risk_reasons text[] not null default '{}',
  ip_hash text,
  visitor_hash text,
  session_hash text,
  user_agent_hash text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint adbridge_assessment_payable_verified check (not payable or (verified and risk_status='low')),
  unique (source_table, source_row_id)
);
create index if not exists adbridge_assessments_campaign_time on public.adbridge_event_assessments(campaign_id, created_at desc);
create index if not exists adbridge_assessments_publisher_time on public.adbridge_event_assessments(publisher_id, created_at desc);
create index if not exists adbridge_assessments_risk_queue on public.adbridge_event_assessments(risk_status, created_at desc);
alter table public.adbridge_event_assessments enable row level security;
revoke all on public.adbridge_event_assessments from anon, authenticated;
grant select, insert, update on public.adbridge_event_assessments to service_role;

alter table public.ad_placement_events
  add column if not exists event_id text,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists publisher_id uuid references public.profiles(id) on delete set null,
  add column if not exists ip_hash text,
  add column if not exists user_agent_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ad_placement_events drop constraint if exists ad_placement_events_event_type_check;
alter table public.ad_placement_events add constraint ad_placement_events_event_type_check
  check (event_type = any (array['impression','click','video_view','install','conversion']::text[]));
create unique index if not exists ad_placement_events_event_id_uidx on public.ad_placement_events(event_id) where event_id is not null;
create index if not exists ad_placement_events_placement_time on public.ad_placement_events(placement_id, occurred_at desc);
create index if not exists ad_placement_events_ip_time on public.ad_placement_events(ip_hash, occurred_at desc) where ip_hash is not null;

create or replace function public.adbridge_score_event(
  p_event_type text,p_source text,p_metadata jsonb,
  p_visitor_velocity integer default 0,p_ip_velocity integer default 0
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_score integer := 0; v_reasons text[] := '{}'; v_trusted boolean := false;
  v_evidence boolean := false; v_verified boolean := false; v_status text := 'low';
  v_verification text := 'unverified'; v_type text := lower(coalesce(p_event_type,''));
  v_source text := lower(coalesce(p_source,'')); v_meta jsonb := coalesce(p_metadata,'{}'::jsonb);
  v_viewable numeric := 0; v_visible_ms integer := 0; v_watch numeric := 0; v_heartbeats integer := 0;
begin
  v_trusted := v_source in ('platform_api_verified','first_party_player_verified','server_ad_sdk_verified')
    and coalesce(v_meta->>'server_verified','false') = 'true';
  if coalesce(v_meta->>'automation_detected','false')='true'
     or coalesce(v_meta->>'webdriver','false')='true'
     or coalesce(v_meta->>'headless','false')='true'
     or coalesce(v_meta->>'user_agent','') ~* '(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)' then
    v_score := v_score + 70; v_reasons := array_append(v_reasons,'automation_signal');
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
revoke all on function public.adbridge_score_event(text,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.adbridge_score_event(text,text,jsonb,integer,integer) to service_role;

create or replace function public.assess_tracking_event_fraud()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_visitor_count integer:=0; v_ip_count integer:=0; v_result jsonb; v_publisher uuid:=new.creator_id;
  v_reasons text[];
begin
  if new.campaign_id is not null and nullif(new.visitor_id,'') is not null then
    select count(*) into v_visitor_count from public.tracking_events e
    where e.campaign_id=new.campaign_id and e.visitor_id=new.visitor_id and e.occurred_at>=now()-interval '10 minutes';
  end if;
  if new.campaign_id is not null and nullif(new.ip_hash,'') is not null then
    select count(*) into v_ip_count from public.tracking_events e
    where e.campaign_id=new.campaign_id and e.ip_hash=new.ip_hash and e.occurred_at>=now()-interval '10 minutes';
  end if;
  v_result:=public.adbridge_score_event(new.event_type,new.source,new.metadata,v_visitor_count,v_ip_count);
  v_reasons:=array(select jsonb_array_elements_text(v_result->'risk_reasons'));
  insert into public.adbridge_event_assessments(source_table,source_row_id,event_id,campaign_id,publisher_id,event_type,
    risk_score,risk_status,verification_status,verified,payable,risk_reasons,ip_hash,visitor_hash,session_hash,user_agent_hash,evidence)
  values('tracking_events',new.id,new.event_id,new.campaign_id,v_publisher,new.event_type,
    (v_result->>'risk_score')::smallint,v_result->>'risk_status',v_result->>'verification_status',
    (v_result->>'verified')::boolean,false,v_reasons,new.ip_hash,
    case when new.visitor_id is null then null else encode(extensions.digest(new.visitor_id,'sha256'),'hex') end,
    case when new.session_id is null then null else encode(extensions.digest(new.session_id,'sha256'),'hex') end,
    new.user_agent_hash,new.metadata);
  if (v_result->>'risk_score')::integer>=40 and new.campaign_id is not null and v_publisher is not null then
    insert into public.fraud_flags(campaign_id,creator_id,tracking_event_id,flag_type,severity,reason,score,status)
    values(new.campaign_id,v_publisher,new.id,'tracking_event_'||lower(new.event_type),
      case when v_result->>'risk_status'='blocked' then 'high' else 'review' end,
      array_to_string(v_reasons,', '),(v_result->>'risk_score')::numeric,'open')
    on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null
    do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;
  end if;
  return new;
end; $$;
drop trigger if exists tracking_event_fraud_assessment on public.tracking_events;
create trigger tracking_event_fraud_assessment after insert on public.tracking_events
for each row execute function public.assess_tracking_event_fraud();

create or replace function public.assess_ad_placement_event_fraud()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_placement public.ad_placements%rowtype; v_visitor_count integer:=0; v_ip_count integer:=0;
  v_result jsonb; v_reasons text[]; v_campaign uuid; v_publisher uuid;
begin
  select * into v_placement from public.ad_placements where id=new.placement_id;
  v_campaign:=coalesce(new.campaign_id,v_placement.campaign_id); v_publisher:=new.publisher_id;
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
drop trigger if exists ad_placement_event_fraud_assessment on public.ad_placement_events;
create trigger ad_placement_event_fraud_assessment after insert on public.ad_placement_events
for each row execute function public.assess_ad_placement_event_fraud();

create or replace function public.hold_existing_creator_payments_for_fraud()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('open','reviewing') and new.campaign_id is not null and new.creator_id is not null then
    update public.campaign_payments set status='held'
    where campaign_id=new.campaign_id and creator_id=new.creator_id
      and type='creator_payment' and status in ('pending','released');
  end if;
  return new;
end; $$;
drop trigger if exists fraud_flag_retroactive_payment_hold on public.fraud_flags;
create trigger fraud_flag_retroactive_payment_hold after insert or update of status on public.fraud_flags
for each row execute function public.hold_existing_creator_payments_for_fraud();

create or replace function public.admin_fraud_health()
returns jsonb language plpgsql security definer set search_path = '' as $$
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
