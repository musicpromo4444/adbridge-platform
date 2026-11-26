-- Fraud detection pipeline hardening
create or replace function public.adbridge_score_event(p_event_type text,p_source text,p_metadata jsonb,p_visitor_velocity integer default 0,p_ip_velocity integer default 0)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_score integer:=0;v_reasons text[]:='{}';v_trusted boolean:=false;v_evidence boolean:=false;v_verified boolean:=false;v_status text:='low';v_verification text:='unverified';
 v_type text:=lower(coalesce(p_event_type,''));v_source text:=lower(coalesce(p_source,''));v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
 v_viewable numeric:=0;v_visible_ms integer:=0;v_watch numeric:=0;v_heartbeats integer:=0;v_views bigint:=0;v_delta bigint:=0;v_seconds numeric:=0;v_rate numeric:=0;
begin
 v_trusted:=v_source in ('platform_api_verified','first_party_player_verified','server_ad_sdk_verified','server_tracking_proxy_verified') and coalesce(v_meta->>'server_verified','false')='true';
 if coalesce(v_meta->>'automation_detected','false')='true' or coalesce(v_meta->>'webdriver','false')='true' or coalesce(v_meta->>'headless','false')='true' or coalesce(v_meta->>'user_agent','')~*'(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)' then v_score:=v_score+70;v_reasons:=array_append(v_reasons,'automation_signal');end if;
 if coalesce(p_visitor_velocity,0)>=50 then v_score:=v_score+70;v_reasons:=array_append(v_reasons,'visitor_velocity_critical');elsif coalesce(p_visitor_velocity,0)>=20 then v_score:=v_score+40;v_reasons:=array_append(v_reasons,'visitor_velocity_high');end if;
 if coalesce(p_ip_velocity,0)>=60 then v_score:=v_score+70;v_reasons:=array_append(v_reasons,'ip_velocity_critical');elsif coalesce(p_ip_velocity,0)>=15 then v_score:=v_score+40;v_reasons:=array_append(v_reasons,'ip_velocity_high');end if;
 if coalesce(v_meta->>'duplicate_signal','false')='true' then v_score:=v_score+100;v_reasons:=array_append(v_reasons,'duplicate_event_signal');end if;
 if coalesce(v_meta->>'verified_view_count','')~'^[0-9]+$' then v_views:=(v_meta->>'verified_view_count')::bigint;end if;
 if coalesce(v_meta->>'delta_views','')~'^[0-9]+$' then v_delta:=(v_meta->>'delta_views')::bigint;end if;
 if coalesce(v_meta->>'seconds_since_previous','')~'^([0-9]+)([.][0-9]+)?$' then v_seconds:=(v_meta->>'seconds_since_previous')::numeric;end if;
 if v_seconds>0 then v_rate:=(v_delta::numeric*60)/v_seconds;end if;
 if v_rate>=500000 then v_score:=v_score+55;v_reasons:=array_append(v_reasons,'extreme_platform_view_velocity');elsif v_rate>=100000 then v_score:=v_score+35;v_reasons:=array_append(v_reasons,'unusual_platform_view_velocity');end if;
 if v_type not in ('click','impression','video_view','install','conversion') then v_score:=v_score+60;v_reasons:=array_append(v_reasons,'unsupported_event_type');end if;
 if coalesce(v_meta->>'viewable_ratio','')~'^([0-9]+)([.][0-9]+)?$' then v_viewable:=(v_meta->>'viewable_ratio')::numeric;end if;
 if coalesce(v_meta->>'visible_ms','')~'^[0-9]+$' then v_visible_ms:=(v_meta->>'visible_ms')::integer;end if;
 if coalesce(v_meta->>'watch_seconds','')~'^([0-9]+)([.][0-9]+)?$' then v_watch:=(v_meta->>'watch_seconds')::numeric;end if;
 if coalesce(v_meta->>'heartbeat_count','')~'^[0-9]+$' then v_heartbeats:=(v_meta->>'heartbeat_count')::integer;end if;
 if v_type='impression' then v_evidence:=coalesce(v_meta->>'rendered','false')='true' and v_viewable>=0.5 and v_visible_ms>=1000;if not v_evidence then v_reasons:=array_append(v_reasons,'impression_viewability_unproven');end if;
 elsif v_type='video_view' then if v_source='platform_api_verified' then v_evidence:=v_trusted and (v_meta ? 'verified_view_count');else v_evidence:=coalesce(v_meta->>'playback_started','false')='true' and v_watch>=2 and v_heartbeats>=2 and coalesce(v_meta->>'page_visible','false')='true';end if;if not v_evidence then v_reasons:=array_append(v_reasons,'video_playback_unproven');end if;
 elsif v_type='click' then v_evidence:=coalesce(v_meta->>'destination_loaded','false')='true' or coalesce(v_meta->>'unique_click','false')='true';if not v_evidence then v_reasons:=array_append(v_reasons,'destination_load_unproven');end if;
 elsif v_type in ('install','conversion') then v_evidence:=nullif(coalesce(v_meta->>'receipt_id',''),'') is not null;if not v_evidence then v_reasons:=array_append(v_reasons,'receipt_missing');end if;end if;
 if v_score>=70 then v_status:='blocked';elsif v_score>=40 then v_status:='review';end if;
 v_verified:=v_trusted and v_evidence and v_status='low';
 if v_status='blocked' then v_verification:='rejected';elsif v_status='review' then v_verification:='pending_review';elsif v_verified then v_verification:='verified';end if;
 return jsonb_build_object('event_type',v_type,'risk_score',least(v_score,100),'risk_status',v_status,'verification_status',v_verification,'verified',v_verified,'payable',false,'risk_reasons',to_jsonb(v_reasons));
end;$$;

create or replace function public.assess_tracking_click_fraud()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.tracking_links%rowtype;v_visitor_count integer:=0;v_ip_count integer:=0;v_result jsonb;v_reasons text[];v_meta jsonb;v_score integer;v_risk text;
begin
 select * into v_link from public.tracking_links where id=new.tracking_link_id;if not found then return new;end if;
 select count(*) into v_visitor_count from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id where tl.creator_id=v_link.creator_id and tc.visitor_key=new.visitor_key and tc.clicked_at>=now()-interval '10 minutes';
 select count(*) into v_ip_count from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id where tl.campaign_id=v_link.campaign_id and tc.ip_hash=new.ip_hash and tc.clicked_at>=now()-interval '10 minutes';
 v_meta:=jsonb_build_object('server_verified',true,'unique_click',true,'destination_loaded',true,'automation_detected',coalesce(new.user_agent,'')~*'(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)','proxy_recorded',true);
 v_result:=public.adbridge_score_event('click','server_tracking_proxy_verified',v_meta,v_visitor_count,v_ip_count);v_score:=(v_result->>'risk_score')::integer;v_risk:=v_result->>'risk_status';v_reasons:=array(select jsonb_array_elements_text(v_result->'risk_reasons'));
 insert into public.adbridge_event_assessments(source_table,source_row_id,event_id,campaign_id,publisher_id,event_type,risk_score,risk_status,verification_status,verified,payable,risk_reasons,ip_hash,visitor_hash,user_agent_hash,evidence)
 values('tracking_clicks',new.id,new.id::text,v_link.campaign_id,v_link.creator_id,'click',v_score,v_risk,v_result->>'verification_status',(v_result->>'verified')::boolean,(v_result->>'verified')::boolean and v_risk='low',v_reasons,new.ip_hash,encode(extensions.digest(new.visitor_key,'sha256'),'hex'),case when coalesce(new.user_agent,'')='' then null else encode(extensions.digest(new.user_agent,'sha256'),'hex') end,null,v_meta);
 if v_score>=40 and v_link.creator_id is not null then insert into public.fraud_flags(campaign_id,creator_id,flag_type,severity,reason,score,status) values(v_link.campaign_id,v_link.creator_id,'tracking_click_risk',case when v_risk='blocked' then 'high' else 'review' end,array_to_string(v_reasons,', '),v_score,'open') on conflict(campaign_id,creator_id,flag_type) where status='open' and campaign_id is not null and creator_id is not null do update set score=greatest(public.fraud_flags.score,excluded.score),reason=excluded.reason;end if;
 return new;
end;$$;
drop trigger if exists tracking_click_event_fraud_assessment on public.tracking_clicks;
create trigger tracking_click_event_fraud_assessment after insert on public.tracking_clicks for each row execute function public.assess_tracking_click_fraud();

create or replace function public.record_tracking_click(p_slug text,p_visitor_key text,p_ip_hash text,p_user_agent text,p_referrer text)
returns table(target_url text,counted boolean,unique_counted boolean) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.tracking_links%rowtype;v_campaign public.campaigns%rowtype;v_click_id uuid;v_unique boolean:=false;v_paid_amount numeric(18,2);v_spent numeric(18,2);v_budget numeric(18,2);v_recent_ip_clicks integer;v_paid_count integer;v_open_fraud boolean;v_assessment public.adbridge_event_assessments%rowtype;v_risk_ok boolean:=false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 if nullif(trim(p_slug),'') is null or nullif(trim(p_visitor_key),'') is null or nullif(trim(p_ip_hash),'') is null then raise exception 'slug, visitor key and IP hash are required' using errcode='22023';end if;
 select * into v_link from public.tracking_links where slug=p_slug;if not found then return;end if;
 select * into v_campaign from public.campaigns where id=v_link.campaign_id for update;if not found or v_campaign.status not in ('funded','active') then return;end if;
 select count(*) into v_recent_ip_clicks from public.tracking_clicks where tracking_link_id=v_link.id and ip_hash=p_ip_hash and clicked_at>now()-interval '10 minutes';if v_recent_ip_clicks>=60 then return query select v_link.target_url,false,false;return;end if;
 insert into public.tracking_clicks(tracking_link_id,visitor_key,ip_hash,user_agent,referrer) values(v_link.id,p_visitor_key,p_ip_hash,left(coalesce(p_user_agent,''),500),nullif(p_referrer,'')) on conflict(tracking_link_id,visitor_key) do nothing returning id into v_click_id;
 v_unique:=v_click_id is not null;
 if v_unique then update public.tracking_links set click_count=coalesce(click_count,0)+1,unique_click_count=coalesce(unique_click_count,0)+1 where id=v_link.id;select * into v_assessment from public.adbridge_event_assessments where source_table='tracking_clicks' and source_row_id=v_click_id;v_risk_ok:=found and v_assessment.verified and v_assessment.risk_status='low' and v_assessment.payable;end if;
 if v_unique and lower(coalesce(v_campaign.payment_method,'')) in ('cpc','link_traffic') and v_link.creator_id is not null then
  select count(*) into v_paid_count from public.campaign_payments where campaign_id=v_campaign.id and type='creator_payment' and source_click_id is not null;if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;return query select v_link.target_url,true,true;return;end if;
  select exists(select 1 from public.fraud_flags f where f.campaign_id=v_campaign.id and f.creator_id=v_link.creator_id and f.status in ('open','reviewing')) into v_open_fraud;v_paid_amount:=greatest(coalesce(v_campaign.payment_rate,0),0);select coalesce(sum(amount),0) into v_spent from public.campaign_payments where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
  if v_risk_ok and not v_open_fraud and v_paid_amount>0 and v_spent+v_paid_amount<=v_budget then insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_click_id) values(v_campaign.id,v_link.creator_id,v_paid_amount,'creator_payment','released',v_click_id) on conflict do nothing;if found then update public.tracking_links set paid_clicks=coalesce(paid_clicks,0)+1 where id=v_link.id;select count(*) into v_paid_count from public.campaign_payments where campaign_id=v_campaign.id and type='creator_payment' and source_click_id is not null;if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;end if;end if;end if;
 end if;
 return query select v_link.target_url,true,v_unique;
end;$$;

create or replace function public.release_cpm_submission_payment(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_submission public.submissions%rowtype;v_campaign public.campaigns%rowtype;v_requested numeric(18,2);v_spent numeric(18,2);v_budget numeric(18,2);v_amount numeric(18,2);v_existing uuid;v_assessment public.adbridge_event_assessments%rowtype;v_open_fraud boolean:=false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501';end if;
 select * into v_submission from public.submissions where id=p_submission_id for update;if not found then raise exception 'submission not found' using errcode='P0002';end if;
 select * into v_campaign from public.campaigns where id=v_submission.campaign_id for update;if not found then raise exception 'campaign not found' using errcode='P0002';end if;
 if lower(coalesce(v_campaign.payment_method,'')) not in ('cpm','views') then raise exception 'submission is not a CPM campaign' using errcode='22023';end if;
 select id into v_existing from public.campaign_payments where submission_id=p_submission_id and type='creator_payment' limit 1;if found then return jsonb_build_object('ok',true,'paid',true,'duplicate',true,'payment_id',v_existing);end if;
 if v_campaign.status not in ('funded','active') then return jsonb_build_object('ok',true,'paid',false,'reason','campaign_not_payable');end if;
 if v_submission.status<>'waiting' then return jsonb_build_object('ok',true,'paid',false,'reason','submission_not_awaiting_payment');end if;
 if lower(coalesce(v_submission.metric_status,''))<>'verified' or v_submission.metric_verified_at is null then return jsonb_build_object('ok',true,'paid',false,'reason','metrics_not_verified');end if;
 if coalesce(v_submission.target_metric,0)<=0 or coalesce(v_submission.current_metric,0)<v_submission.target_metric then return jsonb_build_object('ok',true,'paid',false,'reason','target_not_reached');end if;
 select * into v_assessment from public.adbridge_event_assessments a where a.source_table='submission_metrics' and a.source_row_id=(select sm.id from public.submission_metrics sm where sm.submission_id=p_submission_id order by sm.checked_at desc limit 1);
 if not found or not v_assessment.verified or v_assessment.risk_status<>'low' then return jsonb_build_object('ok',true,'paid',false,'reason','metric_fraud_review');end if;
 select exists(select 1 from public.fraud_flags f where f.campaign_id=v_campaign.id and f.creator_id=v_submission.creator_id and f.status in ('open','reviewing')) into v_open_fraud;if v_open_fraud then return jsonb_build_object('ok',true,'paid',false,'reason','open_fraud_review');end if;
 v_requested:=round(greatest(coalesce(v_campaign.payment_rate,0),0)*(v_submission.target_metric::numeric/1000),2);select coalesce(sum(amount),0) into v_spent from public.campaign_payments where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));v_amount:=least(v_requested,greatest(v_budget-v_spent,0));if v_amount<=0 then return jsonb_build_object('ok',true,'paid',false,'reason','budget_exhausted');end if;
 insert into public.campaign_payments(campaign_id,creator_id,submission_id,amount,type,status) values(v_campaign.id,v_submission.creator_id,p_submission_id,v_amount,'creator_payment','released') on conflict do nothing returning id into v_existing;
 if v_existing is null then select id into v_existing from public.campaign_payments where submission_id=p_submission_id and type='creator_payment' limit 1;return jsonb_build_object('ok',true,'paid',true,'duplicate',true,'payment_id',v_existing);end if;
 update public.submissions set status='approved',reviewed_at=now() where id=p_submission_id;if v_submission.creator_campaign_id is not null then update public.creator_campaigns set status='completed' where id=v_submission.creator_campaign_id;end if;
 return jsonb_build_object('ok',true,'paid',true,'duplicate',false,'payment_id',v_existing,'amount',v_amount);
end;$$;

create or replace function public.admin_fraud_health()
returns jsonb language plpgsql set search_path='' as $$
declare v_result jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501';end if;
 select jsonb_build_object('events_24h',count(*),'verified_24h',count(*) filter(where verified),'review_queue',count(*) filter(where risk_status='review'),'blocked_24h',count(*) filter(where risk_status='blocked'),'payable_24h',count(*) filter(where payable),'click_events_24h',count(*) filter(where source_table='tracking_clicks'),'publisher_events_24h',count(*) filter(where source_table='ad_placement_events'),'metric_checks_24h',count(*) filter(where source_table='submission_metrics'),'conversion_events_24h',count(*) filter(where source_table='cpa_conversion_events'))
 into v_result from public.adbridge_event_assessments where created_at>=now()-interval '24 hours';
 v_result:=coalesce(v_result,'{}'::jsonb)||jsonb_build_object('open_flags',(select count(*) from public.fraud_flags where status in ('open','reviewing')));
 return v_result;
end;$$;
create index if not exists adbridge_assessments_click_time on public.adbridge_event_assessments(source_table,created_at desc) where source_table='tracking_clicks';
