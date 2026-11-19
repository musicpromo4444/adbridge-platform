create or replace function public.admin_update_creator_withdrawal(p_withdrawal_id uuid,p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
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
 if p_new_status='paid' and not exists(
  select 1 from public.creator_payout_methods m where m.user_id=v.creator_id
 ) then
  raise exception 'A verified payout destination must be saved before marking a withdrawal paid' using errcode='55000';
 end if;
 update public.creator_withdrawals set status=p_new_status where id=p_withdrawal_id;
 return jsonb_build_object('ok',true,'withdrawal_id',p_withdrawal_id,'previous_status',v.status,'status',p_new_status);
end;
$function$;

revoke all on function public.admin_update_creator_withdrawal(uuid,text) from public,anon;
grant execute on function public.admin_update_creator_withdrawal(uuid,text) to authenticated;
