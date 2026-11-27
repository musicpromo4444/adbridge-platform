create or replace function public.paystack_update_refund_attempt_internal(p_attempt_id uuid,p_status text,p_provider_refund_id text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype;
begin
 if p_status not in ('submitting','pending','processing','needs-attention','processed','failed','manual_review') then raise exception 'Invalid refund state' using errcode='22023'; end if;
 select * into a from public.adbridge_paystack_refund_attempts where id=p_attempt_id for update;
 if not found then raise exception 'Refund attempt not found' using errcode='P0002'; end if;
 if p_status='submitting' then
  if a.status not in ('queued','manual_review','submitting') then return jsonb_build_object('ok',true,'claimed',false,'status',a.status); end if;
  if a.status='submitting' and a.updated_at>now()-interval '2 minutes' then return jsonb_build_object('ok',true,'claimed',false,'status',a.status); end if;
 elsif a.status in ('processed','failed') and a.status<>p_status then raise exception 'Terminal refund state cannot be changed' using errcode='55000'; end if;
 update public.adbridge_paystack_refund_attempts set status=p_status,provider_status=p_status,provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),last_error=case when p_error is null then null else left(p_error,1000) end,updated_at=now() where id=p_attempt_id;
 if p_status='processed' and not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_refund',provider_reference='paystack:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending';
 elsif p_status='failed' then update public.campaign_payments set provider='paystack_refund_attention' where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('ok',true,'claimed',case when p_status='submitting' then true else null end,'attempt_id',p_attempt_id,'status',p_status);
end; $$;