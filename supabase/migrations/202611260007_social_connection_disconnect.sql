CREATE OR REPLACE FUNCTION public.disconnect_creator_platform(p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_user uuid:=auth.uid();v_platform text:=lower(coalesce(p_platform,''));v_rows integer;
begin
 if v_user is null then raise exception 'authentication required' using errcode='42501';end if;
 if private.current_user_profile_role()<>'creator' then raise exception 'creator access required' using errcode='42501';end if;
 if v_platform not in ('tiktok','youtube','instagram','facebook','x','snapchat') then raise exception 'unsupported platform' using errcode='22023';end if;
 update public.creator_platform_connections set connected=false,access_token=null,refresh_token=null,platform_user_id=null,expires_at=null,updated_at=now() where creator_id=v_user and platform=v_platform;
 get diagnostics v_rows=row_count;
 return jsonb_build_object('ok',true,'disconnected',v_rows>0,'platform',v_platform);
end;$function$
