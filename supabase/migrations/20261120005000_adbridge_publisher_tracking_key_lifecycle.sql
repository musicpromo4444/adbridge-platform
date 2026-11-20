-- Add explicit publisher signing-key lifecycle controls.
-- The existing Edge Function already rejects signatures when revoked_at is set;
-- this migration adds versioning, an immutable audit trail, and server-only RPCs.

alter table public.publisher_tracking_secrets
  add column if not exists key_version integer not null default 1,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'publisher_tracking_secrets_key_version_check'
      and conrelid = 'public.publisher_tracking_secrets'::regclass
  ) then
    alter table public.publisher_tracking_secrets
      add constraint publisher_tracking_secrets_key_version_check check (key_version > 0);
  end if;
end;
$migration$;

create table if not exists private.publisher_tracking_key_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  property_id uuid not null references public.publisher_properties(id) on delete cascade,
  publisher_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('issued', 'rotated', 'revoked')),
  key_version integer not null check (key_version > 0),
  occurred_at timestamptz not null default pg_catalog.now()
);

alter table private.publisher_tracking_key_audit enable row level security;
revoke all on table private.publisher_tracking_key_audit
  from public, anon, authenticated, service_role;

create index if not exists publisher_tracking_key_audit_property_time_idx
  on private.publisher_tracking_key_audit(property_id, occurred_at desc);

comment on table private.publisher_tracking_key_audit is
  'Private, append-only audit trail for publisher tracking-key issuance, rotation, and revocation. Contains no signing secrets.';

create or replace function private.rotate_publisher_tracking_key(
  p_property_id uuid, p_actor_id uuid, p_secret_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_property public.publisher_properties%rowtype;
  v_existing public.publisher_tracking_secrets%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_version integer;
  v_action text;
begin
  if p_property_id is null or p_actor_id is null or p_secret_value is null
     or pg_catalog.char_length(p_secret_value) not between 32 and 512 then
    raise exception using errcode = '22023', message = 'Invalid publisher key request.';
  end if;

  select pp.* into v_property from public.publisher_properties pp
  where pp.id = p_property_id for update;

  if not found or v_property.publisher_id <> p_actor_id or v_property.verified is not true
     or not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'publisher') then
    raise exception using errcode = '42501', message = 'A verified publisher property owned by this publisher is required.';
  end if;

  select s.* into v_existing from public.publisher_tracking_secrets s
  where s.property_id = p_property_id for update;

  if found then
    v_version := pg_catalog.coalesce(v_existing.key_version, 1) + 1;
    v_action := 'rotated';
    update public.publisher_tracking_secrets s
    set publisher_id = p_actor_id, secret_value = p_secret_value, key_version = v_version,
        rotated_at = v_now, revoked_at = null, revoked_by = null
    where s.property_id = p_property_id;
  else
    v_version := 1;
    v_action := 'issued';
    insert into public.publisher_tracking_secrets (
      property_id, publisher_id, secret_value, key_version, created_at, rotated_at, revoked_at, revoked_by
    ) values (p_property_id, p_actor_id, p_secret_value, v_version, v_now, v_now, null, null);
  end if;

  insert into private.publisher_tracking_key_audit (
    property_id, publisher_id, actor_id, action, key_version, occurred_at
  ) values (p_property_id, p_actor_id, p_actor_id, v_action, v_version, v_now);

  return pg_catalog.jsonb_build_object('ok', true, 'action', v_action, 'key_version', v_version, 'rotated_at', v_now);
end;
$function$;

create or replace function private.revoke_publisher_tracking_key(
  p_property_id uuid, p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_property public.publisher_properties%rowtype;
  v_existing public.publisher_tracking_secrets%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if p_property_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'A property and publisher are required.';
  end if;

  select pp.* into v_property from public.publisher_properties pp
  where pp.id = p_property_id for update;

  if not found or v_property.publisher_id <> p_actor_id
     or not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'publisher') then
    raise exception using errcode = '42501', message = 'This publisher property cannot be managed by this account.';
  end if;

  select s.* into v_existing from public.publisher_tracking_secrets s
  where s.property_id = p_property_id for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'has_key', false, 'revoked', false,
      'key_version', null, 'rotated_at', null, 'revoked_at', null);
  end if;

  if v_existing.revoked_at is not null then
    return pg_catalog.jsonb_build_object('ok', true, 'has_key', true, 'revoked', true,
      'key_version', v_existing.key_version, 'rotated_at', v_existing.rotated_at, 'revoked_at', v_existing.revoked_at);
  end if;

  update public.publisher_tracking_secrets s
  set revoked_at = v_now, revoked_by = p_actor_id
  where s.property_id = p_property_id;

  insert into private.publisher_tracking_key_audit (
    property_id, publisher_id, actor_id, action, key_version, occurred_at
  ) values (p_property_id, p_actor_id, p_actor_id, 'revoked', v_existing.key_version, v_now);

  return pg_catalog.jsonb_build_object('ok', true, 'has_key', true, 'revoked', true,
    'key_version', v_existing.key_version, 'rotated_at', v_existing.rotated_at, 'revoked_at', v_now);
end;
$function$;

grant usage on schema private to service_role;
revoke all on function private.rotate_publisher_tracking_key(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.rotate_publisher_tracking_key(uuid, uuid, text) to service_role;
revoke all on function private.revoke_publisher_tracking_key(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.revoke_publisher_tracking_key(uuid, uuid) to service_role;

create or replace function public.rotate_publisher_tracking_key(
  p_property_id uuid, p_actor_id uuid, p_secret_value text
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.rotate_publisher_tracking_key(p_property_id, p_actor_id, p_secret_value);
$function$;
revoke all on function public.rotate_publisher_tracking_key(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rotate_publisher_tracking_key(uuid, uuid, text) to service_role;

create or replace function public.revoke_publisher_tracking_key(p_property_id uuid, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.revoke_publisher_tracking_key(p_property_id, p_actor_id);
$function$;
revoke all on function public.revoke_publisher_tracking_key(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_publisher_tracking_key(uuid, uuid) to service_role;
