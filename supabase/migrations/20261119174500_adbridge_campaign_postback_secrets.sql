begin;

create schema if not exists adbridge_private;
grant usage on schema adbridge_private to service_role;

create table if not exists adbridge_private.campaign_postback_secrets (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  rotated_at timestamptz not null default pg_catalog.now(),
  last_used_at timestamptz
);

alter table adbridge_private.campaign_postback_secrets enable row level security;
revoke all on table adbridge_private.campaign_postback_secrets from public, anon, authenticated;
grant select, insert, update, delete on table adbridge_private.campaign_postback_secrets to service_role;

create or replace function adbridge_private.get_campaign_postback_secret_status(
  p_campaign_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_advertiser_id uuid;
  v_payment_method text;
  v_rotated_at timestamptz;
  v_last_used_at timestamptz;
begin
  if p_campaign_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'Campaign and actor are required.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = p_actor_id;

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'An active AdBridge profile is required.';
  end if;
  if v_actor_role not in ('advertiser', 'admin') then
    raise exception using errcode = '42501', message = 'Advertiser access is required.';
  end if;

  select c.advertiser_id, c.payment_method
    into v_advertiser_id, v_payment_method
    from public.campaigns c
   where c.id = p_campaign_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;
  if v_actor_role <> 'admin' and v_advertiser_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'You cannot manage this campaign.';
  end if;
  if pg_catalog.lower(coalesce(v_payment_method, '')) not in ('cpa', 'cpi', 'actions') then
    raise exception using errcode = '22023', message = 'Campaign does not use conversion postbacks.';
  end if;

  select s.rotated_at, s.last_used_at
    into v_rotated_at, v_last_used_at
    from adbridge_private.campaign_postback_secrets s
   where s.campaign_id = p_campaign_id;

  if not found then
    return pg_catalog.jsonb_build_object('configured', false, 'rotated_at', null, 'last_used_at', null);
  end if;

  return pg_catalog.jsonb_build_object(
    'configured', true,
    'rotated_at', v_rotated_at,
    'last_used_at', v_last_used_at
  );
end;
$function$;

create or replace function adbridge_private.rotate_campaign_postback_secret(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_secret_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_advertiser_id uuid;
  v_payment_method text;
  v_campaign_status text;
  v_rotated_at timestamptz;
begin
  if p_campaign_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'Campaign and actor are required.';
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'A SHA-256 secret hash is required.';
  end if;

  select p.role
    into v_actor_role
    from public.profiles p
   where p.id = p_actor_id;

  if v_actor_role is null or v_actor_role not in ('advertiser', 'admin') then
    raise exception using errcode = '42501', message = 'Advertiser access is required.';
  end if;

  select c.advertiser_id, c.payment_method, c.status
    into v_advertiser_id, v_payment_method, v_campaign_status
    from public.campaigns c
   where c.id = p_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;
  if v_actor_role <> 'admin' and v_advertiser_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'You cannot manage this campaign.';
  end if;
  if pg_catalog.lower(coalesce(v_payment_method, '')) not in ('cpa', 'cpi', 'actions') then
    raise exception using errcode = '22023', message = 'Campaign does not use conversion postbacks.';
  end if;
  if v_campaign_status = 'closed' then
    raise exception using errcode = '55000', message = 'Closed campaigns cannot rotate postback credentials.';
  end if;

  insert into adbridge_private.campaign_postback_secrets (
    campaign_id, secret_hash, created_by, rotated_at, last_used_at
  )
  values (
    p_campaign_id, p_secret_hash, p_actor_id, pg_catalog.now(), null
  )
  on conflict (campaign_id) do update
    set secret_hash = excluded.secret_hash,
        created_by = excluded.created_by,
        rotated_at = excluded.rotated_at,
        last_used_at = null
  returning rotated_at into v_rotated_at;

  return pg_catalog.jsonb_build_object(
    'configured', true,
    'rotated_at', v_rotated_at,
    'last_used_at', null
  );
end;
$function$;

create or replace function adbridge_private.verify_campaign_postback_secret(
  p_campaign_id uuid,
  p_secret_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_hash text;
begin
  if p_campaign_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid postback credential.';
  end if;

  select s.secret_hash
    into v_secret_hash
    from adbridge_private.campaign_postback_secrets s
   where s.campaign_id = p_campaign_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('configured', false, 'valid', false);
  end if;

  if v_secret_hash <> p_secret_hash then
    return pg_catalog.jsonb_build_object('configured', true, 'valid', false);
  end if;

  update adbridge_private.campaign_postback_secrets
     set last_used_at = pg_catalog.now()
   where campaign_id = p_campaign_id;

  return pg_catalog.jsonb_build_object('configured', true, 'valid', true);
end;
$function$;

revoke all on function adbridge_private.get_campaign_postback_secret_status(uuid, uuid) from public, anon, authenticated;
revoke all on function adbridge_private.rotate_campaign_postback_secret(uuid, uuid, text) from public, anon, authenticated;
revoke all on function adbridge_private.verify_campaign_postback_secret(uuid, text) from public, anon, authenticated;
grant execute on function adbridge_private.get_campaign_postback_secret_status(uuid, uuid) to service_role;
grant execute on function adbridge_private.rotate_campaign_postback_secret(uuid, uuid, text) to service_role;
grant execute on function adbridge_private.verify_campaign_postback_secret(uuid, text) to service_role;

create or replace function public.get_campaign_postback_secret_status(
  p_campaign_id uuid,
  p_actor_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.get_campaign_postback_secret_status(p_campaign_id, p_actor_id);
$function$;

create or replace function public.rotate_campaign_postback_secret(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_secret_hash text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.rotate_campaign_postback_secret(p_campaign_id, p_actor_id, p_secret_hash);
$function$;

create or replace function public.verify_campaign_postback_secret(
  p_campaign_id uuid,
  p_secret_hash text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select adbridge_private.verify_campaign_postback_secret(p_campaign_id, p_secret_hash);
$function$;

revoke all on function public.get_campaign_postback_secret_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rotate_campaign_postback_secret(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_campaign_postback_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.get_campaign_postback_secret_status(uuid, uuid) to service_role;
grant execute on function public.rotate_campaign_postback_secret(uuid, uuid, text) to service_role;
grant execute on function public.verify_campaign_postback_secret(uuid, text) to service_role;

comment on table adbridge_private.campaign_postback_secrets is
  'Stores only SHA-256 hashes for campaign-specific CPA/CPI postback credentials. Plaintext is returned once by the authenticated secret-management Edge Function.';
comment on function public.verify_campaign_postback_secret(uuid, text) is
  'Service-role-only verifier for a campaign-specific postback secret. Returns configured/valid flags and never returns the stored hash.';

commit;
