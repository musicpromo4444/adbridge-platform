revoke update(payment_method,payment_rate,max_budget,desired_results) on table public.campaigns from authenticated;
create or replace function public.update_campaign_draft(
 p_campaign_id uuid,p_name text,p_instructions text,p_platform text,p_payment_method text,
 p_payment_rate numeric,p_max_budget numeric,p_desired_results integer
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_campaign public.campaigns%rowtype; v_role text:=private.current_user_profile_role();
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_campaign from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 if v_role<>'admin' and not(v_role='advertiser' and v_campaign.advertiser_id=auth.uid()) then raise exception 'not authorized to edit this campaign' using errcode='42501'; end if;
 if v_campaign.status<>'draft' or coalesce(v_campaign.funded_amount,0)>0 then raise exception 'campaign terms are locked after funding; create a new draft to change the payment model or budget' using errcode='55000'; end if;
 if nullif(trim(p_name),'') is null or nullif(trim(p_instructions),'') is null then raise exception 'campaign name and instructions are required' using errcode='22023'; end if;
 if p_payment_method not in ('cpm','cpc','cpi','cpa','link_traffic','product_placement','brand_mention','partnership','job') then raise exception 'unsupported payment model' using errcode='22023'; end if;
 if coalesce(p_payment_rate,0)<=0 or coalesce(p_max_budget,0)<=0 or coalesce(p_desired_results,0)<=0 then raise exception 'rate, budget and target must all be greater than zero' using errcode='22023'; end if;
 if p_payment_method in ('cpc','link_traffic','cpi','cpa') and not exists(select 1 from public.campaign_destination_urls d where d.campaign_id=p_campaign_id) then raise exception 'this payment model requires a saved destination URL' using errcode='22023'; end if;
 update public.campaigns set name=trim(p_name),instructions=trim(p_instructions),platform=p_platform,payment_method=p_payment_method,payment_rate=p_payment_rate,max_budget=p_max_budget,desired_results=p_desired_results,updated_at=now() where id=p_campaign_id;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id);
end;
$$;
revoke all on function public.update_campaign_draft(uuid,text,text,text,text,numeric,numeric,integer) from public,anon;
grant execute on function public.update_campaign_draft(uuid,text,text,text,text,numeric,numeric,integer) to authenticated;
