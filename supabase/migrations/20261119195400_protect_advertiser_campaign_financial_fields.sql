-- Advertisers may edit campaign brief and commercial settings only while a campaign
-- is still an unfunded draft. Lifecycle and funding fields are controlled by
-- SECURITY DEFINER RPCs and trusted payment webhooks.
drop policy if exists "campaigns owner admin update" on public.campaigns;
create policy "campaigns owner admin update"
on public.campaigns
for update
to authenticated
using (
  (advertiser_id = (select auth.uid())
    and status = 'draft'
    and coalesce(funded_amount, 0) = 0)
  or exists (
    select 1 from public.profiles a
    where a.id = (select auth.uid()) and a.role = 'admin'
  )
)
with check (
  (advertiser_id = (select auth.uid())
    and status = 'draft'
    and coalesce(funded_amount, 0) = 0)
  or exists (
    select 1 from public.profiles a
    where a.id = (select auth.uid()) and a.role = 'admin'
  )
);

revoke update on table public.campaigns from authenticated;
grant update (
  name,
  goal,
  instructions,
  platform,
  payment_method,
  payment_rate,
  max_budget,
  desired_results,
  updated_at
) on public.campaigns to authenticated;

revoke all on function public.set_campaign_status(uuid, text) from public, anon;
grant execute on function public.set_campaign_status(uuid, text) to authenticated;
