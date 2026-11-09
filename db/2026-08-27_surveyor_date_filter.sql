-- ============================================================================
-- Date-aware surveyor ranking + per-surveyor drill-down.
-- Purely additive: CREATE OR REPLACE two functions. No table/row is touched,
-- and v_surveyor_stats is left in place for anything still reading it.
-- ============================================================================
BEGIN;

-- Ranking, restricted to a date range. Passing NULLs = all time (old behaviour).
-- "visited" is computed as a subset of "assigned" so it can never exceed it.
CREATE OR REPLACE FUNCTION public.get_surveyor_stats(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  survey_person_id uuid, survey_person_name text, zone text, district text,
  assigned_shops bigint, visited_shops bigint, surveys_done bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with scope as (
    select sp.id, sp.full_name, sp.zone, sp.district
    from profiles sp
    where sp.role = 'survey' and sp.is_active = true and (
      my_role() = 'super_admin'
      or (my_role() = 'supervisor' and sp.district = any(my_supervision_districts()))
      or (my_role() = 'dfc' and sp.district = my_district())
    )
  ),
  assigned as (
    select sc.id as sid, il.shopkeeper_id
    from scope sc
    join profiles sk on sk.zone = sc.zone and sk.district = sc.district and sk.role = 'shopkeeper'
    join issue_lines il on il.shopkeeper_id = sk.id and il.status = 'received'
    join issues i on i.id = il.issue_id
    where (p_from is null or i.issue_date >= p_from)
      and (p_to   is null or i.issue_date <= p_to)
    group by sc.id, il.shopkeeper_id
  ),
  surveyed as (
    select sc.id as sid, s.shopkeeper_id, count(*) as n
    from scope sc
    join surveys s on s.survey_person_id = sc.id
    join profiles sk on sk.id = s.shopkeeper_id
    where sk.zone = sc.zone and sk.district = sc.district
      and (p_from is null or (s.created_at at time zone 'Asia/Karachi')::date >= p_from)
      and (p_to   is null or (s.created_at at time zone 'Asia/Karachi')::date <= p_to)
    group by sc.id, s.shopkeeper_id
  )
  select
    sc.id, sc.full_name, sc.zone, sc.district,
    coalesce((select count(*) from assigned a where a.sid = sc.id), 0),
    coalesce((select count(*) from assigned a
              join surveyed sv on sv.sid = a.sid and sv.shopkeeper_id = a.shopkeeper_id
              where a.sid = sc.id), 0),
    coalesce((select sum(sv.n) from surveyed sv where sv.sid = sc.id), 0)
  from scope sc;
$function$;
GRANT EXECUTE ON FUNCTION public.get_surveyor_stats(date, date) TO authenticated;

-- Per-surveyor drill-down: every assigned shop in the window, with whether the
-- surveyor visited it and what they declared.
CREATE OR REPLACE FUNCTION public.get_surveyor_shops(
  p_surveyor uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  shopkeeper_id uuid, shopkeeper_name text, shop_name text, zone text,
  latitude numeric, longitude numeric,
  deliveries bigint, issued_bags bigint,
  visited boolean, surveys_count bigint, last_survey_at timestamptz,
  declared_bags bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with sp as (
    select p.id, p.zone, p.district
    from profiles p
    where p.id = p_surveyor and p.role = 'survey' and (
      my_role() = 'super_admin'
      or (my_role() = 'supervisor' and p.district = any(my_supervision_districts()))
      or (my_role() = 'dfc' and p.district = my_district())
    )
  ),
  assigned as (
    select sk.id as shopkeeper_id, sk.full_name, sk.shop_name, sk.zone,
           sk.latitude, sk.longitude,
           count(il.id) as deliveries,
           coalesce(sum(il.total_bags),0) as issued_bags
    from sp
    join profiles sk on sk.zone = sp.zone and sk.district = sp.district and sk.role = 'shopkeeper'
    join issue_lines il on il.shopkeeper_id = sk.id and il.status = 'received'
    join issues i on i.id = il.issue_id
    where (p_from is null or i.issue_date >= p_from)
      and (p_to   is null or i.issue_date <= p_to)
    group by sk.id, sk.full_name, sk.shop_name, sk.zone, sk.latitude, sk.longitude
  ),
  vis as (
    select s.shopkeeper_id, count(*) as n, max(s.created_at) as last_at,
           coalesce(sum(s.declared_bags_10 + s.declared_bags_15 + s.declared_bags_20),0) as declared
    from surveys s
    where s.survey_person_id = p_surveyor
      and (p_from is null or (s.created_at at time zone 'Asia/Karachi')::date >= p_from)
      and (p_to   is null or (s.created_at at time zone 'Asia/Karachi')::date <= p_to)
    group by s.shopkeeper_id
  )
  select a.shopkeeper_id, a.full_name, a.shop_name, a.zone, a.latitude, a.longitude,
         a.deliveries, a.issued_bags,
         (v.shopkeeper_id is not null) as visited,
         coalesce(v.n,0), v.last_at, coalesce(v.declared,0)
  from assigned a
  left join vis v on v.shopkeeper_id = a.shopkeeper_id
  order by (v.shopkeeper_id is not null), a.full_name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_surveyor_shops(uuid, date, date) TO authenticated;

COMMIT;
