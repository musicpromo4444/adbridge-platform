create or replace function public.create_advertiser_campaign(
  p_name text,
  p_goal text,
  p_instructions text,
  p_platforms text[],
  p_formats text[],
  p_payment_method text,
  p_payment_rate numeric,
  p_max_budget numeric,
  p_desired_results integer,
  p_destination_url text default null,
  p_asset_types text[] default '{}'::text[],
  p_asset_urls text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role text := private.current_user_profile_role();
  v_campaign_id uuid;
  v_platform text;
  v_format text;
  v_asset_type text;
  v_asset_url text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_role <> 'advertiser' then
    raise exception 'only advertiser accounts can create campaigns' using errcode = '42501';
  end if;
  if not coalesce((select allow_new_campaigns from public.platform_settings where id = 1), true) then
    raise exception 'new campaigns are temporarily disabled by AdBridge' using errcode = '55000';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_goal), '') is null or nullif(trim(p_instructions), '') is null then
    raise exception 'campaign name, goal and instructions are required' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cpm','cpc','cpi','cpa','link_traffic','product_placement','brand_mention','partnership','job') then
    raise exception 'unsupported payment model' using errcode = '22023';
  end if;
  if coalesce(p_payment_rate,0) <= 0 or coalesce(p_max_budget,0) <= 0 or coalesce(p_desired_results,0) <= 0 then
    raise exception 'rate, budget and target must all be greater than zero' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_platforms),0) = 0 or coalesce(cardinality(p_formats),0) = 0 then
    raise exception 'select at least one platform and one delivery format' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_platforms) x
    where x not in ('instagram','tiktok','youtube','facebook','x','snapchat','linkedin','website','web_app','android_app','ios_app','all')
  ) then
    raise exception 'one or more selected platforms are not supported' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_formats) x
    where x not in ('web','web_app','android_app','ios_app','social_post','social_story','social_reel','social_video','web_banner','web_native','web_interstitial','web_video','app_banner','app_native','app_interstitial','app_video','app_rewarded_video')
  ) then
    raise exception 'one or more selected formats are not supported' using errcode = '22023';
  end if;
  if p_payment_method in ('cpc','link_traffic','cpi','cpa') and
     (p_destination_url is null or length(trim(p_destination_url)) > 2048 or trim(p_destination_url) !~* '^https?://[^[:space:]]+$') then
    raise exception 'a valid website or app destination URL is required for this payment model' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_asset_types),0) > 0 and exists (
    select 1 from unnest(p_asset_types) x
    where x not in ('product_media','sample','brand_assets','website_app_link','other')
  ) then
    raise exception 'one or more campaign asset types are invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_asset_urls),0) > 0 and exists (
    select 1 from unnest(p_asset_urls) x
    where x !~* '^https?://[^[:space:]]+$'
  ) then
    raise exception 'one or more uploaded asset URLs are invalid' using errcode = '22023';
  end if;

  v_platform := case when cardinality(p_platforms) = 1 then p_platforms[1] else 'multiple' end;
  insert into public.campaigns (
    advertiser_id,name,goal,instructions,platform,payment_method,payment_rate,max_budget,
    desired_results,status,funded_amount
  ) values (
    v_user,trim(p_name),trim(p_goal),trim(p_instructions),v_platform,p_payment_method,
    p_payment_rate,p_max_budget,p_desired_results,'draft',0
  ) returning id into v_campaign_id;

  foreach v_platform in array p_platforms loop
    insert into public.campaign_platforms(campaign_id,platform,enabled)
    values (v_campaign_id,v_platform,true);
  end loop;

  foreach v_format in array p_formats loop
    insert into public.campaign_formats(campaign_id,format,status,integration_type,requirements)
    values (
      v_campaign_id,v_format,'ready',
      case v_format
        when 'web' then 'web_embed' when 'web_banner' then 'web_embed'
        when 'web_native' then 'web_native' when 'web_interstitial' then 'web_interstitial'
        when 'web_video' then 'web_video' when 'web_app' then 'web_app_package'
        when 'android_app' then 'android_adapter' when 'ios_app' then 'ios_adapter'
        when 'social_post' then 'social_post' when 'social_story' then 'social_story'
        when 'social_reel' then 'social_reel' when 'social_video' then 'social_video'
        when 'app_banner' then 'app_banner' when 'app_native' then 'app_native'
        when 'app_interstitial' then 'app_interstitial' when 'app_video' then 'app_video'
        when 'app_rewarded_video' then 'app_rewarded_video' else 'web_embed'
      end,
      case
        when v_format in ('web','web_banner') then 'Requires a website banner or browser placement.'
        when v_format = 'web_native' then 'Requires a website native placement.'
        when v_format = 'web_interstitial' then 'Requires a website full-screen placement.'
        when v_format = 'web_video' then 'Requires a website video placement.'
        when v_format = 'web_app' then 'Requires a web app or web application placement.'
        when v_format = 'android_app' then 'Requires an Android app placement; native SDK/provider wiring may be required.'
        when v_format = 'ios_app' then 'Requires an iOS app placement; native SDK/provider wiring may be required.'
        when v_format like 'social_%' then 'Requires a supported social publishing destination.'
        when v_format = 'app_banner' then 'Requires an app banner placement.'
        when v_format = 'app_native' then 'Requires an app native placement.'
        when v_format = 'app_interstitial' then 'Requires an in-app full-screen placement.'
        when v_format = 'app_video' then 'Requires an in-app video placement.'
        when v_format = 'app_rewarded_video' then 'Requires an in-app rewarded video placement.'
        else 'Requires a compatible publisher placement.'
      end
    );
  end loop;

  foreach v_asset_type in array coalesce(p_asset_types,'{}'::text[]) loop
    insert into public.campaign_assets(campaign_id,asset_type) values (v_campaign_id,v_asset_type);
  end loop;

  foreach v_asset_url in array coalesce(p_asset_urls,'{}'::text[]) loop
    insert into public.campaign_assets(campaign_id,asset_type,asset_url)
    values (v_campaign_id,case when lower(v_asset_url) like '%.pdf' then 'brand_assets' else 'product_media' end,v_asset_url);
  end loop;

  if p_destination_url is not null and trim(p_destination_url) <> '' then
    insert into public.campaign_destination_urls(campaign_id,target_url)
    values (v_campaign_id,trim(p_destination_url));
  end if;

  insert into public.campaign_tests(campaign_id,test_type,title,instructions,action_label,required)
  values (v_campaign_id,'understanding','Campaign understanding check',
    'Read the advertiser instructions carefully. Confirm that you understand what must be shown, said, posted, linked or achieved before accepting the campaign.',
    'Complete understanding check',true);

  insert into public.campaign_tracking_rules(
    campaign_id,track_views,track_clicks,track_installs,track_signups,
    track_purchases,track_leads,track_traffic,fraud_detection
  ) values (
    v_campaign_id,
    p_payment_method = 'cpm',
    p_payment_method in ('cpc','link_traffic'),
    p_payment_method = 'cpi',
    p_payment_method = 'cpa',
    p_payment_method = 'cpa',
    p_payment_method = 'cpa',
    p_payment_method in ('cpc','link_traffic'),
    true
  );

  return jsonb_build_object('ok',true,'campaign_id',v_campaign_id,'status','draft');
end;
$$;

revoke all on function public.create_advertiser_campaign(text,text,text,text[],text[],text,numeric,numeric,integer,text,text[],text[]) from public, anon;
grant execute on function public.create_advertiser_campaign(text,text,text,text[],text[],text,numeric,numeric,integer,text,text[],text[]) to authenticated;
