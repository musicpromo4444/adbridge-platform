drop policy if exists "tracking_links creator insert" on public.tracking_links;
create policy "tracking_links creator insert" on public.tracking_links for insert to authenticated
with check (
 creator_id=(select auth.uid())
 and slug ~* '^c_[a-f0-9]{20}$'
 and click_count=0 and unique_click_count=0 and paid_clicks=0
 and target_url ~* '^https?://'
 and exists(
  select 1 from public.submissions s join public.campaigns c on c.id=s.campaign_id
  join public.campaign_destination_urls d on d.campaign_id=c.id
  where s.id=tracking_links.submission_id and s.creator_id=(select auth.uid())
   and s.campaign_id=tracking_links.campaign_id and c.status in ('funded','active')
   and d.target_url=tracking_links.target_url
 )
);
