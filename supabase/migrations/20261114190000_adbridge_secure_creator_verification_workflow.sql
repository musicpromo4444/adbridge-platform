-- Secure creator verification submissions and make admin review atomic.
-- This migration is version-controlled only; apply after the AdBridge project is resumed.

alter table public.creator_verification_submissions enable row level security;

drop policy if exists "creators submit own verification" on public.creator_verification_submissions;
drop policy if exists "admins manage creator verification" on public.creator_verification_submissions;
drop policy if exists "creators read own verification submissions" on public.creator_verification_submissions;
drop policy if exists "admins read creator verification submissions" on public.creator_verification_submissions;

create policy "creators read own verification submissions"
  on public.creator_verification_submissions
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and creator_id = (select auth.uid())
  );

create policy "admins read creator verification submissions"
  on public.creator_verification_submissions
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
        from public.profiles p
       where p.id = (select auth.uid())
         and p.role = 'admin'
    )
  );

-- Browser clients may read their own queue rows, but all writes must use the
-- authenticated, role-aware RPCs below. The service role remains server-only.
revoke all on table public.creator_verification_submissions from public, anon, authenticated;
grant select on table public.creator_verification_submissions to authenticated;
grant all on table public.creator_verification_submissions to service_role;

create index if not exists creator_verification_creator_recent_idx
  on public.creator_verification_submissions (creator_id, created_at desc);

create or replace function public.submit_creator_verification(
  p_platform text,
  p_post_type text,
  p_post_url text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := (select auth.uid());
  v_platform text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  v_post_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_post_type, '')));
  v_url text := pg_catalog.btrim(coalesce(p_post_url, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_parts text[];
  v_host text;
  v_path text;
  v_query text;
  v_recent_count integer := 0;
  v_submission_id uuid;
begin
  if v_creator_id is null then
    raise exception using errcode = '28000', message = 'Sign in before submitting a creator verification post.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_creator_id
       and p.role = 'creator'
  ) then
    raise exception using errcode = '42501', message = 'A creator account is required to submit verification.';
  end if;

  if v_platform not in ('instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'snapchat', 'other') then
    raise exception using errcode = '22023', message = 'Choose a supported social platform.';
  end if;

  if v_post_type not in ('text', 'image', 'video', 'story', 'reel', 'short') then
    raise exception using errcode = '22023', message = 'Choose a supported post type.';
  end if;

  if pg_catalog.length(v_url) < 12
     or pg_catalog.length(v_url) > 2048
     or v_url ~ '[[:space:][:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Enter a complete public post URL without spaces.';
  end if;

  v_parts := pg_catalog.regexp_match(
    v_url,
    '^https?://([^/?#]+)(/[^?#]*)?(\?[^#]*)?(#.*)?$',
    'i'
  );
  if v_parts is null then
    raise exception using errcode = '22023', message = 'The post URL must use HTTP or HTTPS.';
  end if;

  v_host := pg_catalog.lower(v_parts[1]);
  v_path := coalesce(v_parts[2], '/');
  v_query := coalesce(v_parts[3], '');

  -- Reject credentials, ports, local hosts, IP literals and malformed hostnames.
  if v_host !~ '^[a-z0-9.-]+$'
     or v_host !~ '\.'
     or v_host ~ '^[0-9.]+$'
     or v_host ~ '(^\.|\.$|\.\.|-\.)'
     or v_host = 'localhost'
     or v_host like '%.localhost'
     or v_host like '%.local'
     or v_host like '%.internal' then
    raise exception using errcode = '22023', message = 'Enter a public website URL, not a local or private address.';
  end if;

  if v_platform = 'instagram' and not (
    (v_host = 'instagram.com' or v_host like '%.instagram.com')
    and v_path ~* '^/(p|reel|reels|stories)/[^/]+'
  ) then
    raise exception using errcode = '22023', message = 'Use a direct Instagram post, reel or story link.';
  elsif v_platform = 'tiktok' and not (
    (v_host = 'tiktok.com' or v_host like '%.tiktok.com')
    and (
      v_path ~* '^/@[^/]+/(video|photo)/[0-9]+'
      or (
        v_host in ('vm.tiktok.com', 'vt.tiktok.com')
        and v_path ~ '^/[A-Za-z0-9_-]+/?$'
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'Use a direct TikTok video or photo link.';
  elsif v_platform = 'youtube' and not (
    (
      v_host = 'youtu.be'
      or v_host like '%.youtu.be'
      or v_host = 'youtube.com'
      or v_host like '%.youtube.com'
    )
    and (
      (v_host like '%youtu.be' and v_path ~ '^/[A-Za-z0-9_-]{6,}/?$')
      or v_path ~* '^/(shorts|embed)/[A-Za-z0-9_-]{6,}/?$'
      or (v_path ~* '^/watch/?$' and v_query ~* '(^\?|&)v=[A-Za-z0-9_-]{6,}')
    )
  ) then
    raise exception using errcode = '22023', message = 'Use a direct YouTube video, Short or youtu.be link.';
  elsif v_platform = 'facebook' and not (
    (
      v_host = 'facebook.com'
      or v_host like '%.facebook.com'
      or v_host = 'fb.watch'
      or v_host like '%.fb.watch'
    )
    and (
      v_path ~* '^/(reel|reels|videos|share/(r|v))/[^/]+'
      or v_path ~* '^/[^/]+/posts/[^/]+'
      or (v_path ~* '^/watch/?$' and v_query ~* '(^\?|&)v=[A-Za-z0-9_-]+')
      or (
        (v_host = 'fb.watch' or v_host like '%.fb.watch')
        and v_path ~ '^/[A-Za-z0-9_-]+/?$'
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'Use a direct Facebook post, reel or video link.';
  elsif v_platform = 'x' and not (
    (v_host = 'x.com' or v_host like '%.x.com' or v_host = 'twitter.com' or v_host like '%.twitter.com')
    and v_path ~* '^/[^/]+/status/[0-9]+/?$'
  ) then
    raise exception using errcode = '22023', message = 'Use a direct X/Twitter post link containing /status/.';
  elsif v_platform = 'linkedin' and not (
    (v_host = 'linkedin.com' or v_host like '%.linkedin.com')
    and v_path ~* '^/(posts|feed/update|pulse)/[^/]+'
  ) then
    raise exception using errcode = '22023', message = 'Use a direct LinkedIn post link.';
  elsif v_platform = 'snapchat' and not (
    (v_host = 'snapchat.com' or v_host like '%.snapchat.com')
    and v_path ~* '^/(spotlight|story)/[^/]+'
  ) then
    raise exception using errcode = '22023', message = 'Use a public Snapchat Spotlight or story link.';
  elsif v_platform = 'other' and v_path = '/' then
    raise exception using errcode = '22023', message = 'Enter a direct public post link, not only a website homepage.';
  end if;

  if v_note is not null and pg_catalog.length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'The extra note must be 500 characters or fewer.';
  end if;

  -- Serialize submissions per creator so duplicate and rate-limit checks cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_creator_id::text, 0));

  if exists (
    select 1
      from public.creator_verification_submissions s
     where s.creator_id = v_creator_id
       and s.status = 'pending'
       and s.post_url = v_url
  ) then
    raise exception using errcode = 'P0001', message = 'This post is already awaiting review.';
  end if;

  select pg_catalog.count(*)
    into v_recent_count
    from public.creator_verification_submissions s
   where s.creator_id = v_creator_id
     and s.created_at >= pg_catalog.now() - interval '24 hours';

  if v_recent_count >= 5 then
    raise exception using errcode = 'P0001', message = 'You have reached the verification submission limit. Please wait for your existing posts to be reviewed.';
  end if;

  insert into public.creator_verification_submissions (
    creator_id,
    platform,
    post_type,
    post_url,
    note,
    status
  )
  values (
    v_creator_id,
    v_platform,
    v_post_type,
    v_url,
    v_note,
    'pending'
  )
  returning id into v_submission_id;

  insert into public.notifications (user_id, title, body, kind, link)
  select
    p.id,
    'Creator verification post submitted',
    'A creator has submitted an AdBridge promotional post for review.',
    'creator_verification_review',
    '/admin/verification'
  from public.profiles p
  where p.role = 'admin';

  return pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'status', 'pending'
  );
end;
$function$;

create or replace function public.review_creator_verification(
  p_submission_id uuid,
  p_status text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_creator_id uuid;
  v_current_status text;
  v_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_admin_note, '')), '');
  v_title text;
  v_body text;
begin
  if v_admin_id is null then
    raise exception using errcode = '28000', message = 'Sign in as an administrator to review verification posts.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_admin_id
       and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access required.';
  end if;

  if p_submission_id is null or v_status not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Choose a valid verification submission and review decision.';
  end if;

  if v_note is not null and pg_catalog.length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'The review note must be 500 characters or fewer.';
  end if;

  select s.creator_id, s.status
    into v_creator_id, v_current_status
    from public.creator_verification_submissions s
   where s.id = p_submission_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Verification submission not found.';
  end if;

  if v_current_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'This verification submission has already been reviewed.';
  end if;

  update public.creator_verification_submissions
     set status = v_status,
         admin_note = v_note,
         reviewed_by = v_admin_id,
         reviewed_at = pg_catalog.now()
   where id = p_submission_id;

  update public.profiles
     set verified = (v_status = 'approved')
   where id = v_creator_id;

  if v_status = 'approved' then
    v_title := 'Creator listing verified';
    v_body := 'Your AdBridge promotional post was approved. Your creator listing is now verified.';
  else
    v_title := 'Creator verification needs attention';
    v_body := 'Your AdBridge promotional post was not approved. '
      || coalesce(v_note, 'Please review the requirements and submit a new public post.');
  end if;

  insert into public.notifications (user_id, title, body, kind, link)
  values (
    v_creator_id,
    v_title,
    v_body,
    'creator_verification',
    '/creator/verification'
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'creator_id', v_creator_id,
    'status', v_status
  );
end;
$function$;

revoke all on function public.submit_creator_verification(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_creator_verification(text, text, text, text) to authenticated;

revoke all on function public.review_creator_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_creator_verification(uuid, text, text) to authenticated;
