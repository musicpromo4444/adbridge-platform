create or replace function public.replace_campaign_delivery_options(
 p_campaign_id uuid,p_platforms text[],p_formats text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role text; v_campaign public.campaigns%rowtype; v_platform_count integer; v_format_count integer;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_role:=private.current_user_profile_role();
 select * into v_campaign from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
 if v_role<>'admin' and not(v_role='advertiser' and v_campaign.advertiser_id=v_user) then raise exception 'Not authorized to edit this campaign' using errcode='42501'; end if;
 if v_campaign.status<>'draft' or coalesce(v_campaign.funded_amount,0)>0 then raise exception 'Only unfunded draft campaigns can change delivery options' using errcode='55000'; end if;
 if p_platforms is null or cardinality(p_platforms)=0 or p_formats is null or cardinality(p_formats)=0 then raise exception 'Choose at least one platform and one delivery format' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_platforms) x where x not in ('instagram','tiktok','youtube','facebook','x','snapchat','linkedin','website','web_app','android_app','ios_app')) then raise exception 'Unsupported campaign platform' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_formats) x where x not in ('web','web_app','android_app','ios_app','social_post','social_story','social_reel','social_video','web_banner','web_native','web_interstitial','web_video','app_banner','app_native','app_interstitial','app_video','app_rewarded_video')) then raise exception 'Unsupported campaign delivery format' using errcode='22023'; end if;
 select count(distinct x) into v_platform_count from unnest(p_platforms) x;
 select count(distinct x) into v_format_count from unnest(p_formats) x;
 if v_platform_count<>cardinality(p_platforms) or v_format_count<>cardinality(p_formats) then raise exception 'Duplicate platform or format selections are not allowed' using errcode='22023'; end if;
 delete from public.campaign_platforms where campaign_id=p_campaign_id;
 insert into public.campaign_platforms(campaign_id,platform,enabled) select p_campaign_id,x,true from unnest(p_platforms) x;
 delete from public.campaign_formats where campaign_id=p_campaign_id;
 insert into public.campaign_formats(campaign_id,format,status) select p_campaign_id,x,'ready' from unnest(p_formats) x;
 return jsonb_build_object('success',true,'platform_count',v_platform_count,'format_count',v_format_count);
end; $$;
revoke all on function public.replace_campaign_delivery_options(uuid,text[],text[]) from public,anon;
grant execute on function public.replace_campaign_delivery_options(uuid,text[],text[]) to authenticated;