create or replace function public.admin_confirm_campaign_refund(p_refund_payment_id uuid,p_provider_reference text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v public.campaign_payments%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_refund_payment_id is null or nullif(trim(p_provider_reference),'') is null then raise exception 'Refund payment and provider transfer reference are required' using errcode='22023'; end if;
 select * into v from public.campaign_payments where id=p_refund_payment_id for update;
 if not found then raise exception 'Refund request not found' using errcode='P0002'; end if;
 if v.type<>'refund' or v.status<>'pending' then raise exception 'Only pending refund requests can be confirmed' using errcode='55000'; end if;
 if exists(select 1 from public.adbridge_paystack_refund_attempts where refund_payment_id=p_refund_payment_id) then raise exception 'This refund has Paystack allocations. Settle or reconcile each allocation separately; full manual confirmation is disabled to prevent double refunds.' using errcode='55000'; end if;
 if not exists(select 1 from public.campaigns where id=v.campaign_id and status='closed') then raise exception 'Campaign must be closed before refund settlement' using errcode='55000'; end if;
 update public.campaign_payments set status='refunded',provider_reference=trim(p_provider_reference),provider=coalesce(nullif(provider,''),'manual refund') where id=p_refund_payment_id;
 return jsonb_build_object('ok',true,'refund_payment_id',p_refund_payment_id,'amount',v.amount,'status','refunded');
end; $$;
create or replace function public.admin_resolve_paystack_refund_attempt(p_attempt_id uuid,p_external_reference text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype;
begin
 if private.current_user_profile_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if nullif(trim(p_external_reference),'') is null then raise exception 'Actual external settlement reference is required' using errcode='22023'; end if;
 select * into a from public.adbridge_paystack_refund_attempts where id=p_attempt_id for update;
 if not found then raise exception 'Refund allocation not found' using errcode='P0002'; end if;
 if a.status not in ('failed','needs-attention','manual_review') then raise exception 'Only failed or attention-required allocations can be manually settled' using errcode='55000'; end if;
 update public.adbridge_paystack_refund_attempts set status='processed',provider_status='manual_settlement_verified',provider_refund_id='external:'||trim(p_external_reference),last_error=null,updated_at=now() where id=p_attempt_id;
 if not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_and_manual_refund',provider_reference='settled:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('ok',true,'attempt_id',p_attempt_id,'amount',a.amount,'status','processed');
end; $$;
revoke all on function public.admin_resolve_paystack_refund_attempt(uuid,text) from public,anon;
grant execute on function public.admin_resolve_paystack_refund_attempt(uuid,text) to authenticated;