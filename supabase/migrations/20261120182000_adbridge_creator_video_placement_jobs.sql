create table if not exists public.creator_placement_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  creator_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  campaign_asset_id uuid not null references public.campaign_assets(id) on delete restrict,
  platform text not null check (platform in ('tiktok','youtube','shorts','facebook','facebook-reels','x','snapchat','instagram')),
  placement_type text not null check (placement_type in ('card','floating','logo','natural')),
  duration_seconds numeric(8,2) not null check (duration_seconds between 1 and 600),
  frame_width integer not null check (frame_width between 1 and 7680),
  frame_height integer not null check (frame_height between 1 and 7680),
  frame_count smallint not null check (frame_count between 4 and 6),
  status text not null default 'processing' check (status in ('processing','succeeded','failed')),
  result jsonb,
  provider_model text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint creator_placement_jobs_request_unique unique (creator_id, request_id),
  constraint creator_placement_jobs_state_consistent check (
    (status = 'processing' and result is null and completed_at is null and error_code is null)
    or (status = 'succeeded' and result is not null and completed_at is not null and error_code is null and provider_model is not null)
    or (status = 'failed' and result is null and completed_at is not null and error_code is not null)
  )
);

create index if not exists creator_placement_jobs_creator_created_idx
  on public.creator_placement_jobs (creator_id, created_at desc);
create index if not exists creator_placement_jobs_campaign_created_idx
  on public.creator_placement_jobs (campaign_id, created_at desc);

alter table public.creator_placement_jobs enable row level security;

revoke all on table public.creator_placement_jobs from public, anon, authenticated;
grant select on table public.creator_placement_jobs to authenticated;
grant all on table public.creator_placement_jobs to service_role;

drop policy if exists "Creators read own placement jobs" on public.creator_placement_jobs;
create policy "Creators read own placement jobs"
on public.creator_placement_jobs
for select
to authenticated
using (
  creator_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'creator'
  )
);

create or replace function private.create_creator_placement_job(
  p_request_id uuid,
  p_campaign_id uuid,
  p_campaign_asset_id uuid,
  p_platform text,
  p_placement_type text,
  p_duration_seconds numeric,
  p_frame_width integer,
  p_frame_height integer,
  p_frame_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_campaign_status text;
  v_asset_url text;
  v_existing_id uuid;
  v_existing_campaign uuid;
  v_existing_asset uuid;
  v_existing_platform text;
  v_existing_placement text;
  v_recent_count integer;
  v_job_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_request_id is null or p_campaign_id is null or p_campaign_asset_id is null then
    raise exception 'request, campaign and brand asset are required' using errcode = '22023';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user;
  if v_role is distinct from 'creator' then
    raise exception 'creator account required' using errcode = '42501';
  end if;

  if p_platform not in ('tiktok','youtube','shorts','facebook','facebook-reels','x','snapchat','instagram') then
    raise exception 'unsupported platform' using errcode = '22023';
  end if;
  if p_placement_type not in ('card','floating','logo','natural') then
    raise exception 'unsupported placement type' using errcode = '22023';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 600
     or p_frame_width is null or p_frame_width < 1 or p_frame_width > 7680
     or p_frame_height is null or p_frame_height < 1 or p_frame_height > 7680
     or p_frame_count is null or p_frame_count < 4 or p_frame_count > 6 then
    raise exception 'video analysis limits were exceeded' using errcode = '22023';
  end if;

  select c.status into v_campaign_status
  from public.campaigns c
  where c.id = p_campaign_id;
  if not found or v_campaign_status <> 'active' then
    raise exception 'campaign is not active' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.creator_campaigns cc
    where cc.campaign_id = p_campaign_id
      and cc.creator_id = v_user
      and cc.status = 'accepted'
  ) then
    raise exception 'creator must have accepted this campaign' using errcode = '42501';
  end if;

  select ca.asset_url into v_asset_url
  from public.campaign_assets ca
  where ca.id = p_campaign_asset_id
    and ca.campaign_id = p_campaign_id;
  if not found or v_asset_url is null
     or v_asset_url !~* '^https?://[^/]+/storage/v1/object/public/campaign-assets/.+\.(png|jpe?g|webp)([?#].*)?$' then
    raise exception 'select an uploaded campaign logo or image asset' using errcode = '22023';
  end if;

  select j.id, j.campaign_id, j.campaign_asset_id, j.platform, j.placement_type
  into v_existing_id, v_existing_campaign, v_existing_asset, v_existing_platform, v_existing_placement
  from public.creator_placement_jobs j
  where j.creator_id = v_user
    and j.request_id = p_request_id
  for update;
  if found then
    if v_existing_campaign <> p_campaign_id
       or v_existing_asset <> p_campaign_asset_id
       or v_existing_platform <> p_platform
       or v_existing_placement <> p_placement_type then
      raise exception 'request id was already used for different placement input' using errcode = '23505';
    end if;
    return v_existing_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select pg_catalog.count(*) into v_recent_count
  from public.creator_placement_jobs j
  where j.creator_id = v_user
    and j.created_at > pg_catalog.now() - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception 'placement analysis rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.creator_placement_jobs (
    request_id, creator_id, campaign_id, campaign_asset_id, platform,
    placement_type, duration_seconds, frame_width, frame_height, frame_count
  ) values (
    p_request_id, v_user, p_campaign_id, p_campaign_asset_id, p_platform,
    p_placement_type, p_duration_seconds, p_frame_width, p_frame_height, p_frame_count
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function private.create_creator_placement_job(uuid,uuid,uuid,text,text,numeric,integer,integer,integer) from public, anon;
grant execute on function private.create_creator_placement_job(uuid,uuid,uuid,text,text,numeric,integer,integer,integer) to authenticated;

create or replace function public.create_creator_placement_job(
  p_request_id uuid,
  p_campaign_id uuid,
  p_campaign_asset_id uuid,
  p_platform text,
  p_placement_type text,
  p_duration_seconds numeric,
  p_frame_width integer,
  p_frame_height integer,
  p_frame_count integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_creator_placement_job(
    p_request_id, p_campaign_id, p_campaign_asset_id, p_platform,
    p_placement_type, p_duration_seconds, p_frame_width, p_frame_height, p_frame_count
  );
$$;

revoke all on function public.create_creator_placement_job(uuid,uuid,uuid,text,text,numeric,integer,integer,integer) from public, anon;
grant execute on function public.create_creator_placement_job(uuid,uuid,uuid,text,text,numeric,integer,integer,integer) to authenticated;

comment on table public.creator_placement_jobs is
  'Creator-owned AI placement analyses. Original video and sampled frames are not stored; only validated placement results and analysis metadata are retained.';
