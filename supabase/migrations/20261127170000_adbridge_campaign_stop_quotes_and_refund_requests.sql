-- Advertiser-facing pause/closure confirmation and refund ledger.
create table if not exists public.campaign_stop_fee_policy (
 id integer primary key default 1 check(id=1),
 close_fee_percent numeric(5,2) not null default 0 check(close_fee_percent between 0 and 100),
 pause_fee_percent numeric(5,2) not null default 0 check(pause_fee_percent=0),
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
insert into public.campaign_stop_fee_policy(id) values(1) on conflict(id) do nothing;
alter table public.campaign_stop_fee_policy enable row level security;
revoke all on public.campaign_stop_fee_policy from public,anon,authenticated;

create or replace function public.get_campaign_stop_quote(p_campaign_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare c public.campaigns%rowtype; role_name text:=private.current_user_profile_role();
 funded numeric:=0; spent numeric:=0; already_refunded numeric:=0; available numeric:=0;
 fee_pct numeric:=0; fee_amount numeric:=0; refund_amount numeric:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action not in ('paused','closed') then raise exception 'Unsupported stop action' using errcode='22023'; end if;
 select * into c from public.campaigns where id=p_campaign_id;
 if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
 if role_name<>'admin' and not(role_name='advertiser' and c.advertiser_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if c.status not in ('active','funded','paused') then raise exception 'Campaign cannot be paused or closed from its current status' using errcode='55000'; end if;
 select coalesce(sum(amount),0) into funded from public.campaign_payments where campaign_id=p_campaign_id and type='funding' and status in ('held','released');
 select coalesce(sum(amount),0) into spent from public.campaign_payments where campaign_id=p_campaign_id and ((type='creator_payment' and status in ('pending','held','released')) or (type='platform_fee' and status in ('pending','held','released')));
 select coalesce(sum(amount),0) into already_refunded from public.campaign_payments where campaign_id=p_campaign_id and type='refund' and status in ('pending','held','released','refunded');
 available:=greatest(0,funded-spent-already_refunded);
 if p_action='closed' then
  select close_fee_percent into fee_pct from public.campaign_stop_fee_policy where id=1;
  fee_pct:=coalesce(fee_pct,0); fee_amount:=round(available*fee_pct/100,2); refund_amount:=greatest(0,available-fee_amount);
 end if;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'action',p_action,'currency','NGN',
  'funded_amount',funded,'committed_or_spent',spent,'previous_refunds',already_refunded,'unspent_balance',available,
  'fee_percent',fee_pct,'fee_amount',fee_amount,'refund_amount',refund_amount,
  'pause_explanation',case when p_action='paused' then 'Pausing temporarily stops delivery. Remaining funds stay reserved. There is no pause fee or refund, and you can resume later.' else null end,
  'refund_explanation',case when p_action='closed' then 'Closing permanently ends delivery. The displayed fee is retained by AdBridge and the remaining eligible balance becomes a refund request. Provider processing may take additional time.' else null end);
end; $$;

create or replace function public.confirm_campaign_stop(p_campaign_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare c public.campaigns%rowtype; q jsonb; refund_amount numeric; fee_amount numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into c from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
 if private.current_user_profile_role()<>'admin' and not(private.current_user_profile_role()='advertiser' and c.advertiser_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if c.status not in ('active','funded','paused') then raise exception 'Campaign status changed; refresh before confirming' using errcode='55000'; end if;
 q:=public.get_campaign_stop_quote(p_campaign_id,p_action);
 refund_amount:=coalesce((q->>'refund_amount')::numeric,0); fee_amount:=coalesce((q->>'fee_amount')::numeric,0);
 if p_action='paused' then
  update public.campaigns set status='paused',updated_at=now() where id=p_campaign_id;
  return jsonb_build_object('ok',true,'status','paused','refund_amount',0,'message','Campaign paused; remaining funds remain reserved.');
 elsif p_action='closed' then
  update public.campaigns set status='closed',updated_at=now() where id=p_campaign_id;
  if fee_amount>0 then insert into public.campaign_payments(campaign_id,amount,type,status,provider) values(p_campaign_id,fee_amount,'platform_fee','held','AdBridge cancellation fee'); end if;
  if refund_amount>0 then insert into public.campaign_payments(campaign_id,amount,type,status,provider) values(p_campaign_id,refund_amount,'refund','pending','AdBridge refund request'); end if;
  return jsonb_build_object('ok',true,'status','closed','fee_amount',fee_amount,'refund_amount',refund_amount,'refund_status',case when refund_amount>0 then 'pending' else 'not_applicable' end,'message','Campaign closed; refund request recorded for payment processing.');
 end if;
 raise exception 'Unsupported stop action' using errcode='22023';
end; $$;

create or replace function public.admin_set_campaign_stop_fee_policy(p_pause_fee_percent numeric,p_close_fee_percent numeric)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_pause_fee_percent is null or p_close_fee_percent is null or p_pause_fee_percent<>0 or p_close_fee_percent<0 or p_close_fee_percent>100 then
  raise exception 'Pause fees must be zero. Closure fee must be between zero and 100 percent.' using errcode='22023';
 end if;
 insert into public.campaign_stop_fee_policy(id,pause_fee_percent,close_fee_percent,updated_by,updated_at) values(1,0,p_close_fee_percent,auth.uid(),now())
 on conflict(id) do update set pause_fee_percent=0,close_fee_percent=excluded.close_fee_percent,updated_by=auth.uid(),updated_at=now();
 return jsonb_build_object('ok',true,'pause_fee_percent',0,'close_fee_percent',p_close_fee_percent);
end; $$;

revoke all on function public.get_campaign_stop_quote(uuid,text) from public,anon;
revoke all on function public.confirm_campaign_stop(uuid,text) from public,anon;
revoke all on function public.admin_set_campaign_stop_fee_policy(numeric,numeric) from public,anon;
grant execute on function public.get_campaign_stop_quote(uuid,text) to authenticated;
grant execute on function public.confirm_campaign_stop(uuid,text) to authenticated;
grant execute on function public.admin_set_campaign_stop_fee_policy(numeric,numeric) to authenticated;

create or replace function public.admin_get_campaign_stop_fee_policy()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_pause numeric; v_close numeric;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 select pause_fee_percent,close_fee_percent into v_pause,v_close from public.campaign_stop_fee_policy where id=1;
 return jsonb_build_object('ok',true,'pause_fee_percent',coalesce(v_pause,0),'close_fee_percent',coalesce(v_close,0));
end; $$;
revoke all on function public.admin_get_campaign_stop_fee_policy() from public,anon;
grant execute on function public.admin_get_campaign_stop_fee_policy() to authenticated;
