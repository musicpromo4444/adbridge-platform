create or replace function public.paystack_reconcile_refund_webhook_by_transaction(p_transaction_reference text,p_amount_kobo bigint,p_status text,p_provider_refund_id text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a public.adbridge_paystack_refund_attempts%rowtype; match_count integer;
begin
 if p_transaction_reference is null or p_amount_kobo is null or p_amount_kobo<=0 then return jsonb_build_object('matched',false); end if;
 if p_status not in ('pending','processing','needs-attention','processed','failed') then return jsonb_build_object('matched',false,'ignored',true); end if;
 select count(*) into match_count from public.adbridge_paystack_refund_attempts x join public.campaign_payments f on f.id=x.funding_payment_id
 where f.provider='paystack' and f.provider_reference=p_transaction_reference and round(x.amount*100)=p_amount_kobo and x.status not in ('processed','failed');
 if match_count<>1 then return jsonb_build_object('matched',false,'ambiguous',match_count>1); end if;
 select x.* into a from public.adbridge_paystack_refund_attempts x join public.campaign_payments f on f.id=x.funding_payment_id
 where f.provider='paystack' and f.provider_reference=p_transaction_reference and round(x.amount*100)=p_amount_kobo and x.status not in ('processed','failed') for update of x;
 update public.adbridge_paystack_refund_attempts set status=p_status,provider_status=p_status,provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),updated_at=now() where id=a.id;
 if p_status='processed' and not exists(select 1 from public.adbridge_paystack_refund_attempts x where x.refund_payment_id=a.refund_payment_id and x.id<>a.id and x.status<>'processed') then update public.campaign_payments set status='refunded',provider='paystack_refund',provider_reference='paystack:'||a.refund_payment_id::text where id=a.refund_payment_id and status='pending';
 elsif p_status='failed' then update public.campaign_payments set provider='paystack_refund_attention' where id=a.refund_payment_id and status='pending'; end if;
 return jsonb_build_object('matched',true,'attempt_id',a.id,'matched_by','transaction_and_amount');
end; $$;
revoke all on function public.paystack_reconcile_refund_webhook_by_transaction(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.paystack_reconcile_refund_webhook_by_transaction(text,bigint,text,text) to service_role;