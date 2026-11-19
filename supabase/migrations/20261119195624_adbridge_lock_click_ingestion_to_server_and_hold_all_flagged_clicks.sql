create or replace function public.record_tracking_click(
 p_slug text,p_visitor_key text,p_ip_hash text,p_user_agent text,p_referrer text
)
returns table(target_url text,counted boolean,unique_counted boolean)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
 v_link public.tracking_links%rowtype; v_campaign public.campaigns%rowtype; v_click_id uuid;
 v_unique boolean:=false; v_paid_amount numeric(18,2); v_spent numeric(18,2); v_budget numeric(18,2);
 v_recent_ip_clicks integer; v_payment_status text:='released'; v_has_open_fraud boolean:=false;
begin
 if nullif(trim(p_slug),'') is null or nullif(trim(p_visitor_key),'') is null or nullif(trim(p_ip_hash),'') is null then
  raise exception 'slug, visitor key and IP hash are required' using errcode='22023';
 end if;
 select * into v_link from public.tracking_links where slug=p_slug;
 if not found then return; end if;
 select * into v_campaign from public.campaigns where id=v_link.campaign_id for update;
 if not found or v_campaign.status not in ('funded','active') then return; end if;
 select count(*) into v_recent_ip_clicks from public.tracking_clicks
 where tracking_link_id=v_link.id and ip_hash=p_ip_hash and clicked_at>now()-interval '10 minutes';
 if v_recent_ip_clicks>=60 then return query select v_link.target_url,false,false; return; end if;
 insert into public.tracking_clicks(tracking_link_id,visitor_key,ip_hash,user_agent,referrer)
 values(v_link.id,p_visitor_key,p_ip_hash,left(coalesce(p_user_agent,''),500),nullif(p_referrer,''))
 on conflict(tracking_link_id,visitor_key) do nothing returning id into v_click_id;
 v_unique:=v_click_id is not null;
 update public.tracking_links set click_count=coalesce(click_count,0)+1,
 unique_click_count=coalesce(unique_click_count,0)+case when v_unique then 1 else 0 end where id=v_link.id;
 if v_unique and lower(coalesce(v_campaign.payment_method,'')) in ('cpc','link_traffic') and v_link.creator_id is not null then
  v_paid_amount:=greatest(coalesce(v_campaign.payment_rate,0),0);
  select coalesce(sum(amount),0) into v_spent from public.campaign_payments
   where campaign_id=v_campaign.id and type='creator_payment' and status in ('pending','held','released');
  v_budget:=least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
  select exists(select 1 from public.fraud_flags ff where ff.campaign_id=v_campaign.id
   and ff.creator_id=v_link.creator_id and ff.status in ('open','reviewing')) into v_has_open_fraud;
  if v_has_open_fraud then v_payment_status:='held'; end if;
  if v_paid_amount>0 and v_spent+v_paid_amount<=v_budget then
   insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_click_id)
   values(v_campaign.id,v_link.creator_id,v_paid_amount,'creator_payment',v_payment_status,v_click_id);
   update public.tracking_links set paid_clicks=coalesce(paid_clicks,0)+1 where id=v_link.id;
  end if;
 end if;
 return query select v_link.target_url,true,v_unique;
end; $function$;

revoke all on function public.record_tracking_click(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_tracking_click(text,text,text,text,text) to service_role;
