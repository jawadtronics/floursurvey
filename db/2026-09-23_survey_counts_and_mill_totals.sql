-- ============================================================================
-- 1. Surveyor ranking counts SURVEYS (delivery lines needing a visit), not shops.
-- 2. Per-mill Required Flour vs Flour Issued over a date range.
-- Additive: replaces two functions, adds one. No table or row is touched.
-- ============================================================================
BEGIN;

-- Ranking: assigned = delivery lines in the surveyor's zone that needed a
-- survey in the window; visited = those actually surveyed. Visited is computed
-- from the same set, so it can never exceed assigned.
DROP FUNCTION IF EXISTS public.get_surveyor_stats(date, date);
CREATE FUNCTION public.get_surveyor_stats(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  survey_person_id uuid, survey_person_name text, zone text, district text,
  assigned_surveys bigint, visited_surveys bigint, surveys_submitted bigint
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
  lines as (
    select sc.id as sid, il.id as line_id, il.surveyed_at
    from scope sc
    join profiles sk on sk.zone = sc.zone and sk.district = sc.district and sk.role = 'shopkeeper'
    join issue_lines il on il.shopkeeper_id = sk.id and il.status = 'received'
    join issues i on i.id = il.issue_id
    where (p_from is null or i.issue_date >= p_from)
      and (p_to   is null or i.issue_date <= p_to)
  )
  select sc.id, sc.full_name, sc.zone, sc.district,
    coalesce((select count(*) from lines l where l.sid = sc.id), 0),
    coalesce((select count(*) from lines l where l.sid = sc.id and l.surveyed_at is not null), 0),
    coalesce((select count(*) from surveys s
              where s.survey_person_id = sc.id
                and (p_from is null or (s.created_at at time zone 'Asia/Karachi')::date >= p_from)
                and (p_to   is null or (s.created_at at time zone 'Asia/Karachi')::date <= p_to)), 0)
  from scope sc;
$function$;
GRANT EXECUTE ON FUNCTION public.get_surveyor_stats(date, date) TO authenticated;

-- Drill-down: add how many of a shop's deliveries were surveyed.
DROP FUNCTION IF EXISTS public.get_surveyor_shops(uuid, date, date);
CREATE FUNCTION public.get_surveyor_shops(
  p_surveyor uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  shopkeeper_id uuid, shopkeeper_name text, shop_name text, zone text,
  latitude numeric, longitude numeric,
  deliveries bigint, surveyed_deliveries bigint, issued_bags bigint,
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
           count(il.id) filter (where il.surveyed_at is not null) as surveyed_deliveries,
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
         a.deliveries, a.surveyed_deliveries, a.issued_bags,
         (v.shopkeeper_id is not null) as visited,
         coalesce(v.n,0), v.last_at, coalesce(v.declared,0)
  from assigned a
  left join vis v on v.shopkeeper_id = a.shopkeeper_id
  order by (v.shopkeeper_id is not null), a.full_name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_surveyor_shops(uuid, date, date) TO authenticated;

-- Per-mill Required Flour vs Flour Issued across a date range (kg).
-- Required = 70% of the quota set for each day in range, in kg.
-- Issued    = 10kg and 20kg bags only, matching the Mill Quotas page.
CREATE OR REPLACE FUNCTION public.get_mill_quota_totals(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  mill_id uuid, mill_name text, district text,
  required_flour bigint, flour_issued bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select
    m.id, m.full_name, m.district,
    coalesce((
      select round(0.7 * sum(q.regular_quota + q.pending_quota + q.kpk_quota) * 1000)
      from mill_quotas q
      where q.flour_mill_id = m.id
        and (p_from is null or q.target_date >= p_from)
        and (p_to   is null or q.target_date <= p_to)
    ),0)::bigint,
    coalesce((
      select sum(il.bags_10 * 10 + il.bags_20 * 20)
      from issue_lines il join issues i on i.id = il.issue_id
      where i.flour_mill_id = m.id
        and (p_from is null or i.issue_date >= p_from)
        and (p_to   is null or i.issue_date <= p_to)
    ),0)::bigint
  from profiles m
  where m.role = 'flour_mill' and (
    my_role() = 'super_admin'
    or (my_role() = 'supervisor' and m.district = any(my_supervision_districts()))
    or (my_role() = 'dfc' and m.district = my_district())
  );
$function$;
GRANT EXECUTE ON FUNCTION public.get_mill_quota_totals(date, date) TO authenticated;

COMMIT;
