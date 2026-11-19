alter table public.campaign_payments
  add column if not exists source_click_id uuid references public.tracking_clicks(id) on delete restrict;
create unique index if not exists campaign_payments_source_click_once
  on public.campaign_payments(source_click_id) where source_click_id is not null;

drop policy if exists "public can read tracking links" on public.tracking_links;

create or replace function public.resolve_tracking_destination(p_slug text)
returns table(target_url text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select l.target_url from public.tracking_links l
  join public.campaigns c on c.id = l.campaign_id
  where l.slug = p_slug and c.status in ('funded','active')
  limit 1;
$$;
revoke all on function public.resolve_tracking_destination(text) from public, authenticated;
grant execute on function public.resolve_tracking_destination(text) to anon, authenticated, service_role;

create or replace function public.record_tracking_click(
  p_slug text,
  p_visitor_key text,
  p_user_agent text,
  p_referrer text
)
returns table(target_url text, counted boolean, unique_counted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.tracking_links%rowtype;
  v_campaign public.campaigns%rowtype;
  v_click_id uuid;
  v_unique boolean := false;
  v_paid_amount numeric(18,2);
  v_spent numeric(18,2);
  v_budget numeric(18,2);
begin
  if nullif(trim(p_slug),'') is null or nullif(trim(p_visitor_key),'') is null then
    raise exception 'slug and visitor key are required' using errcode = '22023';
  end if;
  select * into v_link from public.tracking_links where slug = p_slug;
  if not found then return; end if;
  select * into v_campaign from public.campaigns where id = v_link.campaign_id for update;
  if not found or v_campaign.status not in ('funded','active') then return; end if;
  insert into public.tracking_clicks(tracking_link_id,visitor_key,ip_hash,user_agent,referrer)
  values(v_link.id,p_visitor_key,p_visitor_key,left(coalesce(p_user_agent,''),500),nullif(p_referrer,''))
  on conflict (tracking_link_id,visitor_key) do nothing
  returning id into v_click_id;
  v_unique := v_click_id is not null;
  update public.tracking_links
    set click_count=coalesce(click_count,0)+1,
        unique_click_count=coalesce(unique_click_count,0)+case when v_unique then 1 else 0 end
  where id=v_link.id;
  if v_unique and lower(coalesce(v_campaign.payment_method,'')) in ('cpc','link_traffic')
     and v_link.creator_id is not null then
    v_paid_amount := greatest(coalesce(v_campaign.payment_rate,0),0);
    select coalesce(sum(amount),0) into v_spent from public.campaign_payments
     where campaign_id=v_campaign.id and type='creator_payment'
       and status in ('pending','held','released');
    v_budget := least(coalesce(v_campaign.max_budget,0),coalesce(v_campaign.funded_amount,0));
    if v_paid_amount>0 and v_spent+v_paid_amount<=v_budget then
      insert into public.campaign_payments(campaign_id,creator_id,amount,type,status,source_click_id)
      values(v_campaign.id,v_link.creator_id,v_paid_amount,'creator_payment','released',v_click_id);
      update public.tracking_links set paid_clicks=coalesce(paid_clicks,0)+1 where id=v_link.id;
    end if;
  end if;
  return query select v_link.target_url,true,v_unique;
end;
$$;
revoke all on function public.record_tracking_click(text,text,text,text) from public;
grant execute on function public.record_tracking_click(text,text,text,text) to anon, authenticated, service_role;
