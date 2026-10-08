drop policy if exists "submissions creator insert" on public.submissions;
create policy "submissions creator insert" on public.submissions for insert to authenticated with check (
 creator_id=(select auth.uid()) and status='waiting' and exists (
  select 1 from creator_campaigns j where j.id=creator_campaign_id and j.creator_id=(select auth.uid()) and j.campaign_id=submissions.campaign_id and j.status in ('accepted','in_progress','changes_requested')
 )
);
drop policy if exists "submissions participant update" on public.submissions;
drop policy if exists "tracking_links creator insert" on public.tracking_links;
create policy "tracking_links creator insert" on public.tracking_links for insert to authenticated with check (
 creator_id=(select auth.uid()) and exists (
  select 1 from submissions s where s.id=submission_id and s.creator_id=(select auth.uid()) and s.campaign_id=tracking_links.campaign_id
 )
);
create or replace function public.mark_creator_campaign_submitted(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from creator_campaigns j where j.id=p_job_id and j.creator_id=uid and j.status in ('accepted','in_progress','changes_requested')) then raise exception 'Campaign job is not eligible for submission'; end if;
 if not exists(select 1 from submissions s where s.creator_campaign_id=p_job_id and s.creator_id=uid and s.status='waiting') then raise exception 'No waiting submission found'; end if;
 update creator_campaigns set status='submitted' where id=p_job_id and creator_id=uid;
 return true;
end; $$;
revoke all on function public.mark_creator_campaign_submitted(uuid) from public;
grant execute on function public.mark_creator_campaign_submitted(uuid) to authenticated;
