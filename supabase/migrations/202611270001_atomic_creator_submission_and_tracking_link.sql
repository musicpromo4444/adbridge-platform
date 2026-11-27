-- Atomic creator submission + advertiser-bound tracking link workflow
-- Submission, tracking link, and creator job status move together or roll back.
create or replace function public.submit_creator_campaign_work(
  p_job_id uuid,
  p_posted_url text,
  p_tracking_platform text,
  p_note text default null,
  p_evidence text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.creator_campaigns%rowtype;
  v_campaign public.campaigns%rowtype;
  v_submission_id uuid;
  v_slug text;
  v_target_metric integer;
  v_special boolean;
  v_tracking_needed boolean;
  v_destination text;
  v_final_note text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_posted_url is null or length(trim(p_posted_url)) > 2048 or trim(p_posted_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'A valid public post URL is required' using errcode='22023';
  end if;
  if p_tracking_platform is null or p_tracking_platform not in ('tiktok','instagram reels','instagram','youtube','youtube shorts','facebook','facebook reels','x','snapchat') then
    raise exception 'Unsupported posting platform' using errcode='22023';
  end if;

  select * into v_job from public.creator_campaigns
   where id=p_job_id and creator_id=v_user for update;
  if not found or v_job.status not in ('accepted','in_progress','changes_requested') then
    raise exception 'Campaign job is not eligible for submission' using errcode='22023';
  end if;

  select * into v_campaign from public.campaigns
   where id=v_job.campaign_id for update;
  if not found or v_campaign.status not in ('active','funded') then
    raise exception 'Campaign is not active or funded' using errcode='55000';
  end if;
  if exists(select 1 from public.submissions where creator_campaign_id=v_job.id and status in ('waiting','approved','completed')) then
    raise exception 'This job already has a submitted item' using errcode='23505';
  end if;

  v_special := v_campaign.payment_method in ('product_placement','brand_mention','partnership','job','placement');
  v_final_note := case when v_special then concat_ws(E'\n',nullif(trim(p_note),''),case when nullif(trim(p_evidence),'') is not null then 'Proof/evidence: '||trim(p_evidence) end) else nullif(trim(p_note),'') end;
  v_target_metric := case when lower(v_campaign.payment_method) in ('cpm','views') then coalesce(v_campaign.desired_results,0) else null end;

  insert into public.submissions(campaign_id,creator_id,creator_campaign_id,posted_url,note,status,tracking_platform,target_metric,current_metric,metric_status)
  values(v_campaign.id,v_user,v_job.id,trim(p_posted_url),v_final_note,'waiting',lower(trim(p_tracking_platform)),v_target_metric,0,case when v_target_metric is not null and v_target_metric>0 then 'pending' else 'not_required' end)
  returning id into v_submission_id;

  v_tracking_needed := v_campaign.payment_method in ('cpc','link_traffic','cpi','cpa');
  if v_tracking_needed then
    select target_url into v_destination from public.campaign_destination_urls
     where campaign_id=v_campaign.id order by created_at asc limit 1;
    if v_destination is null or v_destination !~* '^https?://[^[:space:]]+$' then
      raise exception 'Advertiser destination URL is missing or invalid; submission cancelled' using errcode='22023';
    end if;
    v_slug := 'c_' || encode(gen_random_bytes(10),'hex');
    insert into public.tracking_links(campaign_id,creator_id,submission_id,slug,target_url)
    values(v_campaign.id,v_user,v_submission_id,v_slug,v_destination);
  end if;

  update public.creator_campaigns set status='submitted'
   where id=v_job.id and creator_id=v_user;

  return jsonb_build_object('submission_id',v_submission_id,'tracking_slug',v_slug,'tracking_required',v_tracking_needed,'job_status','submitted');
end;
$$;

revoke all on function public.submit_creator_campaign_work(uuid,text,text,text,text) from public, anon;
grant execute on function public.submit_creator_campaign_work(uuid,text,text,text,text) to authenticated;
