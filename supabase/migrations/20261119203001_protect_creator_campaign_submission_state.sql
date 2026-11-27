create or replace function public.mark_creator_campaign_submitted(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(
   select 1 from public.creator_campaigns j
   where j.id=p_job_id and j.creator_id=uid and j.status in ('accepted','in_progress','changes_requested')
 ) then raise exception 'Campaign job is not eligible for submission'; end if;
 if not exists(
   select 1 from public.submissions s
   where s.creator_campaign_id=p_job_id and s.creator_id=uid and s.status='waiting'
 ) then raise exception 'No waiting submission found'; end if;
 update public.creator_campaigns set status='submitted' where id=p_job_id and creator_id=uid;
 return true;
end;
$function$;

-- Creators accept campaigns via the insert policy, but must not be able to
-- spoof job completion/status by directly updating the job row.
revoke update on table public.creator_campaigns from authenticated;
revoke all on function public.mark_creator_campaign_submitted(uuid) from public,anon;
grant execute on function public.mark_creator_campaign_submitted(uuid) to authenticated;
