CREATE OR REPLACE FUNCTION public.get_campaign_measurement_summary(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_campaign public.campaigns%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_campaign from public.campaigns where id=p_campaign_id;if not found then raise exception 'campaign not found' using errcode='P0002';end if;
 if private.current_user_profile_role()<>'admin' and v_campaign.advertiser_id<>auth.uid() then raise exception 'advertiser access required' using errcode='42501';end if;
 select jsonb_build_object(
 'campaign_id',c.id,'campaign_name',c.name,'status',c.status,'billing_model',c.payment_method,'payment_rate',c.payment_rate,
 'submission_count',(select count(*) from public.submissions s where s.campaign_id=c.id),
 'verified_submissions',(select count(*) from public.submissions s where s.campaign_id=c.id and s.metric_status='verified'),
 'verified_views',(select coalesce(sum(v.views),0) from (select coalesce(external_video_id,id::text) video_key,max(current_metric) views from public.submissions where campaign_id=c.id and metric_status='verified' group by 1) v),
 'metric_checks',(select count(*) from public.submission_metrics sm join public.submissions s on s.id=sm.submission_id where s.campaign_id=c.id),
 'metric_review',(select count(*) from public.adbridge_event_assessments a where a.source_table='submission_metrics' and a.campaign_id=c.id and a.risk_status in ('review','blocked')),
 'last_metric_check_at',(select max(last_metric_check_at) from public.submissions s where s.campaign_id=c.id),
 'clicks_raw',(select coalesce(sum(click_count),0) from public.tracking_links tl where tl.campaign_id=c.id),
 'unique_clicks_raw',(select coalesce(sum(unique_click_count),0) from public.tracking_links tl where tl.campaign_id=c.id),
 'click_events',(select count(*) from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id where tl.campaign_id=c.id),
 'clicks_verified',(select count(*) from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id join public.adbridge_event_assessments a on a.source_table='tracking_clicks' and a.source_row_id=tc.id and a.verified=true and a.risk_status='low' where tl.campaign_id=c.id),
 'clicks_review',(select count(*) from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id join public.adbridge_event_assessments a on a.source_table='tracking_clicks' and a.source_row_id=tc.id and a.risk_status='review' where tl.campaign_id=c.id),
 'clicks_blocked',(select count(*) from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id join public.adbridge_event_assessments a on a.source_table='tracking_clicks' and a.source_row_id=tc.id and a.risk_status='blocked' where tl.campaign_id=c.id),
 'conversions_raw',(select count(*) from public.cpa_conversion_events ce where ce.campaign_id=c.id and ce.status='approved'),
 'conversions_verified',(select count(*) from public.cpa_conversion_events ce join public.adbridge_event_assessments a on a.source_table='cpa_conversion_events' and a.source_row_id=ce.id and a.verified=true and a.risk_status='low' where ce.campaign_id=c.id and ce.status='approved'),
 'conversions_review',(select count(*) from public.cpa_conversion_events ce join public.adbridge_event_assessments a on a.source_table='cpa_conversion_events' and a.source_row_id=ce.id and a.risk_status='review' where ce.campaign_id=c.id and ce.status='approved'),
 'conversions_blocked',(select count(*) from public.cpa_conversion_events ce join public.adbridge_event_assessments a on a.source_table='cpa_conversion_events' and a.source_row_id=ce.id and a.risk_status='blocked' where ce.campaign_id=c.id and ce.status='approved'),
 'publisher_events_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id),
 'publisher_events_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id),
 'publisher_events_review',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.risk_status='review' where e.campaign_id=c.id),
 'publisher_events_blocked',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.risk_status='blocked' where e.campaign_id=c.id),
 'publisher_impressions_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id and e.event_type='impression'),
 'publisher_impressions_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id and e.event_type='impression'),
 'publisher_video_views_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id and e.event_type='video_view'),
 'publisher_video_views_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id and e.event_type='video_view'),
 'publisher_clicks_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id and e.event_type='click'),
 'publisher_clicks_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id and e.event_type='click'),
 'publisher_installs_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id and e.event_type='install'),
 'publisher_installs_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id and e.event_type='install'),
 'publisher_conversions_raw',(select count(*) from public.ad_placement_events e where e.campaign_id=c.id and e.event_type='conversion'),
 'publisher_conversions_verified',(select count(*) from public.ad_placement_events e join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id and a.verified=true and a.risk_status='low' where e.campaign_id=c.id and e.event_type='conversion'),
 'confirmed_funding',(select coalesce(sum(amount),0) from public.campaign_payments p where p.campaign_id=c.id and p.type='funding' and p.status in ('held','released')),
 'payouts_released',(select coalesce(sum(amount),0) from public.campaign_payments p where p.campaign_id=c.id and p.type='creator_payment' and p.status='released'),
 'payouts_held',(select coalesce(sum(amount),0) from public.campaign_payments p where p.campaign_id=c.id and p.type='creator_payment' and p.status in ('pending','held')),
 'open_fraud_flags',(select count(*) from public.fraud_flags f where f.campaign_id=c.id and f.status in ('open','reviewing')),
 'events_assessed_24h',(select count(*) from public.adbridge_event_assessments a where a.campaign_id=c.id and a.created_at>=now()-interval '24 hours')
 ) into v_result from public.campaigns c where c.id=p_campaign_id;
 return v_result;
end;$function$;


CREATE OR REPLACE FUNCTION public.get_advertiser_measurement_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 if private.current_user_profile_role() not in ('advertiser','admin') then raise exception 'advertiser access required' using errcode='42501';end if;
 select coalesce(jsonb_agg(public.get_campaign_measurement_summary(c.id) order by c.created_at desc),'[]'::jsonb) into v_result from public.campaigns c where private.current_user_profile_role()='admin' or c.advertiser_id=auth.uid();
 return v_result;
end;$function$;


CREATE OR REPLACE FUNCTION public.get_creator_measurement_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_user uuid:=auth.uid();v_views bigint:=0;v_jobs bigint:=0;v_clicks_raw bigint:=0;v_unique_raw bigint:=0;v_clicks_verified bigint:=0;v_clicks_review bigint:=0;v_clicks_blocked bigint:=0;v_conversions_raw bigint:=0;v_conversions_verified bigint:=0;v_conversions_review bigint:=0;v_conversions_blocked bigint:=0;v_publisher_events_raw bigint:=0;v_publisher_events_verified bigint:=0;v_publisher_events_review bigint:=0;v_publisher_events_blocked bigint:=0;v_released numeric:=0;v_held numeric:=0;v_open_flags bigint:=0;v_metric_review bigint:=0;
begin
 if v_user is null then raise exception 'authentication required' using errcode='42501';end if;
 if private.current_user_profile_role() not in ('creator','publisher') then raise exception 'creator or publisher access required' using errcode='42501';end if;
 select count(distinct campaign_id) into v_jobs from public.creator_campaigns where creator_id=v_user;
 select coalesce(sum(views),0) into v_views from (select coalesce(external_video_id,id::text) video_key,max(current_metric) views from public.submissions where creator_id=v_user and metric_status='verified' group by 1) deduped;
 select coalesce(sum(click_count),0),coalesce(sum(unique_click_count),0) into v_clicks_raw,v_unique_raw from public.tracking_links where creator_id=v_user;
 select count(*) filter(where a.verified and a.risk_status='low'),count(*) filter(where a.risk_status='review'),count(*) filter(where a.risk_status='blocked')
 into v_clicks_verified,v_clicks_review,v_clicks_blocked from public.tracking_clicks tc join public.tracking_links tl on tl.id=tc.tracking_link_id left join public.adbridge_event_assessments a on a.source_table='tracking_clicks' and a.source_row_id=tc.id where tl.creator_id=v_user;
 select count(*) into v_conversions_raw from public.cpa_conversion_events where creator_id=v_user and status='approved';
 select count(*) filter(where a.verified and a.risk_status='low'),count(*) filter(where a.risk_status='review'),count(*) filter(where a.risk_status='blocked')
 into v_conversions_verified,v_conversions_review,v_conversions_blocked from public.cpa_conversion_events ce left join public.adbridge_event_assessments a on a.source_table='cpa_conversion_events' and a.source_row_id=ce.id where ce.creator_id=v_user and ce.status='approved';
 select count(*),count(*) filter(where a.verified and a.risk_status='low'),count(*) filter(where a.risk_status='review'),count(*) filter(where a.risk_status='blocked')
 into v_publisher_events_raw,v_publisher_events_verified,v_publisher_events_review,v_publisher_events_blocked from public.ad_placement_events e left join public.adbridge_event_assessments a on a.source_table='ad_placement_events' and a.source_row_id=e.id where e.publisher_id=v_user;
 select coalesce(sum(amount),0) into v_released from public.campaign_payments where creator_id=v_user and type='creator_payment' and status='released';
 select coalesce(sum(amount),0) into v_held from public.campaign_payments where creator_id=v_user and type='creator_payment' and status in ('pending','held');
 select count(*) into v_open_flags from public.fraud_flags where creator_id=v_user and status in ('open','reviewing');
 select count(*) into v_metric_review from public.submissions where creator_id=v_user and metric_status='review';
 return jsonb_build_object('campaigns_joined',v_jobs,'verified_views',v_views,'clicks_raw',v_clicks_raw,'unique_clicks_raw',v_unique_raw,'clicks_verified',v_clicks_verified,'clicks_review',v_clicks_review,'clicks_blocked',v_clicks_blocked,'conversions_raw',v_conversions_raw,'conversions_verified',v_conversions_verified,'conversions_review',v_conversions_review,'conversions_blocked',v_conversions_blocked,'publisher_events_raw',v_publisher_events_raw,'publisher_events_verified',v_publisher_events_verified,'publisher_events_review',v_publisher_events_review,'publisher_events_blocked',v_publisher_events_blocked,'released_earnings',v_released,'held_earnings',v_held,'open_fraud_flags',v_open_flags,'metric_review',v_metric_review);
end;$function$;
