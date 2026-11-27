create or replace function public.admin_confirm_campaign_refund(p_refund_payment_id uuid,p_provider_reference text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v public.campaign_payments%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_refund_payment_id is null or nullif(trim(p_provider_reference),'') is null then raise exception 'Refund payment and provider transfer reference are required' using errcode='22023'; end if;
 select * into v from public.campaign_payments where id=p_refund_payment_id for update;
 if not found then raise exception 'Refund request not found' using errcode='P0002'; end if;
 if v.type<>'refund' or v.status<>'pending' then raise exception 'Only pending refund requests can be confirmed' using errcode='55000'; end if;
 if not exists(select 1 from public.campaigns where id=v.campaign_id and status='closed') then raise exception 'Campaign must be closed before refund settlement' using errcode='55000'; end if;
 update public.campaign_payments set status='refunded',provider_reference=trim(p_provider_reference),provider=coalesce(nullif(provider,''),'manual refund') where id=p_refund_payment_id;
 return jsonb_build_object('ok',true,'refund_payment_id',p_refund_payment_id,'amount',v.amount,'status','refunded');
end; $$;
revoke all on function public.admin_confirm_campaign_refund(uuid,text) from public,anon;
grant execute on function public.admin_confirm_campaign_refund(uuid,text) to authenticated;
