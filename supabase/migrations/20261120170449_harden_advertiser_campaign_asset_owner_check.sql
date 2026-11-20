create or replace function private.validate_advertiser_campaign_asset_owner()
returns trigger
language plpgsql
security definer
set search_path = public, private, storage, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_object_path text;
begin
  if new.asset_url is null or btrim(new.asset_url) = '' then
    return new;
  end if;

  select advertiser_id into v_owner
  from public.campaigns
  where id = new.campaign_id;

  if v_owner is null then
    raise exception 'campaign not found' using errcode = '23503';
  end if;

  if v_owner = v_user then
    if new.asset_url !~* '^https?://[^/]+/storage/v1/object/public/campaign-assets/.+' then
      raise exception 'campaign assets must be uploaded to the campaign-assets bucket' using errcode = '42501';
    end if;

    v_object_path := regexp_replace(
      split_part(new.asset_url, '/storage/v1/object/public/campaign-assets/', 2),
      '[?#].*$',
      ''
    );

    if v_object_path !~ ('^' || v_user::text || '/[^/]+$') then
      raise exception 'campaign asset does not belong to this advertiser' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'campaign-assets'
        and o.name = v_object_path
        and o.owner_id = v_user::text
    ) then
      raise exception 'uploaded campaign asset was not found or is not owned by this advertiser' using errcode = '42501';
    end if;
  elsif coalesce(private.current_user_profile_role(), '') <> 'admin' then
    raise exception 'not allowed to attach assets to this campaign' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_advertiser_campaign_asset_owner() from public, anon, authenticated;
