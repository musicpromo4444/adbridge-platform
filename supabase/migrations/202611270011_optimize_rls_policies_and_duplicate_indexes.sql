-- Avoid repeated auth.uid() evaluation in RLS policy expressions.
alter policy creator_withdrawal_notifications_read_own on public.creator_withdrawal_notifications using (user_id = (select auth.uid()));
alter policy creator_withdrawal_notifications_update_own on public.creator_withdrawal_notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy creator_verification_insert_own_pending on public.creator_verification_submissions with check (creator_id = (select auth.uid()) and private.current_user_profile_role() = 'creator' and status = 'pending' and post_url like 'https://%');
alter policy creator_verification_read_own_or_admin on public.creator_verification_submissions using (creator_id = (select auth.uid()) or private.current_user_profile_role() = 'admin');
alter policy notifications_read_own on public.notifications using (user_id = (select auth.uid()));
alter policy notifications_update_own on public.notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Consolidate overlapping SELECT policies while preserving public and admin access.
drop policy if exists "admin manage ad placements" on public.ad_placements;
drop policy if exists "public active ad placements read" on public.ad_placements;
create policy ad_placements_select_public_or_admin on public.ad_placements for select to anon, authenticated using (enabled = true or private.current_user_profile_role() = 'admin');
create policy ad_placements_admin_insert on public.ad_placements for insert to authenticated with check (private.current_user_profile_role() = 'admin');
create policy ad_placements_admin_update on public.ad_placements for update to authenticated using (private.current_user_profile_role() = 'admin') with check (private.current_user_profile_role() = 'admin');
create policy ad_placements_admin_delete on public.ad_placements for delete to authenticated using (private.current_user_profile_role() = 'admin');

drop policy if exists "admin manage integrations" on public.platform_integrations;
create policy platform_integrations_admin_insert on public.platform_integrations for insert to authenticated with check (private.current_user_profile_role() = 'admin');
create policy platform_integrations_admin_update on public.platform_integrations for update to authenticated using (private.current_user_profile_role() = 'admin') with check (private.current_user_profile_role() = 'admin');
create policy platform_integrations_admin_delete on public.platform_integrations for delete to authenticated using (private.current_user_profile_role() = 'admin');

drop policy if exists "admin manage platform settings" on public.platform_settings;
create policy platform_settings_admin_insert on public.platform_settings for insert to authenticated with check (private.current_user_profile_role() = 'admin');
create policy platform_settings_admin_update on public.platform_settings for update to authenticated using (private.current_user_profile_role() = 'admin') with check (private.current_user_profile_role() = 'admin');
create policy platform_settings_admin_delete on public.platform_settings for delete to authenticated using (private.current_user_profile_role() = 'admin');

drop policy if exists "publisher_channels admin read" on public.publisher_channels;
drop policy if exists publisher_channels_select_own on public.publisher_channels;
create policy publisher_channels_select_admin_or_own on public.publisher_channels for select to authenticated using (private.current_user_profile_role() = 'admin' or publisher_id = (select auth.uid()));

drop policy if exists "publisher_properties admin read" on public.publisher_properties;
drop policy if exists "publisher_properties owner read" on public.publisher_properties;
create policy publisher_properties_select_admin_or_own on public.publisher_properties for select to authenticated using (private.current_user_profile_role() = 'admin' or publisher_id = (select auth.uid()));

-- Remove duplicate indexes without dropping constraint-backed uniqueness.
drop index if exists public.ad_placement_events_placement_time_idx;
drop index if exists public.campaign_destination_urls_one_per_campaign;
drop index if exists public.submission_metrics_submission_time_idx;
