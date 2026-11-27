-- Anonymous browser roles never need direct table or sequence access; public views are served through narrow RPCs/Edge Functions.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- These records are written only by trusted RPCs, triggers or Edge Functions.
do $$
declare t text;
begin
  foreach t in array array[
    'ad_placements','campaign_assets','campaign_delivery_options','campaign_destination_urls',
    'campaign_formats','campaign_platforms','campaign_tracking_rules','conversions',
    'creator_withdrawal_notifications','social_oauth_states','tracking_clicks','tracking_events'
  ] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;

-- Publisher applications remain insertable by publishers and reviewable by advertisers/admins,
-- but browser roles cannot delete or alter table structure/privileges.
revoke all on table public.publisher_campaigns from public,anon,authenticated;
grant select,insert,update on table public.publisher_campaigns to authenticated;