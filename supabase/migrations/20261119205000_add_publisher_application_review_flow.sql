drop policy if exists "publisher_campaigns_select" on public.publisher_campaigns;
create policy "publisher_campaigns_select" on public.publisher_campaigns for select to authenticated
using (
 publisher_id=(select auth.uid())
 or exists(select 1 from public.campaigns c where c.id=publisher_campaigns.campaign_id and c.advertiser_id=(select auth.uid()))
 or private.current_user_profile_role()='admin'
);
create or replace function public.review_publisher_application(p_application_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_application public.publisher_campaigns%rowtype; v_campaign public.campaigns%rowtype; v_role text:=private.current_user_profile_role();
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_status not in ('approved','rejected','changes_requested') then raise exception 'invalid application decision' using errcode='22023'; end if;
 select * into v_application from public.publisher_campaigns where id=p_application_id for update;
 if not found then raise exception 'publisher application not found' using errcode='P0002'; end if;
 select * into v_campaign from public.campaigns where id=v_application.campaign_id;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 if v_role<>'admin' and not(v_role='advertiser' and v_campaign.advertiser_id=auth.uid()) then raise exception 'not authorized to review this application' using errcode='42501'; end if;
 if v_application.status<>'applied' then raise exception 'application is no longer awaiting review' using errcode='55000'; end if;
 update public.publisher_campaigns set status=p_status,approved_at=case when p_status='approved' then now() else approved_at end where id=p_application_id;
 return jsonb_build_object('ok',true,'application_id',p_application_id,'status',p_status);
end;
$$;
revoke all on function public.review_publisher_application(uuid,text) from public,anon;
grant execute on function public.review_publisher_application(uuid,text) to authenticated;
