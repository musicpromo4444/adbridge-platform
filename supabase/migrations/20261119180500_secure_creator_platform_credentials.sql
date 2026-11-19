-- Keep creator OAuth credentials out of the browser-facing connection metadata API.
-- The private credential table is not exposed through the Supabase Data API.
-- Legacy token columns remain temporarily for rollback compatibility; browser roles
-- lose all access to them, while the server-side OAuth writer dual-writes during rollout.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon, authenticated, service_role;
grant usage on schema adbridge_private to authenticated, service_role;
comment on schema adbridge_private is
  'Internal AdBridge schema. Do not add this schema to the Supabase Data API exposed schemas.';

create table if not exists adbridge_private.creator_platform_credentials (
  creator_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat')),
  platform_user_id text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  connected boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (creator_id, platform),
  constraint creator_platform_credentials_access_token_length
    check (pg_catalog.char_length(access_token) between 1 and 8192),
  constraint creator_platform_credentials_refresh_token_length
    check (refresh_token is null or pg_catalog.char_length(refresh_token) <= 8192),
  constraint creator_platform_credentials_user_id_length
    check (platform_user_id is null or pg_catalog.char_length(platform_user_id) <= 512)
);

alter table adbridge_private.creator_platform_credentials enable row level security;
revoke all on table adbridge_private.creator_platform_credentials
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table adbridge_private.creator_platform_credentials
  to service_role;

-- Copy existing connected credentials before the new server-side RPCs are used.
insert into adbridge_private.creator_platform_credentials (
  creator_id, platform, platform_user_id, access_token, refresh_token,
  expires_at, connected, created_at, updated_at
)
select
  c.creator_id, c.platform, c.platform_user_id, c.access_token, c.refresh_token,
  c.expires_at, c.connected, c.created_at, c.updated_at
from public.creator_platform_connections c
where c.connected is true
  and c.access_token is not null
on conflict (creator_id, platform) do update
set platform_user_id = excluded.platform_user_id,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    connected = excluded.connected,
    updated_at = excluded.updated_at;

-- Keep only non-secret metadata available to the creator through the Data API.
alter table public.creator_platform_connections enable row level security;
drop policy if exists "creator manage own platform connections"
  on public.creator_platform_connections;
create policy "creator read own platform connection metadata"
  on public.creator_platform_connections
  for select
  to authenticated
  using (creator_id = (select auth.uid()));

revoke all privileges on table public.creator_platform_connections
  from public, anon, authenticated;
revoke all privileges (
  id, creator_id, platform, platform_user_id, access_token, refresh_token,
  expires_at, connected, created_at, updated_at
) on table public.creator_platform_connections
  from public, anon, authenticated;
grant select (creator_id, platform, connected, expires_at, updated_at)
  on table public.creator_platform_connections
  to authenticated;

-- Service-role-only credential reader used by tracking Edge Functions.
create or replace function public.get_creator_platform_credentials(
  p_creator_id uuid,
  p_platform text
)
returns table (
  platform_user_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.platform_user_id,
    c.access_token,
    c.refresh_token,
    c.expires_at,
    c.connected
  from adbridge_private.creator_platform_credentials c
  where c.creator_id = p_creator_id
    and c.platform = pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')))
    and c.connected is true;
$function$;

revoke all on function public.get_creator_platform_credentials(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_creator_platform_credentials(uuid, text)
  to service_role;

-- OAuth callback stores credentials privately and dual-writes the legacy columns
-- until all deployed tracking functions have moved to the private credential RPC.
create or replace function public.upsert_creator_platform_credentials(
  p_creator_id uuid,
  p_platform text,
  p_platform_user_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
begin
  if p_creator_id is null then
    raise exception using errcode = '22023', message = 'A creator account is required.';
  end if;

  if v_platform not in ('tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat') then
    raise exception using errcode = '22023', message = 'Unsupported social platform.';
  end if;

  if p_access_token is null
     or pg_catalog.char_length(p_access_token) not between 1 and 8192
     or (p_refresh_token is not null and pg_catalog.char_length(p_refresh_token) > 8192)
     or (p_platform_user_id is not null and pg_catalog.char_length(p_platform_user_id) > 512) then
    raise exception using errcode = '22023', message = 'The platform credential payload is invalid.';
  end if;

  insert into adbridge_private.creator_platform_credentials (
    creator_id, platform, platform_user_id, access_token, refresh_token,
    expires_at, connected, updated_at
  )
  values (
    p_creator_id, v_platform, p_platform_user_id, p_access_token, p_refresh_token,
    p_expires_at, true, pg_catalog.now()
  )
  on conflict (creator_id, platform) do update
  set platform_user_id = excluded.platform_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      connected = true,
      updated_at = pg_catalog.now();

  insert into public.creator_platform_connections (
    creator_id, platform, platform_user_id, access_token, refresh_token,
    expires_at, connected, updated_at
  )
  values (
    p_creator_id, v_platform, p_platform_user_id, p_access_token, p_refresh_token,
    p_expires_at, true, pg_catalog.now()
  )
  on conflict (creator_id, platform) do update
  set platform_user_id = excluded.platform_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      connected = true,
      updated_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object('success', true, 'platform', v_platform);
end;
$function$;

revoke all on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz)
  to service_role;

-- Creator-triggered disconnect clears both the private credentials and legacy
-- compatibility columns. The public wrapper is invoker-security.
create or replace function adbridge_private.disconnect_creator_platform(p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  v_credentials_deleted integer := 0;
  v_metadata_updated integer := 0;
begin
  if v_creator_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_creator_id
      and p.role = 'creator'
  ) then
    raise exception using errcode = '42501', message = 'Creator access is required.';
  end if;

  if v_platform not in ('tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat') then
    raise exception using errcode = '22023', message = 'Unsupported social platform.';
  end if;

  delete from adbridge_private.creator_platform_credentials c
  where c.creator_id = v_creator_id
    and c.platform = v_platform;
  get diagnostics v_credentials_deleted = row_count;

  update public.creator_platform_connections c
  set connected = false,
      platform_user_id = null,
      access_token = null,
      refresh_token = null,
      expires_at = null,
      updated_at = pg_catalog.now()
  where c.creator_id = v_creator_id
    and c.platform = v_platform
    and (
      c.connected is distinct from false
      or c.platform_user_id is not null
      or c.access_token is not null
      or c.refresh_token is not null
      or c.expires_at is not null
    );
  get diagnostics v_metadata_updated = row_count;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'platform', v_platform,
    'disconnected', (v_credentials_deleted + v_metadata_updated) > 0
  );
end;
$function$;

revoke all on function adbridge_private.disconnect_creator_platform(text)
  from public, anon, authenticated;
grant execute on function adbridge_private.disconnect_creator_platform(text)
  to authenticated;

create or replace function public.disconnect_creator_platform(p_platform text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.disconnect_creator_platform(p_platform);
$function$;

revoke all on function public.disconnect_creator_platform(text)
  from public, anon, authenticated;
grant execute on function public.disconnect_creator_platform(text)
  to authenticated;

comment on function public.get_creator_platform_credentials(uuid, text) is
  'Returns a creator platform credential only to the service role for server-side metric verification.';
comment on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz) is
  'Stores OAuth credentials for a creator. Execute is restricted to service_role.';
comment on function public.disconnect_creator_platform(text) is
  'Allows a creator to disconnect their own platform from AdBridge and clears stored credentials; it does not revoke the external platform grant.';
