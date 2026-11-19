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
  select w.id,w.creator_id,w.amount,w.amount_usd,w.fx_rate_to_usd,w.minimum_usd,w.status,w.created_at,
   p.display_name,p.role as account_role,
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
revoke all on function public.admin_list_creator_withdrawals(text,integer) from public,anon;
grant execute on function public.admin_list_creator_withdrawals(text,integer) to authenticated;
