revoke update on table public.profiles from authenticated;
grant update(display_name,email,platform,bio) on table public.profiles to authenticated;
create or replace function public.admin_set_profile_role(p_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$ begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 if p_role not in ('creator','advertiser','publisher') then raise exception 'invalid account role' using errcode='22023'; end if;
 update public.profiles set role=p_role,verified=case when p_role='creator' then verified else false end where id=p_user_id;
 if not found then raise exception 'profile not found' using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'user_id',p_user_id,'role',p_role);
end; $$;
revoke all on function public.admin_set_profile_role(uuid,text) from public,anon;
grant execute on function public.admin_set_profile_role(uuid,text) to authenticated;
create or replace function public.admin_set_creator_verified(p_creator_id uuid,p_verified boolean)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$ begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 update public.profiles set verified=p_verified where id=p_creator_id and role='creator';
 if not found then raise exception 'creator profile not found' using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'creator_id',p_creator_id,'verified',p_verified);
end; $$;
revoke all on function public.admin_set_creator_verified(uuid,boolean) from public,anon;
grant execute on function public.admin_set_creator_verified(uuid,boolean) to authenticated;
