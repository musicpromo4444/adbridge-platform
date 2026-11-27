-- Repair the legacy per-submission metric cron job.
-- The edge function now accepts a dedicated private scheduler secret rather
-- than requiring a user JWT or exposing the service-role key to pg_cron.
do $migration$
declare
  v_job_id bigint;
  v_secret text;
begin
  select secret_value into v_secret
  from public.adbridge_service_secrets
  where key_name = 'metrics_scheduler';

  if v_secret is null or length(v_secret) < 32 then
    raise exception 'AdBridge metrics scheduler secret is missing or too short';
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'adbridge-video-metric-refresh'
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      command := $command$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='adbridge_project_url') || '/functions/v1/track-video-metrics',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-adbridge-cron-secret',(select secret_value from public.adbridge_service_secrets where key_name='metrics_scheduler')
          ),
          body := jsonb_build_object('submission_id', s.id)
        ) as request_id
        from public.submissions s
        where s.metric_status in ('pending','tracking')
          and s.posted_url is not null
          and s.tracking_platform in ('youtube','tiktok','x','instagram','facebook')
          and (s.last_metric_check_at is null or s.last_metric_check_at < now() - interval '10 minutes')
        limit 50;
      $command$
    );
  end if;
end
$migration$;
