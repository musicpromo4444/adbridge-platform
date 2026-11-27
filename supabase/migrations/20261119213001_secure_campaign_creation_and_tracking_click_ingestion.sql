drop policy if exists "campaigns advertiser insert" on public.campaigns;
create policy "campaigns advertiser insert" on public.campaigns for insert to authenticated
with check (
 advertiser_id=(select auth.uid())
 and (private.current_user_profile_role()='admin' or (
  private.current_user_profile_role()='advertiser'
  and coalesce((select allow_new_campaigns from public.platform_settings where id=1),true)
  and status='draft' and coalesce(funded_amount,0)=0
 ))
);
drop policy if exists "public can insert tracking clicks" on public.tracking_clicks;
revoke insert on table public.tracking_clicks from anon,authenticated;
create unique index if not exists tracking_links_campaign_creator_once on public.tracking_links(campaign_id,creator_id) where creator_id is not null;
drop policy if exists "tracking_links creator insert" on public.tracking_links;
create policy "tracking_links creator insert" on public.tracking_links for insert to authenticated
with check (
 creator_id=(select auth.uid())
 and exists(select 1 from public.submissions s join public.campaigns c on c.id=s.campaign_id
  where s.id=tracking_links.submission_id and s.creator_id=(select auth.uid())
   and s.campaign_id=tracking_links.campaign_id and c.status in ('funded','active'))
);
