create or replace function private.bootstrap_first_admin(
  p_user_id uuid,
  p_display_name text default null,
  p_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('adbridge-first-admin-bootstrap', 0));

  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;

  insert into public.profiles(id, role, display_name, email, verified)
  values (
    p_user_id,
    'admin',
    coalesce(nullif(trim(p_display_name), ''), 'AdBridge Administrator'),
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    true
  )
  on conflict (id) do update
    set role = 'admin',
        display_name = coalesce(nullif(trim(p_display_name), ''), public.profiles.display_name, 'AdBridge Administrator'),
        email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), public.profiles.email),
        verified = true;

  return true;
end;
$function$;

revoke all on function private.bootstrap_first_admin(uuid,text,text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.bootstrap_first_admin(uuid,text,text) to service_role;
