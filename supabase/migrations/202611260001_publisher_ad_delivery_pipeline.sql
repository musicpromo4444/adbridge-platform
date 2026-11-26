-- Publisher-specific ad delivery pipeline
alter table public.publisher_campaigns add column if not exists selected_property_id uuid references public.publisher_properties(id) on delete set null;
alter table public.ad_placements add column if not exists creative_asset_url text;
alter table public.ad_placements add column if not exists publisher_application_id uuid references public.publisher_campaigns(id) on delete cascade;
create unique index if not exists ad_placements_application_format_uq on public.ad_placements(publisher_application_id,format) where publisher_application_id is not null;

create or replace function public.sync_approved_publisher_ad_placement()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
  v_property public.publisher_properties%rowtype;
  v_campaign public.campaigns%rowtype;
  v_option public.campaign_delivery_options%rowtype;
begin
  if new.status <> 'approved' or new.selected_property_id is null then return new; end if;
  select * into v_property from public.publisher_properties where id=new.selected_property_id and publisher_id=new.publisher_id and verified=true;
  if not found then return new; end if;
  select * into v_campaign from public.campaigns where id=new.campaign_id and status in ('funded','active');
  if not found or new.selected_platform is null or new.selected_format is null then return new; end if;
  if not (v_property.platforms @> array[new.selected_platform] and v_property.ad_formats @> array[new.selected_format]) then return new; end if;
  for v_option in select * from public.campaign_delivery_options where campaign_id=new.campaign_id and enabled=true and platform=new.selected_platform and format=new.selected_format
  loop
    insert into public.ad_placements(name,placement_key,description,enabled,format,provider,campaign_id,icon,action_url,frequency_cap,target_pages,starts_at,ends_at,publisher_id,publisher_property_id,creative_asset_url,publisher_application_id)
    values(v_campaign.name || ' · ' || v_property.name,'abp_' || replace(gen_random_uuid()::text,'-',''),coalesce(v_option.requirements,'Approved publisher campaign placement'),true,v_option.format,'AdBridge Campaign',v_campaign.id,null,v_option.destination_url,0,array[]::text[],null,null,new.publisher_id,v_property.id,v_option.asset_url,new.id)
    on conflict (publisher_application_id,format) where publisher_application_id is not null do update
      set enabled=true,action_url=excluded.action_url,creative_asset_url=excluded.creative_asset_url,description=excluded.description,updated_at=now();
  end loop;
  return new;
end; $$;

drop trigger if exists publisher_application_ad_placement_sync on public.publisher_campaigns;
create trigger publisher_application_ad_placement_sync
after insert or update of status,selected_property_id,selected_platform,selected_format on public.publisher_campaigns
for each row execute function public.sync_approved_publisher_ad_placement();

-- Restrict publisher applications to a verified property owned by that publisher
-- that supports the exact selected platform and format.
drop policy if exists publisher_campaigns_insert_own on public.publisher_campaigns;
create policy publisher_campaigns_insert_own on public.publisher_campaigns for insert to authenticated with check (
 publisher_id=(select auth.uid())
 and private.current_user_profile_role()='publisher'
 and exists(select 1 from public.campaigns c where c.id=publisher_campaigns.campaign_id and c.status in ('funded','active'))
 and exists(select 1 from public.campaign_platforms cp where cp.campaign_id=publisher_campaigns.campaign_id and (cp.platform=publisher_campaigns.selected_platform or cp.platform='all') and cp.enabled=true)
 and exists(select 1 from public.campaign_formats cf where cf.campaign_id=publisher_campaigns.campaign_id and cf.format=publisher_campaigns.selected_format and cf.status='ready')
 and selected_property_id is not null
 and exists(select 1 from public.publisher_properties pp where pp.id=publisher_campaigns.selected_property_id and pp.publisher_id=publisher_campaigns.publisher_id and pp.verified=true and pp.platforms @> array[publisher_campaigns.selected_platform] and pp.ad_formats @> array[publisher_campaigns.selected_format])
);
