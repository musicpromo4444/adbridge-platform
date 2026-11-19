-- Serialize billable click/conversion ingestion against campaign caps and fraud holds.
-- A tracking click is payable only as CPC traffic, never as a video view.
create or replace function public.record_tracking_click(
 p_slug text,p_visitor_key text,p_ip_hash text,p_user_agent text,p_referrer text
) returns table(target_url text,counted boolean,unique_counted boolean)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_link public.tracking_links%rowtype;
 v_campaign public.campaigns%rowtype;
 v_click_id uuid;
 v_unique boolean:=false;
 v_paid_amount numeric(18,2);
 v_spent numeric(18,2);
 v_budget numeric(18,2);
 v_recent_ip_clicks integer;
 v_paid_count integer;
 v_open_fraud boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 if nullif(trim(p_slug),'') is null or nullif(trim(p_visitor_key),'') is null or nullif(trim(p_ip_hash),'') is null then
  raise exception 'slug, visitor key and IP hash are required' using errcode='22023';
 end if;
 select * into v_link from public.tracking_links where slug=p_slug;
 if not found then return; end if;
 select * into v_campaign from public.campaigns where id=v_link.campaign_id for update;
 if not found or v_campaign.status not in ('funded','active') then return; end if;
 select count(*) into v_recent_ip_clicks from public.tracking_clicks
  where tracking_link_id=v_link.id and ip_hash=p_ip_hash and clicked_at>now()-interval '10 minutes';
 if v_recent_ip_clicks>=60 then return query select v_link.target_url,false,false; return; end if;
 insert into public.tracking_clicks(tracking_link_id,visitor_key,ip_hash,user_agent,referrer)
 values(v_link.id,p_visitor_key,p_ip_hash,left(coalesce(p_user_agent,''),500),nullif(p_referrer,''))
 on conflict(tracking_link_id,visitor_key) do nothing returning id into v_click_id;
 v_unique:=v_click_id is not null;
 if v_unique then
  update public.tracking_links set click_count=coalesce(click_count,0)+1,unique_click_count=coalesce(unique_click_count,0)+1 where id=v_link.id;
 end if;
 if v_unique and lower(coalesce(v_campaign.payment_method,'')) in ('cpc','link_traffic') and v_link.creator_id is not null then
  select count(*) into v_paid_count from public.campaign_payments
   where campaign_id=v_campaign.id and type='creator_payment' and source_click_id is not null;
  if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then
   update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;
   return query select v_link.target_url,true,true; return;
  end if;
  select exists(select 1 from public.fraud_flags f
   where f.campaign_id=v_campaign.id and f.creator_id=v_link.creator_id and f.status in ('open','reviewing')) into v_open_fraud;
  v_paid_amount:=greatest(coalesce(v_campaign.payment_rate,0),0);
  select coalesce(sum(amount),0) into v_spent from public.campaign_payments
   where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');
  v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
  if not v_open_fraud and v_paid_amount>0 and v_spent+v_paid_amount<=v_budget then
   insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_click_id)
   values(v_campaign.id,v_link.creator_id,v_paid_amount,'creator_payment','released',v_click_id)
   on conflict do nothing;
   if found then
    update public.tracking_links set paid_clicks=coalesce(paid_clicks,0)+1 where id=v_link.id;
    select count(*) into v_paid_count from public.campaign_payments
     where campaign_id=v_campaign.id and type='creator_payment' and source_click_id is not null;
    if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then
     update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;
    end if;
   end if;
  end if;
 end if;
 return query select v_link.target_url,true,v_unique;
end;
$$;
revoke all on function public.record_tracking_click(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_tracking_click(text,text,text,text,text) to service_role;

create or replace function public.record_cpa_conversion(
 p_campaign_id uuid,p_click_slug text,p_external_conversion_id text,
 p_action_type text default 'conversion',p_value numeric default 0
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_campaign public.campaigns%rowtype;
 v_link public.tracking_links%rowtype;
 v_event_id uuid;
 v_creator_id uuid;
 v_amount numeric(18,2);
 v_spent numeric(18,2);
 v_budget numeric(18,2);
 v_count integer;
 v_paid boolean:=false;
 v_status text:='unpaid';
 v_assessment public.adbridge_event_assessments%rowtype;
 v_open_fraud boolean:=false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 if p_campaign_id is null or nullif(trim(p_click_slug),'') is null or nullif(trim(p_external_conversion_id),'') is null then
  raise exception 'campaign_id, click slug and external conversion id are required' using errcode='22023';
 end if;
 if length(p_external_conversion_id)>200 or length(p_click_slug)>100 then raise exception 'conversion identifier is too long' using errcode='22023'; end if;
 select * into v_campaign from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 if lower(coalesce(v_campaign.payment_method,'')) not in ('actions','cpa','cpi') then raise exception 'campaign is not configured for action conversions' using errcode='22023'; end if;
 if v_campaign.status not in ('funded','active') then raise exception 'campaign is not accepting conversions' using errcode='55000'; end if;
 select * into v_link from public.tracking_links where slug=p_click_slug and campaign_id=p_campaign_id;
 if not found then raise exception 'tracking link does not belong to this campaign' using errcode='22023'; end if;
 v_creator_id:=v_link.creator_id;
 if v_creator_id is null then raise exception 'tracking link has no creator attribution' using errcode='22023'; end if;
 select id into v_event_id from public.cpa_conversion_events where campaign_id=p_campaign_id and external_conversion_id=trim(p_external_conversion_id);
 if found then return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_event_id); end if;
 select count(*) into v_count from public.cpa_conversion_events where campaign_id=p_campaign_id and status in ('approved','unpaid');
 if coalesce(v_campaign.desired_results,0)>0 and v_count>=v_campaign.desired_results then
  update public.campaigns set status='completed',updated_at=now() where id=p_campaign_id;
  raise exception 'campaign conversion target already reached' using errcode='55000';
 end if;
 v_amount:=greatest(coalesce(v_campaign.payment_rate,0),0);
 select coalesce(sum(amount),0) into v_spent from public.campaign_payments
  where campaign_id=p_campaign_id and type='creator_payment' and status in ('pending','held','released');
 v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
 insert into public.cpa_conversion_events(campaign_id,creator_id,click_id,external_conversion_id,action_type,value,status)
 values(p_campaign_id,v_creator_id,p_click_slug,trim(p_external_conversion_id),coalesce(nullif(trim(p_action_type),''),'conversion'),greatest(coalesce(p_value,0),0),'unpaid')
 returning id into v_event_id;
 select * into v_assessment from public.adbridge_event_assessments
  where source_table='cpa_conversion_events' and source_row_id=v_event_id;
 select exists(select 1 from public.fraud_flags f
  where f.campaign_id=p_campaign_id and f.creator_id=v_creator_id and f.status in ('open','reviewing')) into v_open_fraud;
 if found and v_assessment.verified and v_assessment.risk_status='low'
    and not v_open_fraud and v_amount>0 and v_spent+v_amount<=v_budget then
  insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_event_id)
  values(p_campaign_id,v_creator_id,v_amount,'creator_payment','released',v_event_id);
  v_paid:=true;
  v_status:='approved';
  update public.cpa_conversion_events set status='approved' where id=v_event_id;
 elsif found and (not v_assessment.verified or v_assessment.risk_status<>'low' or v_open_fraud) then
  v_status:='unpaid';
 end if;
 select count(*) into v_count from public.cpa_conversion_events where campaign_id=p_campaign_id and status in ('approved','unpaid');
 if coalesce(v_campaign.desired_results,0)>0 and v_count>=v_campaign.desired_results then
  update public.campaigns set status='completed',updated_at=now() where id=p_campaign_id;
 end if;
 return jsonb_build_object('ok',true,'duplicate',false,'event_id',v_event_id,'creator_id',v_creator_id,'paid',v_paid,
  'amount',case when v_paid then v_amount else 0 end,'conversions',v_count,'verification_status',coalesce(v_assessment.verification_status,'unverified'));
exception when unique_violation then
 select id into v_event_id from public.cpa_conversion_events where campaign_id=p_campaign_id and external_conversion_id=trim(p_external_conversion_id);
 return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_event_id);
end;
$$;
revoke all on function public.record_cpa_conversion(uuid,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.record_cpa_conversion(uuid,text,text,text,numeric) to service_role;
