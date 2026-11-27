-- Keep the fraud assessment's payable flag in sync with the publisher payout ledger.
-- Verified events are not marked payable until the protected settlement function creates
-- the corresponding creator_payment ledger entry.
create or replace function public.settle_verified_publisher_ad_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_assessment public.adbridge_event_assessments%rowtype;
 v_placement public.ad_placements%rowtype;
 v_campaign public.campaigns%rowtype;
 v_rate numeric(18,6);
 v_requested numeric(18,6);
 v_earned numeric(18,2);
 v_paid numeric(18,2);
 v_amount numeric(18,2);
 v_budget numeric(18,2);
 v_spent numeric(18,2);
 v_event_count bigint;
 v_paid_count bigint;
 v_open_fraud boolean:=false;
 v_payment_method text;
 v_publisher uuid;
begin
 select * into v_placement from public.ad_placements where id=new.placement_id;
 if not found then return new; end if;
 v_publisher:=coalesce(new.publisher_id,v_placement.publisher_id);
 if v_publisher is null or coalesce(new.campaign_id,v_placement.campaign_id) is null then return new; end if;
 select * into v_campaign from public.campaigns where id=coalesce(new.campaign_id,v_placement.campaign_id) for update;
 if not found or v_campaign.status not in ('funded','active') then return new; end if;
 select * into v_assessment from public.adbridge_event_assessments
  where source_table='ad_placement_events' and source_row_id=new.id;
 if not found or not v_assessment.verified or v_assessment.risk_status<>'low' then return new; end if;
 select exists(select 1 from public.fraud_flags f
  where f.campaign_id=v_campaign.id and f.creator_id=v_publisher and f.status in ('open','reviewing'))
 into v_open_fraud;
 if v_open_fraud then return new; end if;

 v_payment_method:=lower(coalesce(v_campaign.payment_method,''));
 v_rate:=greatest(coalesce(v_campaign.payment_rate,0),0);
 if new.event_type='impression' and v_payment_method in ('cpm','views') then
  v_requested:=v_rate/1000;
 elsif new.event_type='video_view' and v_payment_method in ('cpm','views') then
  v_requested:=v_rate/1000;
 elsif new.event_type='click' and v_payment_method in ('cpc','link_traffic') then
  v_requested:=v_rate;
 elsif new.event_type='install' and v_payment_method in ('cpi','actions','cpa') then
  v_requested:=v_rate;
 elsif new.event_type='conversion' and v_payment_method in ('cpa','actions') then
  v_requested:=v_rate;
 else
  return new;
 end if;
 if v_rate<=0 then return new; end if;

 select count(*) into v_paid_count from public.campaign_payments
  where campaign_id=v_campaign.id and type='creator_payment'
   and (source_click_id is not null or source_event_id is not null or source_ad_placement_event_id is not null);
 if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then
  update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;
  return new;
 end if;

 if new.event_type in ('impression','video_view') then
  select count(*) into v_event_count from public.adbridge_event_assessments a
   where a.source_table='ad_placement_events' and a.campaign_id=v_campaign.id
    and a.publisher_id=v_publisher and a.event_type=new.event_type
    and a.verified and a.risk_status='low';
  v_earned:=round((v_rate*v_event_count/1000)::numeric,2);
  select coalesce(sum(cp.amount),0) into v_paid from public.campaign_payments cp
   where cp.campaign_id=v_campaign.id and cp.creator_id=v_publisher
    and cp.type='creator_payment' and cp.status in ('pending','held','released')
    and cp.source_ad_placement_event_id in (
      select a2.source_row_id from public.adbridge_event_assessments a2
       where a2.source_table='ad_placement_events' and a2.campaign_id=v_campaign.id
        and a2.publisher_id=v_publisher and a2.event_type=new.event_type
        and a2.verified and a2.risk_status='low'
    );
  v_amount:=greatest(v_earned-v_paid,0);
 else
  v_amount:=round(v_requested,2);
 end if;
 if v_amount<=0 then return new; end if;

 select coalesce(sum(amount),0) into v_spent from public.campaign_payments
  where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');
 v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
 if v_spent+v_amount>v_budget then
  update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;
  return new;
 end if;

 insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_ad_placement_event_id)
 values(v_campaign.id,v_publisher,v_amount,'creator_payment','released',new.id)
 on conflict do nothing;
 if found then
  if new.event_type in ('impression','video_view') then
   update public.adbridge_event_assessments
    set payable=true
    where source_table='ad_placement_events' and campaign_id=v_campaign.id
     and publisher_id=v_publisher and event_type=new.event_type
     and verified=true and risk_status='low';
  else
   update public.adbridge_event_assessments
    set payable=true
    where source_table='ad_placement_events' and source_row_id=new.id
     and verified=true and risk_status='low';
  end if;
  select count(*) into v_paid_count from public.campaign_payments
   where campaign_id=v_campaign.id and type='creator_payment'
    and (source_click_id is not null or source_event_id is not null or source_ad_placement_event_id is not null);
  if coalesce(v_campaign.desired_results,0)>0 and v_paid_count>=v_campaign.desired_results then
   update public.campaigns set status='completed',updated_at=now() where id=v_campaign.id;
  end if;
 end if;
 return new;
end;
$$;

revoke all on function public.settle_verified_publisher_ad_event() from public,anon,authenticated;
