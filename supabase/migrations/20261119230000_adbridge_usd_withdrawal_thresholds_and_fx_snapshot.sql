-- Withdrawal policy: first successful payout has a USD 50 minimum;
-- later payouts have a USD 20 minimum. Creator payout charges are paid by AdBridge.
-- NGN requests require an administrator-maintained USD/NGN rate; never guess FX.
create table if not exists public.platform_payout_settings (
  id integer primary key default 1 check (id = 1),
  usd_to_ngn_rate numeric(18,6),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint platform_payout_settings_positive_rate
    check (usd_to_ngn_rate is null or usd_to_ngn_rate > 0)
);
insert into public.platform_payout_settings(id) values (1) on conflict (id) do nothing;
alter table public.platform_payout_settings enable row level security;
revoke all on public.platform_payout_settings from anon, authenticated;

alter table public.creator_withdrawals
  add column if not exists amount_usd numeric(18,2),
  add column if not exists fx_rate_to_usd numeric(18,6),
  add column if not exists minimum_usd numeric(10,2);

create or replace function public.admin_set_payout_fx_rate(p_usd_to_ngn_rate numeric)
returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if private.current_user_profile_role() <> 'admin' then
    raise exception 'administrator access required' using errcode='42501';
  end if;
  if p_usd_to_ngn_rate is null or p_usd_to_ngn_rate <= 0
     or p_usd_to_ngn_rate = 'NaN'::numeric
     or p_usd_to_ngn_rate = 'Infinity'::numeric then
    raise exception 'A finite positive USD to NGN exchange rate is required' using errcode='22023';
  end if;
  insert into public.platform_payout_settings(id,usd_to_ngn_rate,updated_by,updated_at)
  values(1,p_usd_to_ngn_rate,auth.uid(),now())
  on conflict(id) do update set usd_to_ngn_rate=excluded.usd_to_ngn_rate,
    updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('ok',true,'usd_to_ngn_rate',p_usd_to_ngn_rate);
end;
$function$;

create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  available numeric;
  reserved numeric;
  requested numeric := coalesce(p_amount,0);
  fx numeric;
  usd_amount numeric(18,2);
  minimum_usd numeric(10,2);
  paid_count integer;
  row_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if requested <= 0 or requested='NaN'::numeric or requested='Infinity'::numeric then
    raise exception 'Withdrawal amount must be a finite positive number' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles where id=uid and role='creator') then
    raise exception 'Creator account required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select usd_to_ngn_rate into fx from public.platform_payout_settings where id=1;
  if fx is null or fx <= 0 then
    raise exception 'Withdrawals are temporarily unavailable while AdBridge configures the verified USD/NGN payout rate' using errcode='55000';
  end if;
  select count(*) into paid_count from public.creator_withdrawals
    where creator_id=uid and status='paid';
  minimum_usd := case when paid_count=0 then 50.00 else 20.00 end;
  usd_amount := round(requested / fx,2);
  if usd_amount < minimum_usd then
    raise exception 'Minimum withdrawal is $% (approximately ₦% at the current AdBridge rate)',minimum_usd,round(minimum_usd*fx,2)
      using errcode='22023';
  end if;
  select coalesce(sum(amount),0) into available from public.campaign_payments
    where creator_id=uid and type='creator_payment' and status='released';
  select coalesce(sum(amount),0) into reserved from public.creator_withdrawals
    where creator_id=uid and status in ('pending','approved','paid');
  if requested > greatest(0,available-reserved) then
    raise exception 'Withdrawal exceeds available balance' using errcode='22023';
  end if;
  insert into public.creator_withdrawals(creator_id,amount,status,amount_usd,fx_rate_to_usd,minimum_usd)
  values(uid,requested,'pending',usd_amount,fx,minimum_usd) returning id into row_id;
  return jsonb_build_object('id',row_id,'amount',requested,'amount_usd',usd_amount,
    'fx_rate_to_usd',fx,'minimum_usd',minimum_usd,'status','pending',
    'withdrawal_fee_paid_by','AdBridge');
end;
$function$;

create or replace function public.get_creator_earnings_summary()
returns jsonb
language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid:=auth.uid();
  v_released numeric:=0;
  v_held numeric:=0;
  v_pending numeric:=0;
  v_approved numeric:=0;
  v_paid numeric:=0;
  v_rejected numeric:=0;
  v_fx numeric;
  v_paid_count integer:=0;
  v_minimum numeric(10,2);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=uid and role='creator') then
    raise exception 'Creator account required' using errcode='42501';
  end if;
  select coalesce(sum(amount) filter(where status='released'),0),
         coalesce(sum(amount) filter(where status='held'),0)
    into v_released,v_held
    from public.campaign_payments where creator_id=uid and type='creator_payment';
  select coalesce(sum(amount) filter(where status='pending'),0),
         coalesce(sum(amount) filter(where status='approved'),0),
         coalesce(sum(amount) filter(where status='paid'),0),
         coalesce(sum(amount) filter(where status='rejected'),0)
    into v_pending,v_approved,v_paid,v_rejected
    from public.creator_withdrawals where creator_id=uid;
  select count(*) into v_paid_count from public.creator_withdrawals
    where creator_id=uid and status='paid';
  select usd_to_ngn_rate into v_fx from public.platform_payout_settings where id=1;
  v_minimum := case when v_paid_count=0 then 50.00 else 20.00 end;
  return jsonb_build_object(
    'currency','NGN','released_earnings',v_released,'held_earnings',v_held,
    'withdrawals_pending',v_pending,'withdrawals_approved',v_approved,
    'withdrawals_paid',v_paid,'withdrawals_rejected',v_rejected,
    'available_balance',greatest(0,v_released-v_pending-v_approved-v_paid),
    'minimum_withdrawal_usd',v_minimum,'usd_to_ngn_rate',v_fx,
    'minimum_withdrawal_ngn',case when v_fx is null then null else round(v_minimum*v_fx,2) end,
    'withdrawal_fee_paid_by','AdBridge'
  );
end;
$function$;

revoke all on function public.admin_set_payout_fx_rate(numeric) from public,anon;
grant execute on function public.admin_set_payout_fx_rate(numeric) to authenticated;
revoke all on function public.request_creator_withdrawal(numeric) from public,anon;
grant execute on function public.request_creator_withdrawal(numeric) to authenticated;
revoke all on function public.get_creator_earnings_summary() from public,anon;
grant execute on function public.get_creator_earnings_summary() to authenticated;
