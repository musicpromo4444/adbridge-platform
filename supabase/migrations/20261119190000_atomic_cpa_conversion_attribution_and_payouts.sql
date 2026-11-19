alter table public.campaign_payments
  add column if not exists source_event_id uuid references public.cpa_conversion_events(id) on delete restrict;

create unique index if not exists campaign_payments_source_event_once
  on public.campaign_payments(source_event_id)
  where source_event_id is not null;

create or replace function public.record_cpa_conversion(
  p_campaign_id uuid,
  p_click_slug text,
  p_external_conversion_id text,
  p_action_type text default 'conversion',
  p_value numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  v_paid boolean := false;
  v_status text := 'unpaid';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_campaign_id is null or nullif(trim(p_click_slug), '') is null
     or nullif(trim(p_external_conversion_id), '') is null then
    raise exception 'campaign_id, click slug and external conversion id are required' using errcode = '22023';
  end if;
  if length(p_external_conversion_id) > 200 or length(p_click_slug) > 100 then
    raise exception 'conversion identifier is too long' using errcode = '22023';
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign not found' using errcode = 'P0002'; end if;
  if lower(coalesce(v_campaign.payment_method,'')) not in ('actions','cpa','cpi') then
    raise exception 'campaign is not configured for action conversions' using errcode = '22023';
  end if;
  if v_campaign.status not in ('funded','active') then
    raise exception 'campaign is not accepting conversions' using errcode = '55000';
  end if;
  select * into v_link from public.tracking_links where slug = p_click_slug and campaign_id = p_campaign_id;
  if not found then raise exception 'tracking link does not belong to this campaign' using errcode = '22023'; end if;
  v_creator_id := v_link.creator_id;
  if v_creator_id is null then raise exception 'tracking link has no creator attribution' using errcode = '22023'; end if;
  select id into v_event_id from public.cpa_conversion_events
   where campaign_id = p_campaign_id and external_conversion_id = trim(p_external_conversion_id);
  if found then return jsonb_build_object('ok', true, 'duplicate', true, 'event_id', v_event_id); end if;
  select count(*) into v_count from public.cpa_conversion_events
   where campaign_id = p_campaign_id and status in ('approved','unpaid');
  if coalesce(v_campaign.desired_results,0) > 0 and v_count >= v_campaign.desired_results then
    raise exception 'campaign conversion target already reached' using errcode = '55000';
  end if;
  v_amount := greatest(coalesce(v_campaign.payment_rate,0),0);
  select coalesce(sum(amount),0) into v_spent from public.campaign_payments
   where campaign_id = p_campaign_id and type = 'creator_payment' and status in ('pending','held','released');
  v_budget := least(coalesce(v_campaign.max_budget,0), coalesce(v_campaign.funded_amount,0));
  if v_amount > 0 and v_spent + v_amount <= v_budget then v_paid := true; v_status := 'approved'; end if;
  insert into public.cpa_conversion_events(campaign_id,creator_id,click_id,external_conversion_id,action_type,value,status)
  values(p_campaign_id,v_creator_id,p_click_slug,trim(p_external_conversion_id),coalesce(nullif(trim(p_action_type),''),'conversion'),greatest(coalesce(p_value,0),0),v_status)
  returning id into v_event_id;
  if v_paid then
    insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_event_id)
    values(p_campaign_id,v_creator_id,v_amount,'creator_payment','released',v_event_id);
  end if;
  if coalesce(v_campaign.desired_results,0) > 0 and v_count + 1 >= v_campaign.desired_results then
    update public.campaigns set status='completed',updated_at=now() where id=p_campaign_id;
  end if;
  return jsonb_build_object('ok',true,'duplicate',false,'event_id',v_event_id,'creator_id',v_creator_id,'paid',v_paid,'amount',case when v_paid then v_amount else 0 end,'conversions',v_count+1);
exception when unique_violation then
  select id into v_event_id from public.cpa_conversion_events where campaign_id=p_campaign_id and external_conversion_id=trim(p_external_conversion_id);
  return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_event_id);
end;
$$;
revoke all on function public.record_cpa_conversion(uuid,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.record_cpa_conversion(uuid,text,text,text,numeric) to service_role;
