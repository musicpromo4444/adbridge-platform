-- Publishers and creators earn from the same verified delivery ledger and must
-- use the same protected withdrawal workflow.
create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  available numeric;
  reserved numeric;
  requested numeric:=coalesce(p_amount,0);
  row_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if requested<=0 or requested='NaN'::numeric or requested='Infinity'::numeric then
    raise exception 'Withdrawal amount must be a finite positive number' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles where id=uid and role in ('creator','publisher')) then
    raise exception 'Creator or publisher account required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select coalesce(sum(amount),0) into available
  from public.campaign_payments
  where creator_id=uid and type='creator_payment' and status='released';
  select coalesce(sum(amount),0) into reserved
  from public.creator_withdrawals
  where creator_id=uid and status in ('pending','approved','paid');
  if requested>greatest(0,available-reserved) then
    raise exception 'Withdrawal exceeds available balance' using errcode='22023';
  end if;
  insert into public.creator_withdrawals(creator_id,amount,status)
  values(uid,requested,'pending') returning id into row_id;
  return jsonb_build_object('id',row_id,'amount',requested,'status','pending');
end;
$$;

create or replace function public.get_creator_earnings_summary()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  v_released numeric:=0;
  v_held numeric:=0;
  v_pending numeric:=0;
  v_approved numeric:=0;
  v_paid numeric:=0;
  v_rejected numeric:=0;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=uid and role in ('creator','publisher')) then
    raise exception 'Creator or publisher account required' using errcode='42501';
  end if;
  select coalesce(sum(amount) filter(where status='released'),0),
         coalesce(sum(amount) filter(where status in ('held','pending')),0)
  into v_released,v_held
  from public.campaign_payments
  where creator_id=uid and type='creator_payment';
  select coalesce(sum(amount) filter(where status='pending'),0),
         coalesce(sum(amount) filter(where status='approved'),0),
         coalesce(sum(amount) filter(where status='paid'),0),
         coalesce(sum(amount) filter(where status='rejected'),0)
  into v_pending,v_approved,v_paid,v_rejected
  from public.creator_withdrawals where creator_id=uid;
  return jsonb_build_object(
    'currency','NGN',
    'released_earnings',v_released,
    'held_earnings',v_held,
    'withdrawals_pending',v_pending,
    'withdrawals_approved',v_approved,
    'withdrawals_paid',v_paid,
    'withdrawals_rejected',v_rejected,
    'available_balance',greatest(0,v_released-v_pending-v_approved-v_paid)
  );
end;
$$;

revoke all on function public.request_creator_withdrawal(numeric) from public,anon;
revoke all on function public.get_creator_earnings_summary() from public,anon;
grant execute on function public.request_creator_withdrawal(numeric) to authenticated;
grant execute on function public.get_creator_earnings_summary() to authenticated;
