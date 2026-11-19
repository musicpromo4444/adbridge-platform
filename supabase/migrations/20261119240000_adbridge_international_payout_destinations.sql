alter table public.creator_payout_methods
 add column if not exists wise_email text,
 add column if not exists paypal_email text;

create or replace function public.save_creator_payout_method(
 p_payout_method text,p_country_code text,p_currency_code text,
 p_account_holder text,p_bank_name text,p_account_number text,
 p_routing_code text,p_swift_bic text,p_iban text,
 p_mobile_money_provider text,p_mobile_number text,
 p_wise_email text,p_paypal_email text
) returns jsonb
language plpgsql security definer
set search_path=public,private,pg_temp
as $function$
declare uid uuid:=auth.uid(); v_role text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into v_role from public.profiles where id=uid;
 if v_role not in ('creator','publisher') then raise exception 'Creator or publisher account required' using errcode='42501'; end if;
 if p_payout_method not in ('bank_transfer','mobile_money','wise','paypal')
   or upper(coalesce(p_country_code,'')) !~ '^[A-Z]{2}$'
   or upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$' then
  raise exception 'Choose a valid payout method, country and currency' using errcode='22023';
 end if;
 if p_payout_method='bank_transfer' and (nullif(trim(p_account_holder),'') is null or nullif(trim(p_bank_name),'') is null or nullif(trim(p_account_number),'') is null) then
  raise exception 'Account holder, bank name and account number are required' using errcode='22023';
 end if;
 if p_payout_method='mobile_money' and (nullif(trim(p_mobile_money_provider),'') is null or nullif(trim(p_mobile_number),'') is null) then
  raise exception 'Mobile money provider and mobile number are required' using errcode='22023';
 end if;
 if p_payout_method='wise' and nullif(trim(p_wise_email),'') is null then
  raise exception 'Wise account email is required' using errcode='22023';
 end if;
 if p_payout_method='paypal' and nullif(trim(p_paypal_email),'') is null then
  raise exception 'PayPal account email is required' using errcode='22023';
 end if;
 insert into public.creator_payout_methods(user_id,payout_method,country_code,currency_code,account_holder,bank_name,account_number,routing_code,swift_bic,iban,mobile_money_provider,mobile_number,wise_email,paypal_email,updated_at)
 values(uid,p_payout_method,upper(p_country_code),upper(p_currency_code),nullif(trim(p_account_holder),''),nullif(trim(p_bank_name),''),nullif(trim(p_account_number),''),nullif(trim(p_routing_code),''),nullif(trim(p_swift_bic),''),nullif(trim(p_iban),''),nullif(trim(p_mobile_money_provider),''),nullif(trim(p_mobile_number),''),nullif(trim(p_wise_email),''),nullif(trim(p_paypal_email),''),now())
 on conflict(user_id) do update set payout_method=excluded.payout_method,country_code=excluded.country_code,currency_code=excluded.currency_code,account_holder=excluded.account_holder,bank_name=excluded.bank_name,account_number=excluded.account_number,routing_code=excluded.routing_code,swift_bic=excluded.swift_bic,iban=excluded.iban,mobile_money_provider=excluded.mobile_money_provider,mobile_number=excluded.mobile_number,wise_email=excluded.wise_email,paypal_email=excluded.paypal_email,updated_at=now();
 return jsonb_build_object('ok',true,'updated_at',now());
end; $function$;

revoke all on function public.save_creator_payout_method(text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.save_creator_payout_method(text,text,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.save_creator_payout_method(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
