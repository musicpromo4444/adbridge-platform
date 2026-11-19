-- Secure creator OAuth credentials and add provider-backed token refresh.
-- This migration is ordered after the live database head observed on 2026-11-19
-- (20261119184544). It deliberately keeps legacy columns dual-written until the
-- updated Edge Functions are deployed and verified.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
comment on schema private is
  'Internal AdBridge schema. Do not add this schema to Supabase Data API exposed schemas.';

create table if not exists private.creator_platform_credentials (
  creator_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat')),
  platform_user_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected boolean not null default true,
  refresh_lease_until timestamptz,
  last_refresh_attempt_at timestamptz,
  last_refreshed_at timestamptz,
  last_refresh_error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (creator_id, platform),
  constraint creator_platform_credentials_access_token_length
    check (access_token is null or pg_catalog.char_length(access_token) between 1 and 8192),
  constraint creator_platform_credentials_connected_token_check
    check (connected is not true or access_token is not null),
  constraint creator_platform_credentials_refresh_token_length
    check (refresh_token is null or pg_catalog.char_length(refresh_token) <= 8192),
  constraint creator_platform_credentials_user_id_length
    check (platform_user_id is null or pg_catalog.char_length(platform_user_id) <= 512),
  constraint creator_platform_credentials_refresh_error_code_check
    check (
      last_refresh_error_code is null
      or last_refresh_error_code in (
        'provider_not_configured',
        'provider_error',
        'invalid_grant',
        'invalid_response',
        'network_error'
      )
    )
);

alter table private.creator_platform_credentials
  alter column access_token drop not null;

alter table private.creator_platform_credentials
  add column if not exists refresh_lease_until timestamptz,
  add column if not exists last_refresh_attempt_at timestamptz,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_refresh_error_code text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'creator_platform_credentials_connected_token_check'
      and conrelid = 'private.creator_platform_credentials'::regclass
  ) then
    alter table private.creator_platform_credentials
      add constraint creator_platform_credentials_connected_token_check
      check (connected is not true or access_token is not null);
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'creator_platform_credentials_refresh_error_code_check'
      and conrelid = 'private.creator_platform_credentials'::regclass
  ) then
    alter table private.creator_platform_credentials
      add constraint creator_platform_credentials_refresh_error_code_check
      check (
        last_refresh_error_code is null
        or last_refresh_error_code in (
          'provider_not_configured',
          'provider_error',
          'invalid_grant',
          'invalid_response',
          'network_error'
        )
      );
  end if;
end;
$$;

comment on table private.creator_platform_credentials is
  'Server-only creator OAuth credentials and refresh leases. Never expose the private schema through the Data API.';

alter table private.creator_platform_credentials enable row level security;
revoke all on table private.creator_platform_credentials
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.creator_platform_credentials
  to service_role;

create index if not exists creator_platform_credentials_refresh_due_idx
  on private.creator_platform_credentials(platform, expires_at)
  where connected is true and refresh_token is not null;

-- Copy existing connected credentials before the updated Edge Functions are deployed.
insert into private.creator_platform_credentials (
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

-- Browser clients can read only safe connection metadata. Admins retain metadata
-- visibility, but neither creators nor admins can read OAuth tokens.
alter table public.creator_platform_connections enable row level security;
drop policy if exists "creator manage own platform connections"
  on public.creator_platform_connections;
drop policy if exists "creator read own platform connection metadata"
  on public.creator_platform_connections;
drop policy if exists "admin read platform connection metadata"
  on public.creator_platform_connections;

create policy "creator read own platform connection metadata"
  on public.creator_platform_connections
  for select
  to authenticated
  using (creator_id = (select auth.uid()));

create policy "admin read platform connection metadata"
  on public.creator_platform_connections
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

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
  from private.creator_platform_credentials c
  where c.creator_id = p_creator_id
    and c.platform = pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')))
    and c.connected is true
    and exists (
      select 1 from public.profiles p
      where p.id = c.creator_id and p.role = 'creator'
    );
$function$;

revoke all on function public.get_creator_platform_credentials(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_creator_platform_credentials(uuid, text)
  to service_role;

create or replace function public.upsert_creator_platform_credentials(
  p_creator_id uuid,
  p_platform text,
  p_platform_user_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_is_refresh boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
begin
  if p_creator_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_creator_id and p.role = 'creator'
  ) then
    raise exception using errcode = '42501', message = 'A valid creator account is required.';
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

  insert into private.creator_platform_credentials (
    creator_id, platform, platform_user_id, access_token, refresh_token,
    expires_at, connected, refresh_lease_until, last_refresh_attempt_at,
    last_refreshed_at, last_refresh_error_code, updated_at
  )
  values (
    p_creator_id, v_platform, p_platform_user_id, p_access_token, p_refresh_token,
    p_expires_at, true, null,
    case when coalesce(p_is_refresh, false) then pg_catalog.now() else null end,
    case when coalesce(p_is_refresh, false) then pg_catalog.now() else null end,
    null, pg_catalog.now()
  )
  on conflict (creator_id, platform) do update
  set platform_user_id = excluded.platform_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      connected = true,
      refresh_lease_until = null,
      last_refresh_attempt_at = case when coalesce(p_is_refresh, false) then pg_catalog.now() else null end,
      last_refreshed_at = case when coalesce(p_is_refresh, false) then pg_catalog.now() else c.last_refreshed_at end,
      last_refresh_error_code = null,
      updated_at = pg_catalog.now();

  -- Keep legacy columns dual-written until every deployed metric function uses
  -- the private credential reader. Browser roles have no access to these values.
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

revoke all on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz)
  to service_role;

-- A database lease prevents simultaneous TikTok refreshes from consuming the
-- same rotating refresh token. Only service_role can claim a lease or see tokens.
create or replace function public.claim_creator_platform_refresh(
  p_creator_id uuid,
  p_platform text,
  p_force boolean default false
)
returns table (
  claim_status text,
  platform_user_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  v_now timestamptz := pg_catalog.now();
  v_credential private.creator_platform_credentials%rowtype;
begin
  if p_creator_id is null then
    raise exception using errcode = '22023', message = 'A creator account is required.';
  end if;
  if v_platform not in ('youtube', 'tiktok') then
    return query select 'unsupported'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select c.* into v_credential
  from private.creator_platform_credentials c
  where c.creator_id = p_creator_id
    and c.platform = v_platform
  for update;

  if not found or v_credential.connected is not true then
    return query select 'not_connected'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_credential.refresh_token is null or pg_catalog.btrim(v_credential.refresh_token) = '' then
    return query select 'reconnect_required'::text, null::text, null::text, null::text, v_credential.expires_at;
    return;
  end if;
  if v_credential.refresh_lease_until is not null and v_credential.refresh_lease_until > v_now then
    return query select 'in_progress'::text, null::text, null::text, null::text, v_credential.expires_at;
    return;
  end if;
  if v_credential.last_refresh_attempt_at is not null
     and v_credential.last_refresh_attempt_at > v_now - interval '30 seconds' then
    return query select 'rate_limited'::text, null::text, null::text, null::text, v_credential.expires_at;
    return;
  end if;
  if coalesce(p_force, false) is false
     and (v_credential.expires_at is null or v_credential.expires_at > v_now + interval '5 minutes') then
    return query select 'not_due'::text, null::text, null::text, null::text, v_credential.expires_at;
    return;
  end if;

  update private.creator_platform_credentials c
  set refresh_lease_until = v_now + interval '90 seconds',
      last_refresh_attempt_at = v_now,
      last_refresh_error_code = null,
      updated_at = v_now
  where c.creator_id = p_creator_id
    and c.platform = v_platform;

  return query select
    'claimed'::text,
    v_credential.platform_user_id,
    v_credential.access_token,
    v_credential.refresh_token,
    v_credential.expires_at;
end;
$function$;

revoke all on function public.claim_creator_platform_refresh(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_creator_platform_refresh(uuid, text, boolean)
  to service_role;

create or replace function public.fail_creator_platform_refresh(
  p_creator_id uuid,
  p_platform text,
  p_error_code text,
  p_reauth_required boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  v_error_code text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_error_code, '')));
begin
  if p_creator_id is null or v_platform not in ('youtube', 'tiktok') then
    raise exception using errcode = '22023', message = 'A valid creator and refreshable platform are required.';
  end if;
  if v_error_code not in ('provider_not_configured', 'provider_error', 'invalid_grant', 'invalid_response', 'network_error') then
    raise exception using errcode = '22023', message = 'Unsupported refresh error code.';
  end if;

  update private.creator_platform_credentials c
  set refresh_lease_until = null,
      last_refresh_error_code = v_error_code,
      connected = case when coalesce(p_reauth_required, false) then false else c.connected end,
      access_token = case when coalesce(p_reauth_required, false) then null else c.access_token end,
      refresh_token = case when coalesce(p_reauth_required, false) then null else c.refresh_token end,
      updated_at = pg_catalog.now()
  where c.creator_id = p_creator_id
    and c.platform = v_platform;

  if coalesce(p_reauth_required, false) then
    update public.creator_platform_connections c
    set connected = false,
        access_token = null,
        refresh_token = null,
        expires_at = null,
        updated_at = pg_catalog.now()
    where c.creator_id = p_creator_id
      and c.platform = v_platform;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'platform', v_platform,
    'reauth_required', coalesce(p_reauth_required, false)
  );
end;
$function$;

revoke all on function public.fail_creator_platform_refresh(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_creator_platform_refresh(uuid, text, text, boolean)
  to service_role;

create or replace function private.disconnect_creator_platform(p_platform text)
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
    select 1 from public.profiles p
    where p.id = v_creator_id and p.role = 'creator'
  ) then
    raise exception using errcode = '42501', message = 'Creator access is required.';
  end if;

  if v_platform not in ('tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat') then
    raise exception using errcode = '22023', message = 'Unsupported social platform.';
  end if;

  delete from private.creator_platform_credentials c
  where c.creator_id = v_creator_id and c.platform = v_platform;
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

revoke all on function private.disconnect_creator_platform(text)
  from public, anon, authenticated;
grant execute on function private.disconnect_creator_platform(text)
  to authenticated;

create or replace function public.disconnect_creator_platform(p_platform text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.disconnect_creator_platform(p_platform);
$function$;

revoke all on function public.disconnect_creator_platform(text)
  from public, anon, authenticated;
grant execute on function public.disconnect_creator_platform(text)
  to authenticated;

comment on function public.get_creator_platform_credentials(uuid, text) is
  'Returns creator platform credentials only to service_role for server-side metric verification.';
comment on function public.upsert_creator_platform_credentials(uuid, text, text, text, text, timestamptz, boolean) is
  'Stores creator OAuth credentials; execution is restricted to service_role.';
comment on function public.claim_creator_platform_refresh(uuid, text, boolean) is
  'Claims a short refresh lease for YouTube or TikTok credentials; execution is restricted to service_role.';
comment on function public.fail_creator_platform_refresh(uuid, text, text, boolean) is
  'Releases a refresh lease and marks revoked credentials as requiring reauthorization; execution is restricted to service_role.';
comment on function public.disconnect_creator_platform(text) is
  'Allows a creator to disconnect their own platform and clears stored credentials; it does not revoke the external platform grant.';
