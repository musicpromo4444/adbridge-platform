CREATE OR REPLACE FUNCTION public.notify_advertiser_campaign_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.status is distinct from old.status and new.status in ('active','paused','completed','closed') then
  insert into public.notifications(user_id,title,body,kind,link)
  values(new.advertiser_id,case new.status when 'active' then 'Campaign is live' when 'paused' then 'Campaign paused' when 'completed' then 'Campaign completed' else 'Campaign closed' end,
  'Your campaign "'||new.name||'" is now '||new.status||'. View campaign delivery and verified results for details.','campaign_status','/advertiser/campaigns');
 end if;return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.notify_advertiser_funding_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns%rowtype;
begin
 if new.type='funding' and new.status in ('held','released','rejected') and (tg_op='INSERT' or new.status is distinct from old.status) then
  select * into v_campaign from public.campaigns where id=new.campaign_id;
  if v_campaign.advertiser_id is not null then
   insert into public.notifications(user_id,title,body,kind,link)
   values(v_campaign.advertiser_id,case new.status when 'released' then 'Campaign funding confirmed' when 'held' then 'Campaign funding received' else 'Funding payment declined' end,
   case new.status when 'released' then 'Funding of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' for "'||v_campaign.name||'" is confirmed.' when 'held' then 'Funding of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' for "'||v_campaign.name||'" is being held for confirmation.' else 'Funding for "'||v_campaign.name||'" was not confirmed. Review billing and retry.' end,
   'campaign_funding','/advertiser/billing');
  end if;
 end if;return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.notify_creator_cpm_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign_name text;
begin
 if new.type='creator_payment' and new.status='released' and new.submission_id is not null then
  select c.name into v_campaign_name from public.campaigns c where c.id=new.campaign_id;
  insert into public.notifications(user_id,title,body,kind,link)
  values(new.creator_id,'Verified CPM earnings released','A verified CPM payout of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' for '||coalesce(v_campaign_name,'your campaign')||' has been released.','creator_earnings','/creator/earnings');
 end if;return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.notify_creator_submission_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign_name text;
begin
 if new.status is distinct from old.status and new.status in ('approved','changes_requested','rejected') then
  select name into v_campaign_name from public.campaigns where id=new.campaign_id;
  insert into public.notifications(user_id,title,body,kind,link)
  values(new.creator_id,case when new.status='approved' then 'Campaign submission approved' else 'Changes requested for your submission' end,
  case when new.status='approved' then 'Your work for '||coalesce(v_campaign_name,'the campaign')||' was approved. Check your earnings and campaign status.' else 'AdBridge requested updates to your submission for '||coalesce(v_campaign_name,'the campaign')||'. Open the work page to review the feedback.' end,
  'submission_review','/creator/work');
 end if;return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.notify_creator_withdrawal_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.status is distinct from old.status and new.status in ('paid','rejected','approved') then
  insert into public.notifications(user_id,title,body,kind,link)
  values(new.creator_id,case new.status when 'paid' then 'Withdrawal paid' when 'approved' then 'Withdrawal approved' else 'Withdrawal request declined' end,
  case new.status when 'paid' then 'Your withdrawal of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' has been paid.' when 'approved' then 'Your withdrawal request of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' has been approved and is being processed.' else 'Your withdrawal request of ₦'||to_char(new.amount,'FM999,999,999,990.00')||' was declined. Review the payment note for details.' end,
  'withdrawal','/creator/earnings');
 end if;return new;
end;$function$;


CREATE OR REPLACE FUNCTION public.notify_publisher_application_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign_name text;
begin
 if new.status is distinct from old.status and new.status in ('approved','rejected') then
  select name into v_campaign_name from public.campaigns where id=new.campaign_id;
  insert into public.notifications(user_id,title,body,kind,link)
  values(new.publisher_id,case when new.status='approved' then 'Publisher placement approved' else 'Publisher application declined' end,
  case when new.status='approved' then 'Your publisher property is approved for campaign: '||coalesce(v_campaign_name,'AdBridge campaign')||'.' else 'Your publisher application was not approved for: '||coalesce(v_campaign_name,'AdBridge campaign')||'. Check the campaign requirements and apply to another compatible opportunity.' end,
  'publisher_application','/publisher/applications');
 end if;return new;
end;$function$;


DROP TRIGGER IF EXISTS advertiser_campaign_notify_status ON public.campaigns;
CREATE TRIGGER advertiser_campaign_notify_status AFTER UPDATE OF status ON public.campaigns FOR EACH ROW EXECUTE FUNCTION notify_advertiser_campaign_status();

DROP TRIGGER IF EXISTS advertiser_funding_notify_status ON public.campaign_payments;
CREATE TRIGGER advertiser_funding_notify_status AFTER INSERT OR UPDATE OF status ON public.campaign_payments FOR EACH ROW EXECUTE FUNCTION notify_advertiser_funding_status();

DROP TRIGGER IF EXISTS creator_cpm_payment_notify ON public.campaign_payments;
CREATE TRIGGER creator_cpm_payment_notify AFTER INSERT ON public.campaign_payments FOR EACH ROW EXECUTE FUNCTION notify_creator_cpm_payment();

DROP TRIGGER IF EXISTS creator_submission_notify_status ON public.submissions;
CREATE TRIGGER creator_submission_notify_status AFTER UPDATE OF status ON public.submissions FOR EACH ROW EXECUTE FUNCTION notify_creator_submission_review();

DROP TRIGGER IF EXISTS creator_withdrawal_notify_status ON public.creator_withdrawals;
CREATE TRIGGER creator_withdrawal_notify_status AFTER UPDATE OF status ON public.creator_withdrawals FOR EACH ROW EXECUTE FUNCTION notify_creator_withdrawal_status();

DROP TRIGGER IF EXISTS publisher_application_notify_status ON public.publisher_campaigns;
CREATE TRIGGER publisher_application_notify_status AFTER UPDATE OF status ON public.publisher_campaigns FOR EACH ROW EXECUTE FUNCTION notify_publisher_application_decision();
-- Enable private per-user notification realtime updates.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
