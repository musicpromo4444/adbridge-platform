revoke update on table public.campaigns from authenticated;
grant update(name,instructions,platform,payment_method,payment_rate,max_budget,desired_results,updated_at)
on table public.campaigns to authenticated;
create or replace function public.set_campaign_status(p_campaign_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_campaign public.campaigns%rowtype; v_role text:=private.current_user_profile_role(); v_is_owner boolean;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_status not in ('active','paused','closed','cancelled','completed') then raise exception 'invalid campaign status' using errcode='22023'; end if;
 select * into v_campaign from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 v_is_owner:=v_campaign.advertiser_id=auth.uid();
 if v_role<>'admin' and not(v_role='advertiser' and v_is_owner) then raise exception 'not authorized to manage this campaign' using errcode='42501'; end if;
 if v_role<>'admin' and p_status not in ('active','paused','closed') then raise exception 'advertisers may only activate, pause or close their campaigns' using errcode='42501'; end if;
 if p_status='active' and (coalesce(v_campaign.funded_amount,0)<=0 or coalesce(v_campaign.funded_amount,0)<coalesce(v_campaign.max_budget,0)) then
   raise exception 'campaign requires confirmed full funding before activation' using errcode='55000';
 end if;
 update public.campaigns set status=p_status,updated_at=now() where id=p_campaign_id;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status',p_status);
end;
$$;
revoke all on function public.set_campaign_status(uuid,text) from public,anon;
grant execute on function public.set_campaign_status(uuid,text) to authenticated;
