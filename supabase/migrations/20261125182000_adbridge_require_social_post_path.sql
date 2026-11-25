begin;

-- Exact official hosts are not enough: submissions must point to a post path,
-- not a platform homepage or query-only URL. Mirrors the browser validator.
create or replace function public.enforce_official_social_submission_host()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_host text;
  v_platform text;
  v_allowed boolean := false;
begin
  if new.posted_url is null or length(btrim(new.posted_url)) = 0 then
    raise exception 'a public social post URL is required'
      using errcode = '22023';
  end if;

  if new.posted_url !~* '^https://([a-z0-9.-]+)(/|[?#]|$)' then
    raise exception 'social post URL must be an HTTPS URL on an official platform host'
      using errcode = '22023';
  end if;

  -- Require at least one non-empty path segment after the hostname.
  if new.posted_url !~* '^https://[a-z0-9.-]+/[^/?#]+' then
    raise exception 'social post URL must include a post path, not a homepage'
      using errcode = '22023';
  end if;

  v_host := lower(substring(new.posted_url from '^https://([a-z0-9.-]+)'));
  if left(v_host, 4) = 'www.' then
    v_host := substr(v_host, 5);
  end if;
  v_platform := lower(btrim(coalesce(new.tracking_platform, '')));

  v_allowed := case v_platform
    when 'tiktok' then v_host = 'tiktok.com'
    when 'instagram' then v_host = 'instagram.com'
    when 'instagram reels' then v_host = 'instagram.com'
    when 'youtube' then v_host in ('youtube.com', 'youtu.be')
    when 'youtube shorts' then v_host in ('youtube.com', 'youtu.be')
    when 'facebook' then v_host = 'facebook.com'
    when 'facebook reels' then v_host = 'facebook.com'
    when 'x' then v_host in ('x.com', 'twitter.com')
    when 'snapchat' then v_host = 'snapchat.com'
    else false
  end;

  if not v_allowed then
    raise exception 'social post URL host does not match the selected platform'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_official_social_submission_host()
  from public, anon, authenticated, service_role;

drop trigger if exists submissions_official_social_host_guard on public.submissions;
create trigger submissions_official_social_host_guard
before insert or update of posted_url, tracking_platform
on public.submissions
for each row
execute function public.enforce_official_social_submission_host();

comment on function public.enforce_official_social_submission_host() is
  'Requires HTTPS exact official social host and non-root post path matching the selected platform.';

commit;
