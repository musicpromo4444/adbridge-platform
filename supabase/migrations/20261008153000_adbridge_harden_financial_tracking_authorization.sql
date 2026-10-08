-- Applied to AdBridge Supabase project: wilfmtzxxnkdcyiozamq
-- Hardens financial mutation permissions, idempotency and tracking/conversion visibility.

create policy "admins update campaign payments"
on public.campaign_payments
for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins update creator withdrawals"
on public.creator_withdrawals
for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create unique index if not exists campaign_creator_payment_once
on public.campaign_payments (submission_id)
where submission_id is not null and type = 'creator_payment';

create unique index if not exists cpa_conversion_events_campaign_external_once
on public.cpa_conversion_events (campaign_id, external_conversion_id);

create policy "participants read cpa conversion events"
on public.cpa_conversion_events
for select to authenticated
using (
  exists (select 1 from public.campaigns c where c.id = cpa_conversion_events.campaign_id and c.advertiser_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "participants read conversions"
on public.conversions
for select to authenticated
using (
  creator_id = auth.uid()
  or exists (select 1 from public.campaigns c where c.id = conversions.campaign_id and c.advertiser_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "admins read fraud flags"
on public.fraud_flags
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins update fraud flags"
on public.fraud_flags
for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "campaign owners read tracking events"
on public.tracking_events
for select to authenticated
using (
  exists (select 1 from public.campaigns c where c.id = tracking_events.campaign_id and c.advertiser_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
