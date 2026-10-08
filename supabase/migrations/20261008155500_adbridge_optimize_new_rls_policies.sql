drop index if exists public.cpa_conversion_events_campaign_external_once;

drop policy if exists "admins update campaign payments" on public.campaign_payments;
create policy "admins update campaign payments" on public.campaign_payments for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "admins update creator withdrawals" on public.creator_withdrawals;
create policy "admins update creator withdrawals" on public.creator_withdrawals for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "participants read cpa conversion events" on public.cpa_conversion_events;
create policy "participants read cpa conversion events" on public.cpa_conversion_events for select to authenticated
using (exists (select 1 from public.campaigns c where c.id=cpa_conversion_events.campaign_id and c.advertiser_id=(select auth.uid())) or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "participants read conversions" on public.conversions;
create policy "participants read conversions" on public.conversions for select to authenticated
using (creator_id=(select auth.uid()) or exists (select 1 from public.campaigns c where c.id=conversions.campaign_id and c.advertiser_id=(select auth.uid())) or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "admins read fraud flags" on public.fraud_flags;
create policy "admins read fraud flags" on public.fraud_flags for select to authenticated using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "admins update fraud flags" on public.fraud_flags;
create policy "admins update fraud flags" on public.fraud_flags for update to authenticated using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "campaign owners read tracking events" on public.tracking_events;
create policy "campaign owners read tracking events" on public.tracking_events for select to authenticated using (exists (select 1 from public.campaigns c where c.id=tracking_events.campaign_id and c.advertiser_id=(select auth.uid())) or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

drop policy if exists "campaigns advertiser insert" on public.campaigns;
create policy "campaigns advertiser insert" on public.campaigns for insert to authenticated
with check (
 advertiser_id=(select auth.uid()) and (
  exists (select 1 from public.profiles a where a.id=(select auth.uid()) and a.role='admin')
  or (exists (select 1 from public.profiles a where a.id=(select auth.uid()) and a.role='advertiser') and coalesce((select allow_new_campaigns from public.platform_settings where id=1),true))
 )
);

drop policy if exists "admins read ad placement events" on public.ad_placement_events;
create policy "admins read ad placement events" on public.ad_placement_events for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
