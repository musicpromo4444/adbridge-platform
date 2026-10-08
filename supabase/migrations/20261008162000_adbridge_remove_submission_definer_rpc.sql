alter function public.mark_creator_campaign_submitted(uuid) security invoker;
revoke all on function public.mark_creator_campaign_submitted(uuid) from public;
grant execute on function public.mark_creator_campaign_submitted(uuid) to authenticated;
create policy "creator_campaigns submit own job" on public.creator_campaigns for update to authenticated
using (creator_id=(select auth.uid()) and status in ('accepted','in_progress','changes_requested'))
with check (creator_id=(select auth.uid()) and status='submitted');
drop policy if exists "creator tracking link insert" on public.tracking_links;
