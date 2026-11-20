create or replace function public.save_campaign_destination(p_campaign_id uuid, p_target_url text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_role text := private.current_user_profile_role();
  v_url text := nullif(trim(p_target_url), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if v_role <> 'admin' and not (v_role = 'advertiser' and v_campaign.advertiser_id = auth.uid()) then
    raise exception 'not authorized to edit this campaign' using errcode = '42501';
  end if;

  if v_campaign.status <> 'draft' or coalesce(v_campaign.funded_amount, 0) > 0 then
    raise exception 'destination URL is locked after funding' using errcode = '55000';
  end if;

  if v_url is null then
    delete from public.campaign_destination_urls
    where campaign_id = p_campaign_id;
  else
    if length(v_url) > 2048 or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'enter a valid http or https destination URL' using errcode = '22023';
    end if;

    insert into public.campaign_destination_urls(campaign_id, target_url)
    values (p_campaign_id, v_url)
    on conflict (campaign_id) do update set target_url = excluded.target_url;
  end if;

  return jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'destination_saved', v_url is not null);
end;
$$;

revoke all on function public.save_campaign_destination(uuid, text) from public, anon;
grant execute on function public.save_campaign_destination(uuid, text) to authenticated;
