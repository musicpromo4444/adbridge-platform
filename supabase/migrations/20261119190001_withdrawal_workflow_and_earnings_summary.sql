create index if not exists creator_withdrawals_creator_created_idx
 on public.creator_withdrawals(creator_id,created_at desc);
create index if not exists creator_withdrawals_status_created_idx
 on public.creator_withdrawals(status,created_at desc);

create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
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
 if not exists(select 1 from public.profiles where id=uid and role='creator') then
  raise exception 'Creator account required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select coalesce(sum(amount),0) into available from public.campaign_payments
  where creator_id=uid and type='creator_payment' and status='released';
 select coalesce(sum(amount),0) into reserved from public.creator_withdrawals
  where creator_id=uid and status in ('pending','approved','paid');
 if requested>greatest(0,available-reserved) then
  raise exception 'Withdrawal exceeds available balance' using errcode='22023';
 end if;
 insert into public.creator_withdrawals(creator_id,amount,status)
 values(uid,requested,'pending') returning id into row_id;
 return jsonb_build_object('id',row_id,'amount',requested,'status','pending');
end;
$function$;

create or replace function public.admin_list_creator_withdrawals(p_status text default 'pending',p_limit integer default 100)
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then
  raise exception 'administrator access required' using errcode='42501';
 end if;
 if p_status not in ('pending','approved','rejected','paid','all') then
  raise exception 'invalid withdrawal status' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
 into v_rows from (
  select id,creator_id,amount,status,created_at
  from public.creator_withdrawals
  where p_status='all' or status=p_status
  order by created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250))
 ) x;
 return jsonb_build_object('ok',true,'withdrawals',v_rows);
end;
$function$;

create or replace function public.admin_update_creator_withdrawal(p_withdrawal_id uuid,p_new_status text)
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v public.creator_withdrawals%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then
  raise exception 'administrator access required' using errcode='42501';
 end if;
 if p_withdrawal_id is null or p_new_status not in ('approved','rejected','paid') then
  raise exception 'valid withdrawal and target status required' using errcode='22023';
 end if;
 select * into v from public.creator_withdrawals where id=p_withdrawal_id for update;
 if not found then raise exception 'withdrawal not found' using errcode='P0002'; end if;
 if (v.status='pending' and p_new_status not in ('approved','rejected'))
   or (v.status='approved' and p_new_status<>'paid')
   or v.status in ('paid','rejected') then
  raise exception 'invalid withdrawal status transition' using errcode='55000';
 end if;
 update public.creator_withdrawals set status=p_new_status where id=p_withdrawal_id;
 return jsonb_build_object('ok',true,'withdrawal_id',p_withdrawal_id,'previous_status',v.status,'status',p_new_status);
end;
$function$;

create or replace function public.get_creator_earnings_summary()
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
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
 return jsonb_build_object(
  'currency','NGN','released_earnings',v_released,'held_earnings',v_held,
  'withdrawals_pending',v_pending,'withdrawals_approved',v_approved,
  'withdrawals_paid',v_paid,'withdrawals_rejected',v_rejected,
  'available_balance',greatest(0,v_released-v_pending-v_approved-v_paid)
 );
end;
$function$;

drop policy if exists "admins update creator withdrawals" on public.creator_withdrawals;
revoke insert,update on public.creator_withdrawals from authenticated;
revoke all on function public.request_creator_withdrawal(numeric) from public,anon;
revoke all on function public.admin_list_creator_withdrawals(text,integer) from public,anon;
revoke all on function public.admin_update_creator_withdrawal(uuid,text) from public,anon;
revoke all on function public.get_creator_earnings_summary() from public,anon;
grant execute on function public.request_creator_withdrawal(numeric) to authenticated;
grant execute on function public.admin_list_creator_withdrawals(text,integer) to authenticated;
grant execute on function public.admin_update_creator_withdrawal(uuid,text) to authenticated;
grant execute on function public.get_creator_earnings_summary() to authenticated;
