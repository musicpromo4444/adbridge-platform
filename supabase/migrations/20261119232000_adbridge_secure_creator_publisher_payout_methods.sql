-- Private payout destinations for creators and website/app publishers.
create table if not exists public.creator_payout_methods (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  payout_method text not null check (payout_method in ('bank_transfer','mobile_money')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  account_holder text,
  bank_name text,
  account_number text,
  routing_code text,
  swift_bic text,
  iban text,
  mobile_money_provider text,
  mobile_number text,
  updated_at timestamptz not null default now(),
  constraint creator_payout_method_required_fields check (
    (payout_method='bank_transfer' and nullif(trim(account_holder),'') is not null
      and nullif(trim(bank_name),'') is not null and nullif(trim(account_number),'') is not null)
    or
    (payout_method='mobile_money' and nullif(trim(mobile_money_provider),'') is not null
      and nullif(trim(mobile_number),'') is not null)
  )
);
alter table public.creator_payout_methods enable row level security;
revoke all on public.creator_payout_methods from anon,authenticated;

create or replace function public.get_creator_payout_method()
returns jsonb language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare uid uuid:=auth.uid(); v_role text; v_data jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into v_role from public.profiles where id=uid;
 if v_role not in ('creator','publisher') then raise exception 'Creator or publisher account required' using errcode='42501'; end if;
 select to_jsonb(p) - 'user_id' into v_data from public.creator_payout_methods p where p.user_id=uid;
 return coalesce(v_data,'{}'::jsonb);
end; $function$;

create or replace function public.save_creator_payout_method(
 p_payout_method text,p_country_code text,p_currency_code text,
 p_account_holder text default null,p_bank_name text default null,p_account_number text default null,
 p_routing_code text default null,p_swift_bic text default null,p_iban text default null,
 p_mobile_money_provider text default null,p_mobile_number text default null
) returns jsonb language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare uid uuid:=auth.uid(); v_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into v_role from public.profiles where id=uid;
 if v_role not in ('creator','publisher') then raise exception 'Creator or publisher account required' using errcode='42501'; end if;
 if p_payout_method not in ('bank_transfer','mobile_money')
   or upper(coalesce(p_country_code,'')) !~ '^[A-Z]{2}$'
   or upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$' then
   raise exception 'Choose a valid payout method, country and currency' using errcode='22023';
 end if;
 if p_payout_method='bank_transfer' and
   (nullif(trim(p_account_holder),'') is null or nullif(trim(p_bank_name),'') is null or nullif(trim(p_account_number),'') is null) then
   raise exception 'Account holder, bank name and account number are required' using errcode='22023';
 end if;
 if p_payout_method='mobile_money' and
   (nullif(trim(p_mobile_money_provider),'') is null or nullif(trim(p_mobile_number),'') is null) then
   raise exception 'Mobile money provider and mobile number are required' using errcode='22023';
 end if;
 insert into public.creator_payout_methods(user_id,payout_method,country_code,currency_code,account_holder,bank_name,account_number,routing_code,swift_bic,iban,mobile_money_provider,mobile_number,updated_at)
 values(uid,p_payout_method,upper(p_country_code),upper(p_currency_code),nullif(trim(p_account_holder),''),nullif(trim(p_bank_name),''),nullif(trim(p_account_number),''),nullif(trim(p_routing_code),''),nullif(trim(p_swift_bic),''),nullif(trim(p_iban),''),nullif(trim(p_mobile_money_provider),''),nullif(trim(p_mobile_number),''),now())
 on conflict(user_id) do update set payout_method=excluded.payout_method,country_code=excluded.country_code,currency_code=excluded.currency_code,
 account_holder=excluded.account_holder,bank_name=excluded.bank_name,account_number=excluded.account_number,
 routing_code=excluded.routing_code,swift_bic=excluded.swift_bic,iban=excluded.iban,
 mobile_money_provider=excluded.mobile_money_provider,mobile_number=excluded.mobile_number,updated_at=now();
 return jsonb_build_object('ok',true,'updated_at',now());
end; $function$;

create or replace function public.admin_list_creator_withdrawals(p_status text default 'pending',p_limit integer default 100)
returns jsonb language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_status not in ('pending','approved','rejected','paid','all') then raise exception 'invalid withdrawal status' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows
 from (
  select w.id,w.creator_id,w.amount,w.status,w.created_at,p.display_name,p.role as account_role,
   case when pm.user_id is null then null else jsonb_build_object(
    'payout_method',pm.payout_method,'country_code',pm.country_code,'currency_code',pm.currency_code,
    'account_holder',pm.account_holder,'bank_name',pm.bank_name,'account_number',pm.account_number,
    'routing_code',pm.routing_code,'swift_bic',pm.swift_bic,'iban',pm.iban,
    'mobile_money_provider',pm.mobile_money_provider,'mobile_number',pm.mobile_number,'updated_at',pm.updated_at
   ) end as payout_details
  from public.creator_withdrawals w
  join public.profiles p on p.id=w.creator_id
  left join public.creator_payout_methods pm on pm.user_id=w.creator_id
  where p_status='all' or w.status=p_status
  order by w.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
 ) x;
 return jsonb_build_object('ok',true,'withdrawals',v_rows);
end; $function$;

create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare uid uuid:=auth.uid(); v_role text; available numeric; reserved numeric; requested numeric:=coalesce(p_amount,0);
 fx numeric; usd_amount numeric(18,2); minimum_usd numeric(10,2); paid_count integer; row_id uuid;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if requested<=0 or requested='NaN'::numeric or requested='Infinity'::numeric then raise exception 'Withdrawal amount must be a finite positive number' using errcode='22023'; end if;
 select role into v_role from public.profiles where id=uid;
 if v_role not in ('creator','publisher') then raise exception 'Creator or publisher account required' using errcode='42501'; end if;
 if not exists(select 1 from public.creator_payout_methods where user_id=uid) then raise exception 'Add your payout details before requesting a withdrawal' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select usd_to_ngn_rate into fx from public.platform_payout_settings where id=1;
 if fx is null or fx<=0 then raise exception 'Withdrawals are temporarily unavailable while AdBridge configures the verified USD/NGN payout rate' using errcode='55000'; end if;
 select count(*) into paid_count from public.creator_withdrawals where creator_id=uid and status='paid';
 minimum_usd:=case when paid_count=0 then 50.00 else 20.00 end;
 usd_amount:=round(requested/fx,2);
 if usd_amount<minimum_usd then raise exception 'Minimum withdrawal is $% (approximately NGN % at the current AdBridge rate)',minimum_usd,round(minimum_usd*fx,2) using errcode='22023'; end if;
 select coalesce(sum(amount),0) into available from public.campaign_payments where creator_id=uid and type='creator_payment' and status='released';
 select coalesce(sum(amount),0) into reserved from public.creator_withdrawals where creator_id=uid and status in ('pending','approved','paid');
 if requested>greatest(0,available-reserved) then raise exception 'Withdrawal exceeds available balance' using errcode='22023'; end if;
 insert into public.creator_withdrawals(creator_id,amount,status,amount_usd,fx_rate_to_usd,minimum_usd) values(uid,requested,'pending',usd_amount,fx,minimum_usd) returning id into row_id;
 return jsonb_build_object('id',row_id,'amount',requested,'amount_usd',usd_amount,'fx_rate_to_usd',fx,'minimum_usd',minimum_usd,'status','pending','withdrawal_fee_paid_by','AdBridge');
end; $function$;

create or replace function public.get_creator_earnings_summary()
returns jsonb language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare uid uuid:=auth.uid(); v_role text; v_released numeric:=0; v_held numeric:=0; v_pending numeric:=0; v_approved numeric:=0; v_paid numeric:=0; v_rejected numeric:=0; v_fx numeric; v_paid_count integer:=0; v_minimum numeric(10,2);
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into v_role from public.profiles where id=uid;
 if v_role not in ('creator','publisher') then raise exception 'Creator or publisher account required' using errcode='42501'; end if;
 select coalesce(sum(amount) filter(where status='released'),0),coalesce(sum(amount) filter(where status='held'),0) into v_released,v_held from public.campaign_payments where creator_id=uid and type='creator_payment';
 select coalesce(sum(amount) filter(where status='pending'),0),coalesce(sum(amount) filter(where status='approved'),0),coalesce(sum(amount) filter(where status='paid'),0),coalesce(sum(amount) filter(where status='rejected'),0) into v_pending,v_approved,v_paid,v_rejected from public.creator_withdrawals where creator_id=uid;
 select count(*) into v_paid_count from public.creator_withdrawals where creator_id=uid and status='paid';
 select usd_to_ngn_rate into v_fx from public.platform_payout_settings where id=1;
 v_minimum:=case when v_paid_count=0 then 50.00 else 20.00 end;
 return jsonb_build_object('currency','NGN','released_earnings',v_released,'held_earnings',v_held,'withdrawals_pending',v_pending,'withdrawals_approved',v_approved,'withdrawals_paid',v_paid,'withdrawals_rejected',v_rejected,'available_balance',greatest(0,v_released-v_pending-v_approved-v_paid),'minimum_withdrawal_usd',v_minimum,'usd_to_ngn_rate',v_fx,'minimum_withdrawal_ngn',case when v_fx is null then null else round(v_minimum*v_fx,2) end,'withdrawal_fee_paid_by','AdBridge');
end; $function$;

revoke all on function public.get_creator_payout_method() from public,anon;
revoke all on function public.save_creator_payout_method(text,text,text,text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.admin_list_creator_withdrawals(text,integer) from public,anon;
revoke all on function public.request_creator_withdrawal(numeric) from public,anon;
revoke all on function public.get_creator_earnings_summary() from public,anon;
grant execute on function public.get_creator_payout_method() to authenticated;
grant execute on function public.save_creator_payout_method(text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_list_creator_withdrawals(text,integer) to authenticated;
grant execute on function public.request_creator_withdrawal(numeric) to authenticated;
grant execute on function public.get_creator_earnings_summary() to authenticated;
