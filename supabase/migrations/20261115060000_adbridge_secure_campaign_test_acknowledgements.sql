-- Secure the creator campaign understanding check behind an authenticated RPC.
-- The external-resource flag is explicitly self-reported; it is not proof of activity
-- on a third-party website and must never be used as a paid completion signal.

create table if not exists public.creator_campaign_test_acknowledgements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  campaign_test_id uuid not null
    references public.campaign_tests(id) on delete cascade,
  creator_id uuid not null
    references auth.users(id) on delete cascade,
  external_resource_opened_self_reported boolean not null default false,
  acknowledged_at timestamptz not null default pg_catalog.now(),
  constraint creator_campaign_test_acknowledgements_creator_test_key
    unique (campaign_test_id, creator_id)
);

alter table public.creator_campaign_test_acknowledgements
  enable row level security;

drop policy if exists "creators read own campaign test acknowledgements"
  on public.creator_campaign_test_acknowledgements;

create policy "creators read own campaign test acknowledgements"
  on public.creator_campaign_test_acknowledgements
  for select to authenticated
  using (creator_id = (select auth.uid()));

-- Acknowledgements are read-only to browser roles. The function below is the
-- only authenticated write path; the legacy table is also closed if it exists.
revoke all on table public.creator_campaign_test_acknowledgements
  from public, anon, authenticated;
grant select on table public.creator_campaign_test_acknowledgements
  to authenticated;
grant all on table public.creator_campaign_test_acknowledgements
  to service_role;

do $migration$
begin
  if pg_catalog.to_regclass('public.creator_campaign_tests') is not null then
    execute 'revoke all on table public.creator_campaign_tests from public, anon, authenticated';
  end if;
end
$migration$;

create or replace function public.complete_campaign_test_acknowledgement(
  p_campaign_test_id uuid,
  p_external_resource_opened_self_reported boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_requires_external_resource boolean := false;
  v_external_resource_opened boolean :=
    coalesce(p_external_resource_opened_self_reported, false);
  v_acknowledged_at timestamptz;
begin
  if v_creator_id is null then
    raise exception using
      errcode = '28000',
      message = 'Sign in before acknowledging this campaign.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_creator_id
       and p.role = 'creator'
  ) then
    raise exception using
      errcode = '42501',
      message = 'A creator account is required for this acknowledgement.';
  end if;

  select (
    nullif(pg_catalog.btrim(coalesce(ct.action_url, '')), '') is not null
    or exists (
      select 1
        from public.campaign_assets a
       where a.campaign_id = ct.campaign_id
         and a.asset_type = 'website_app_link'
         and nullif(pg_catalog.btrim(coalesce(a.asset_url, '')), '') is not null
    )
  )
    into v_requires_external_resource
    from public.campaign_tests ct
    join public.campaigns c on c.id = ct.campaign_id
   where ct.id = p_campaign_test_id
     and ct.required is true
     and c.status = 'active';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This required campaign acknowledgement is no longer available.';
  end if;

  if v_requires_external_resource and not v_external_resource_opened then
    raise exception using
      errcode = '22023',
      message = 'Confirm that you opened the campaign resource before continuing.';
  end if;

  insert into public.creator_campaign_test_acknowledgements (
    campaign_test_id,
    creator_id,
    external_resource_opened_self_reported,
    acknowledged_at
  )
  values (
    p_campaign_test_id,
    v_creator_id,
    v_external_resource_opened,
    pg_catalog.now()
  )
  on conflict (campaign_test_id, creator_id)
  do update set
    external_resource_opened_self_reported =
      excluded.external_resource_opened_self_reported,
    acknowledged_at = pg_catalog.now()
  returning acknowledged_at into v_acknowledged_at;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'acknowledged_at', v_acknowledged_at,
    'external_resource_opened_self_reported', v_external_resource_opened
  );
end;
$function$;

revoke all on function public.complete_campaign_test_acknowledgement(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_campaign_test_acknowledgement(uuid, boolean)
  to authenticated;
