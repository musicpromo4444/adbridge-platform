alter table public.creator_withdrawals
 add column if not exists payment_reference text,
 add column if not exists payment_note text,
 add column if not exists paid_at timestamptz,
 add column if not exists paid_by uuid references auth.users(id);
alter table public.creator_withdrawal_events
 add column if not exists payment_reference text,
 add column if not exists event_note text;
drop function if exists public.admin_update_creator_withdrawal(uuid,text);
create or replace function public.admin_update_creator_withdrawal(p_withdrawal_id uuid,p_new_status text,p_payment_reference text default null,p_payment_note text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $function$
declare v public.creator_withdrawals%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_withdrawal_id is null or p_new_status not in ('approved','rejected','paid') then raise exception 'valid withdrawal and target status required' using errcode='22023'; end if;
 if p_new_status='paid' and (p_payment_reference is null or length(trim(p_payment_reference))<3) then raise exception 'Enter the external transfer reference before marking this withdrawal paid' using errcode='22023'; end if;
 select * into v from public.creator_withdrawals where id=p_withdrawal_id for update;
 if not found then raise exception 'withdrawal not found' using errcode='P0002'; end if;
 if (v.status='pending' and p_new_status not in ('approved','rejected')) or (v.status='approved' and p_new_status<>'paid') or v.status in ('paid','rejected') then raise exception 'invalid withdrawal status transition' using errcode='55000'; end if;
 if p_new_status='paid' and not exists(select 1 from public.creator_payout_methods m where m.user_id=v.creator_id) then raise exception 'A payout destination must be saved before marking a withdrawal paid' using errcode='55000'; end if;
 update public.creator_withdrawals set status=p_new_status,payment_reference=case when p_new_status='paid' then trim(p_payment_reference) else payment_reference end,payment_note=case when p_new_status='paid' then nullif(trim(p_payment_note),'') else payment_note end,paid_at=case when p_new_status='paid' then now() else paid_at end,paid_by=case when p_new_status='paid' then auth.uid() else paid_by end where id=p_withdrawal_id;
 insert into public.creator_withdrawal_events(withdrawal_id,actor_id,previous_status,new_status,amount,payment_reference,event_note) values(p_withdrawal_id,auth.uid(),v.status,p_new_status,v.amount,case when p_new_status='paid' then trim(p_payment_reference) else null end,nullif(trim(p_payment_note),''));
 return jsonb_build_object('ok',true,'withdrawal_id',p_withdrawal_id,'previous_status',v.status,'status',p_new_status);
end;$function$;
revoke all on function public.admin_update_creator_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_creator_withdrawal(uuid,text,text,text) to authenticated;
create or replace function public.admin_list_withdrawal_events(p_withdrawal_id uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_withdrawal_id is null then raise exception 'withdrawal id is required' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows from (select id,withdrawal_id,actor_id,previous_status,new_status,amount,created_at,payment_reference,event_note from public.creator_withdrawal_events where withdrawal_id=p_withdrawal_id order by created_at desc limit greatest(1,least(coalesce(p_limit,100),250))) x;
 return jsonb_build_object('ok',true,'events',v_rows);
end;$function$;
revoke all on function public.admin_list_withdrawal_events(uuid,integer) from public,anon;
grant execute on function public.admin_list_withdrawal_events(uuid,integer) to authenticated;
create or replace function public.admin_list_creator_withdrawals(p_status text default 'pending',p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $function$
declare v_rows jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_status not in ('pending','approved','rejected','paid','all') then raise exception 'invalid withdrawal status' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows from (
  select w.id,w.creator_id,w.amount,w.amount_usd,w.fx_rate_to_usd,w.minimum_usd,w.status,w.created_at,w.payment_reference,w.payment_note,w.paid_at,w.paid_by,p.display_name,p.role as account_role,
   case when pm.user_id is null then null else jsonb_build_object('payout_method',pm.payout_method,'country_code',pm.country_code,'currency_code',pm.currency_code,'account_holder',pm.account_holder,'bank_name',pm.bank_name,'account_number',pm.account_number,'routing_code',pm.routing_code,'swift_bic',pm.swift_bic,'iban',pm.iban,'mobile_money_provider',pm.mobile_money_provider,'mobile_number',pm.mobile_number,'wise_email',pm.wise_email,'paypal_email',pm.paypal_email,'updated_at',pm.updated_at) end as payout_details
  from public.creator_withdrawals w join public.profiles p on p.id=w.creator_id left join public.creator_payout_methods pm on pm.user_id=w.creator_id
  where p_status='all' or w.status=p_status order by w.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
 ) x;
 return jsonb_build_object('ok',true,'withdrawals',v_rows);
end;$function$;
revoke all on function public.admin_list_creator_withdrawals(text,integer) from public,anon;
grant execute on function public.admin_list_creator_withdrawals(text,integer) to authenticated;