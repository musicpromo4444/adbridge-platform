revoke update on table public.publisher_properties from authenticated;
grant update(property_type,name,url,platforms,ad_formats,updated_at) on table public.publisher_properties to authenticated;
drop policy if exists "publisher_properties admin read" on public.publisher_properties;
create policy "publisher_properties admin read" on public.publisher_properties for select to authenticated using (private.current_user_profile_role()='admin');
revoke update on table public.publisher_channels from authenticated;
grant update(channel_type,platform,name,handle,url,app_store_url,metadata,updated_at) on table public.publisher_channels to authenticated;
drop policy if exists "publisher_channels admin read" on public.publisher_channels;
create policy "publisher_channels admin read" on public.publisher_channels for select to authenticated using (private.current_user_profile_role()='admin');
create or replace function public.admin_set_publisher_property_verified(p_property_id uuid,p_verified boolean)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$ begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 update public.publisher_properties set verified=p_verified,updated_at=now() where id=p_property_id;
 if not found then raise exception 'publisher property not found' using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'property_id',p_property_id,'verified',p_verified);
end; $$;
revoke all on function public.admin_set_publisher_property_verified(uuid,boolean) from public,anon;
grant execute on function public.admin_set_publisher_property_verified(uuid,boolean) to authenticated;
create or replace function public.admin_set_publisher_channel_verified(p_channel_id uuid,p_verified boolean)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$ begin
 if private.current_user_profile_role()<>'admin' then raise exception 'administrator access required' using errcode='42501'; end if;
 update public.publisher_channels set verified=p_verified,updated_at=now() where id=p_channel_id;
 if not found then raise exception 'publisher channel not found' using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'channel_id',p_channel_id,'verified',p_verified);
end; $$;
revoke all on function public.admin_set_publisher_channel_verified(uuid,boolean) from public,anon;
grant execute on function public.admin_set_publisher_channel_verified(uuid,boolean) to authenticated;
