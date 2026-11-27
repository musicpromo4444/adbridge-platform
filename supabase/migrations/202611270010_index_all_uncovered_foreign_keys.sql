-- Cover all foreign keys reported by the Supabase performance advisor.
create index if not exists creator_withdrawal_payment_evidence_uploaded_by_idx on private.creator_withdrawal_payment_evidence(uploaded_by);
create index if not exists creator_withdrawal_payment_evidence_withdrawal_id_idx on private.creator_withdrawal_payment_evidence(withdrawal_id);
create index if not exists ad_placement_events_campaign_id_idx on public.ad_placement_events(campaign_id);
create index if not exists ad_placement_events_publisher_id_idx on public.ad_placement_events(publisher_id);
create index if not exists creator_placement_jobs_campaign_asset_id_idx on public.creator_placement_jobs(campaign_asset_id);
create index if not exists creator_verification_submissions_reviewed_by_idx on public.creator_verification_submissions(reviewed_by);
create index if not exists creator_withdrawal_events_actor_id_idx on public.creator_withdrawal_events(actor_id);
create index if not exists creator_withdrawal_notifications_withdrawal_id_idx on public.creator_withdrawal_notifications(withdrawal_id);
create index if not exists creator_withdrawals_paid_by_idx on public.creator_withdrawals(paid_by);
create index if not exists platform_payout_settings_updated_by_idx on public.platform_payout_settings(updated_by);
create index if not exists publisher_campaigns_selected_property_id_idx on public.publisher_campaigns(selected_property_id);
create index if not exists publisher_tracking_secrets_publisher_id_idx on public.publisher_tracking_secrets(publisher_id);
