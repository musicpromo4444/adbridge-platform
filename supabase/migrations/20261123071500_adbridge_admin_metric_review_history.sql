begin;

-- Keep the administrator's decision history query efficient without granting
-- browser access to additional review columns or weakening existing RLS.
create index if not exists metric_verifications_review_history_idx
  on public.metric_verifications (reviewed_at desc, id desc)
  where status in ('approved', 'rejected') and reviewed_at is not null;

create or replace function public.get_admin_metric_review_history(
  p_before_reviewed_at timestamptz default null,
  p_before_id uuid default null,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  ) then
    raise exception 'administrator account required' using errcode = '42501';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'page size must be between 1 and 50' using errcode = '22023';
  end if;

  if (p_before_reviewed_at is null) <> (p_before_id is null) then
    raise exception 'both pagination cursor fields are required together' using errcode = '22023';
  end if;

  with page as materialized (
    select
      mv.id,
      coalesce(c.name, 'Campaign') as campaign_name,
      s.tracking_platform,
      mv.evidence_url,
      mv.claimed_metric::text as claimed_metric,
      s.target_metric::text as target_metric,
      coalesce(s.current_metric, 0)::text as current_metric,
      mv.note as creator_note,
      mv.review_note,
      mv.status,
      mv.created_at,
      mv.reviewed_at
    from public.metric_verifications mv
    join public.submissions s on s.id = mv.submission_id
    join public.campaigns c on c.id = s.campaign_id
    where mv.status in ('approved', 'rejected')
      and mv.reviewed_at is not null
      and (
        p_before_reviewed_at is null
        or (mv.reviewed_at, mv.id) < (p_before_reviewed_at, p_before_id)
      )
    order by mv.reviewed_at desc, mv.id desc
    limit (p_page_size + 1)
  ),
  visible as materialized (
    select *
    from page
    order by reviewed_at desc, id desc
    limit p_page_size
  ),
  page_meta as (
    select pg_catalog.count(*) > p_page_size as has_more
    from page
  ),
  last_visible as (
    select reviewed_at, id
    from visible
    order by reviewed_at asc, id asc
    limit 1
  )
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', v.id,
            'campaign_name', v.campaign_name,
            'tracking_platform', v.tracking_platform,
            'evidence_url', v.evidence_url,
            'claimed_metric', v.claimed_metric,
            'target_metric', v.target_metric,
            'current_metric', v.current_metric,
            'creator_note', v.creator_note,
            'review_note', v.review_note,
            'status', v.status,
            'created_at', v.created_at,
            'reviewed_at', v.reviewed_at
          )
          order by v.reviewed_at desc, v.id desc
        )
        from visible v
      ),
      '[]'::jsonb
    ),
    'next_cursor', case
      when (select has_more from page_meta) then (
        select pg_catalog.jsonb_build_object(
          'reviewed_at', lv.reviewed_at,
          'id', lv.id
        )
        from last_visible lv
      )
      else null
    end
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_admin_metric_review_history(timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_metric_review_history(timestamptz, uuid, integer)
  to authenticated;

comment on function public.get_admin_metric_review_history(timestamptz, uuid, integer) is
  'Administrator-only, invoker-security keyset-paginated history of manual CPM evidence decisions. Returns no creator or reviewer identifiers and relies on existing RLS.';

commit;
