begin;

-- Creator-facing status history for manual CPM evidence. The composite index
-- supports bounded keyset pagination without exposing reviewer identity.
create index if not exists metric_verifications_creator_history_idx
  on public.metric_verifications (submission_id, created_at desc, id desc);

create or replace function public.get_creator_metric_review_history(
  p_submission_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_page_size integer default 10
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
      and p.role = 'creator'
  ) then
    raise exception 'creator account required' using errcode = '42501';
  end if;

  if p_submission_id is null
     or p_page_size is null
     or p_page_size < 1
     or p_page_size > 20 then
    raise exception 'submission and page size between 1 and 20 are required'
      using errcode = '22023';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both pagination cursor fields are required together'
      using errcode = '22023';
  end if;

  -- Do not reveal whether another creator's submission exists.
  if not exists (
    select 1
    from public.submissions s
    where s.id = p_submission_id
      and s.creator_id = (select auth.uid())
  ) then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  with page as materialized (
    select
      mv.id,
      mv.claimed_metric::text as claimed_metric,
      s.target_metric::text as target_metric,
      mv.evidence_url,
      mv.note as creator_note,
      mv.status,
      mv.review_note,
      mv.created_at,
      mv.reviewed_at
    from public.metric_verifications mv
    join public.submissions s on s.id = mv.submission_id
    where mv.submission_id = p_submission_id
      and s.creator_id = (select auth.uid())
      and (
        p_before_created_at is null
        or (mv.created_at, mv.id) < (p_before_created_at, p_before_id)
      )
    order by mv.created_at desc, mv.id desc
    limit (p_page_size + 1)
  ),
  visible as materialized (
    select *
    from page
    order by created_at desc, id desc
    limit p_page_size
  ),
  page_meta as (
    select pg_catalog.count(*) > p_page_size as has_more
    from page
  ),
  last_visible as (
    select created_at, id
    from visible
    order by created_at asc, id asc
    limit 1
  )
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', v.id,
            'claimed_metric', v.claimed_metric,
            'target_metric', v.target_metric,
            'evidence_url', v.evidence_url,
            'creator_note', v.creator_note,
            'status', v.status,
            'review_note', v.review_note,
            'created_at', v.created_at,
            'reviewed_at', v.reviewed_at
          )
          order by v.created_at desc, v.id desc
        )
        from visible v
      ),
      '[]'::jsonb
    ),
    'next_cursor', case
      when (select has_more from page_meta) then (
        select pg_catalog.jsonb_build_object(
          'created_at', lv.created_at,
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

revoke all on function public.get_creator_metric_review_history(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_creator_metric_review_history(uuid, timestamptz, uuid, integer)
  to authenticated;

comment on function public.get_creator_metric_review_history(uuid, timestamptz, uuid, integer) is
  'Creator-only, invoker-security keyset-paginated history of manual CPM evidence for the caller own submission. Returns no creator or reviewer identifiers and relies on existing RLS and column grants.';

commit;
