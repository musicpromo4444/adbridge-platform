create or replace function public.request_creator_withdrawal(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  available numeric;
  reserved numeric;
  requested numeric := coalesce(p_amount,0);
  row_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if requested <= 0 then raise exception 'Withdrawal amount must be greater than zero'; end if;
  if not exists (select 1 from profiles where id=uid and role='creator') then
    raise exception 'Creator account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select coalesce(sum(amount),0) into available from campaign_payments where creator_id=uid and type='creator_payment' and status='released';
  select coalesce(sum(amount),0) into reserved from creator_withdrawals where creator_id=uid and status in ('pending','approved');
  if requested > greatest(0, available-reserved) then raise exception 'Withdrawal exceeds available balance'; end if;
  insert into creator_withdrawals(creator_id,amount,status) values(uid,requested,'pending') returning id into row_id;
  return jsonb_build_object('id',row_id,'amount',requested,'status','pending');
end;
$$;
revoke all on function public.request_creator_withdrawal(numeric) from public;
grant execute on function public.request_creator_withdrawal(numeric) to authenticated;
