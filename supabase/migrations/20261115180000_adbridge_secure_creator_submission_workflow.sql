-- Make creator submissions and their tracking links one authenticated, atomic operation.
-- The privileged implementation lives outside Supabase's exposed API schemas.
-- Keep adbridge_private out of the project's exposed schemas.

create schema if not exists adbridge_private;
revoke all on schema adbridge_private from public, anon;
grant usage on schema adbridge_private to authenticated;
comment on schema adbridge_private is
  'Private AdBridge database routines. Do not expose this schema through PostgREST.';

alter table public.submissions enable row level security;
alter table public.tracking_links enable row level security;

-- Browser clients must use the authenticated submission RPC. Server-side service
-- functions retain their existing privileges.
revoke insert, update, delete on table public.submissions from public, anon, authenticated;
revoke insert, update, delete on table public.tracking_links from public, anon, authenticated;

create or replace function adbridge_private.submit_creator_campaign_work(
  p_job_id uuid,
  p_posted_url text,
  p_platform text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_campaign_id uuid;
  v_campaign record;
  v_job_status text;
  v_posted_url text := pg_catalog.btrim(coalesce(p_posted_url, ''));
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_parts text[];
  v_host text;
  v_path text;
  v_query text;
  v_payment_method text;
  v_target_metric numeric;
  v_destination_url text;
  v_destination_parts text[];
  v_destination_host text;
  v_submission_id uuid;
  v_tracking_slug text;
begin
  if v_creator_id is null then
    raise exception using errcode = '28000',
      message = 'Sign in before submitting campaign work.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_creator_id
       and p.role = 'creator'
  ) then
    raise exception using errcode = '42501',
      message = 'A creator account is required to submit campaign work.';
  end if;

  if p_job_id is null then
    raise exception using errcode = '22023',
      message = 'A campaign job is required.';
  end if;

  -- Resolve ownership before locking the campaign. The campaign lock serializes
  -- submissions with payment/target checks; the job lock prevents duplicate sends.
  select cc.campaign_id
    into v_campaign_id
    from public.creator_campaigns cc
   where cc.id = p_job_id
     and cc.creator_id = v_creator_id;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'Campaign job not found.';
  end if;

  select c.status, c.payment_method, c.desired_results, c.advertiser_id
    into v_campaign
    from public.campaigns c
   where c.id = v_campaign_id
   for update;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'Campaign not found.';
  end if;

  select cc.status
    into v_job_status
    from public.creator_campaigns cc
   where cc.id = p_job_id
     and cc.campaign_id = v_campaign_id
     and cc.creator_id = v_creator_id
   for update;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'Campaign job not found.';
  end if;

  if coalesce(v_campaign.status, '') not in ('active', 'funded') then
    raise exception using errcode = 'P0001',
      message = 'This campaign is not accepting submissions.';
  end if;

  if coalesce(v_job_status, '') not in ('accepted', 'in_progress', 'changes_requested') then
    raise exception using errcode = 'P0001',
      message = 'This campaign job is not ready for a submission.';
  end if;

  if exists (
    select 1
      from public.submissions s
     where s.creator_campaign_id = p_job_id
       and s.status in ('waiting', 'approved')
  ) then
    raise exception using errcode = 'P0001',
      message = 'This campaign already has a submission awaiting review or approval.';
  end if;

  if pg_catalog.length(v_posted_url) < 12
     or pg_catalog.length(v_posted_url) > 2048
     or v_posted_url ~ '[[:space:][:cntrl:]]' then
    raise exception using errcode = '22023',
      message = 'Enter a complete public post URL without spaces.';
  end if;

  v_parts := pg_catalog.regexp_match(
    v_posted_url,
    '^https?://([^/?#]+)(/[^?#]*)?([?][^#]*)?(#.*)?$',
    'i'
  );

  if v_parts is null then
    raise exception using errcode = '22023',
      message = 'The post URL must use HTTP or HTTPS.';
  end if;

  v_host := pg_catalog.lower(v_parts[1]);
  v_path := coalesce(v_parts[2], '/');
  v_query := coalesce(v_parts[3], '');

  -- Reject credentials, ports, IP literals, and local/private hostnames.
  if v_host !~ '^[a-z0-9.-]+$'
     or v_host !~ '\.'
     or v_host ~ '^[0-9.]+$'
     or v_host ~ '(^\.|\.$|\.\.|-\.)'
     or v_host = 'localhost'
     or v_host like '%.localhost'
     or v_host like '%.local'
     or v_host like '%.internal' then
    raise exception using errcode = '22023',
      message = 'Enter a public social post URL, not a local or private address.';
  end if;

  if v_platform in ('instagram', 'instagram reels') then
    if not (
      (v_host = 'instagram.com' or v_host like '%.instagram.com')
      and v_path ~* '^/(p|reel|reels|stories)/[^/]+'
    ) then
      raise exception using errcode = '22023',
        message = 'Use a direct Instagram post, reel, or story URL.';
    end if;
  elsif v_platform = 'tiktok' then
    if not (
      (v_host = 'tiktok.com' or v_host like '%.tiktok.com')
      and (
        v_path ~* '^/@[^/]+/(video|photo)/[0-9]+'
        or (
          v_host in ('vm.tiktok.com', 'vt.tiktok.com')
          and v_path ~ '^/[A-Za-z0-9_-]+/?$'
        )
      )
    ) then
      raise exception using errcode = '22023',
        message = 'Use a direct TikTok video or photo URL.';
    end if;
  elsif v_platform in ('youtube', 'youtube shorts') then
    if not (
      (
        v_host = 'youtu.be' or v_host like '%.youtu.be'
        or v_host = 'youtube.com' or v_host like '%.youtube.com'
      )
      and (
        ((v_host = 'youtu.be' or v_host like '%.youtu.be')
          and v_path ~ '^/[A-Za-z0-9_-]{6,}/?$')
        or v_path ~* '^/(shorts|embed)/[A-Za-z0-9_-]{6,}/?$'
        or (v_path ~* '^/watch/?$' and v_query ~* '(^[?]|&)v=[A-Za-z0-9_-]{6,}')
      )
    ) then
      raise exception using errcode = '22023',
        message = 'Use a direct YouTube video or Short URL.';
    end if;
  elsif v_platform in ('facebook', 'facebook reels') then
    if not (
      (
        v_host = 'facebook.com' or v_host like '%.facebook.com'
        or v_host = 'fb.watch' or v_host like '%.fb.watch'
      )
      and (
        v_path ~* '^/(reel|reels|videos|share/(r|v))/[^/]+'
        or v_path ~* '^/[^/]+/posts/[^/]+'
        or (v_path ~* '^/watch/?$' and v_query ~* '(^[?]|&)v=[A-Za-z0-9_-]+')
        or (
          (v_host = 'fb.watch' or v_host like '%.fb.watch')
          and v_path ~ '^/[A-Za-z0-9_-]+/?$'
        )
      )
    ) then
      raise exception using errcode = '22023',
        message = 'Use a direct Facebook post, reel, or video URL.';
    end if;
  elsif v_platform = 'x' then
    if not (
      (v_host = 'x.com' or v_host like '%.x.com'
        or v_host = 'twitter.com' or v_host like '%.twitter.com')
      and v_path ~* '^/[^/]+/status/[0-9]+/?$'
    ) then
      raise exception using errcode = '22023',
        message = 'Use a direct X/Twitter post URL.';
    end if;
  elsif v_platform = 'snapchat' then
    if not (
      (v_host = 'snapchat.com' or v_host like '%.snapchat.com')
      and v_path ~* '^/(spotlight|story)/[^/]+'
    ) then
      raise exception using errcode = '22023',
        message = 'Use a public Snapchat Spotlight or story URL.';
    end if;
  else
    raise exception using errcode = '22023',
      message = 'Choose a supported social platform.';
  end if;

  if v_note is not null and pg_catalog.length(v_note) > 2000 then
    raise exception using errcode = '22023',
      message = 'The note and evidence must be 2,000 characters or fewer.';
  end if;

  v_payment_method := pg_catalog.lower(coalesce(v_campaign.payment_method, ''));
  if v_payment_method in ('cpm', 'views')
     and coalesce(v_campaign.desired_results, 0) > 0 then
    v_target_metric := v_campaign.desired_results;
  else
    v_target_metric := null;
  end if;

  -- Tracked models must receive a usable AdBridge redirect in the same
  -- transaction as the submission. Never leave a creator with an untracked job.
  if v_payment_method in ('cpc', 'clicks', 'link_traffic', 'cpi', 'cpa', 'actions') then
    select cd.target_url
      into v_destination_url
      from public.campaign_destination_urls cd
     where cd.campaign_id = v_campaign_id
     limit 1;

    if not found or v_destination_url is null then
      raise exception using errcode = 'P0001',
        message = 'This tracked campaign is missing its advertiser destination URL.';
    end if;

    if pg_catalog.length(v_destination_url) > 2048
       or v_destination_url ~ '[[:space:][:cntrl:]]' then
      raise exception using errcode = '22023',
        message = 'The advertiser destination URL is invalid.';
    end if;

    v_destination_parts := pg_catalog.regexp_match(
      v_destination_url,
      '^https?://([^/?#]+)',
      'i'
    );

    if v_destination_parts is null then
      raise exception using errcode = '22023',
        message = 'The advertiser destination must use HTTP or HTTPS.';
    end if;

    v_destination_host := pg_catalog.lower(v_destination_parts[1]);
    if v_destination_host !~ '^[a-z0-9.-]+$'
       or v_destination_host !~ '\.'
       or v_destination_host ~ '^[0-9.]+$'
       or v_destination_host ~ '(^\.|\.$|\.\.|-\.)'
       or v_destination_host = 'localhost'
       or v_destination_host like '%.localhost'
       or v_destination_host like '%.local'
       or v_destination_host like '%.internal' then
      raise exception using errcode = '22023',
        message = 'The advertiser destination must be a public website URL.';
    end if;
  end if;

  insert into public.submissions (
    campaign_id,
    creator_id,
    creator_campaign_id,
    posted_url,
    note,
    status,
    tracking_platform,
    target_metric,
    current_metric,
    metric_status
  )
  values (
    v_campaign_id,
    v_creator_id,
    p_job_id,
    v_posted_url,
    v_note,
    'waiting',
    v_platform,
    v_target_metric,
    0,
    case when v_target_metric is null then 'not_required' else 'pending' end
  )
  returning id into v_submission_id;

  if v_payment_method in ('cpc', 'clicks', 'link_traffic', 'cpi', 'cpa', 'actions') then
    v_tracking_slug := 'c_' ||
      pg_catalog.left(
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        20
      );

    insert into public.tracking_links (
      campaign_id,
      creator_id,
      submission_id,
      slug,
      target_url
    )
    values (
      v_campaign_id,
      v_creator_id,
      v_submission_id,
      v_tracking_slug,
      v_destination_url
    );
  end if;

  update public.creator_campaigns
     set status = 'submitted'
   where id = p_job_id
     and campaign_id = v_campaign_id
     and creator_id = v_creator_id;

  if v_campaign.advertiser_id is not null then
    insert into public.notifications (user_id, title, body, kind, link)
    values (
      v_campaign.advertiser_id,
      'New campaign submission',
      'A creator has submitted work for one of your campaigns. Review the campaign summary in AdBridge.',
      'campaign_submission',
      '/advertiser/review'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'status', 'waiting',
    'payment_method', v_payment_method,
    'tracking_slug', v_tracking_slug
  );
end;
$function$;

revoke all on function adbridge_private.submit_creator_campaign_work(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function adbridge_private.submit_creator_campaign_work(uuid, text, text, text)
  to authenticated;

create or replace function public.submit_creator_campaign_work(
  p_job_id uuid,
  p_posted_url text,
  p_platform text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select adbridge_private.submit_creator_campaign_work(
    p_job_id,
    p_posted_url,
    p_platform,
    p_note
  );
$wrapper$;

revoke all on function public.submit_creator_campaign_work(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_creator_campaign_work(uuid, text, text, text)
  to authenticated;
