create or replace function public.admin_get_paystack_refund_attempts(p_refund_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare result jsonb;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'funding_payment_id',funding_payment_id,'amount',amount,'currency',currency,'status',status,'paystack_reference',paystack_reference,'provider_refund_id',provider_refund_id,'provider_status',provider_status,'last_error',last_error,'updated_at',updated_at) order by created_at,id),'[]'::jsonb) into result
 from public.adbridge_paystack_refund_attempts where refund_payment_id=p_refund_payment_id;
 return result;
end; $$;
revoke all on function public.admin_get_paystack_refund_attempts(uuid) from public,anon;
grant execute on function public.admin_get_paystack_refund_attempts(uuid) to authenticated;