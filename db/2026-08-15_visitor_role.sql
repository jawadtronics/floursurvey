-- ============================================================================
-- Visitor role — APPLIED 2026-08-15 to project ckiqdhgwlubabmqmbzzx.
-- Additive only: adds an enum value, a column, widens 3 CHECK constraints,
-- and extends 1 view + 2 functions. No DROP of data, no DELETE. A full backup
-- (flour_2026-08-15_1856.sql.gz) was taken immediately before applying.
--
-- Apply order: Part A (own tx, commits the new enum value), then Part B, then
-- Part C. Reload PostgREST afterwards:  NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- ============================ PART A ========================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'visitor';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visitor_any_date boolean NOT NULL DEFAULT false;

-- ============================ PART B ========================================
BEGIN;

DROP VIEW IF EXISTS v_advances;
CREATE VIEW v_advances WITH (security_invoker = off) AS
SELECT
  a.id AS advance_id, a.supply_date, a.district,
  a.flour_mill_id, mill.full_name AS mill_name,
  al.shopkeeper_id, sk.full_name AS shopkeeper_name, sk.shop_name, sk.zone, sk.phone,
  sk.address AS shop_address,
  sk.latitude AS shop_latitude, sk.longitude AS shop_longitude,
  al.bags_10, al.bags_15, al.bags_20, al.total_bags,
  coalesce(x.i10,0) AS issued_10,
  coalesce(x.i15,0) AS issued_15,
  coalesce(x.i20,0) AS issued_20,
  coalesce(x.i10,0) + coalesce(x.i15,0) + coalesce(x.i20,0) AS issued_bags,
  coalesce(x.i10,0) - al.bags_10 AS var_10,
  coalesce(x.i15,0) - al.bags_15 AS var_15,
  coalesce(x.i20,0) - al.bags_20 AS var_20
FROM advances a
JOIN advance_lines al ON al.advance_id = a.id
JOIN profiles mill ON mill.id = a.flour_mill_id
JOIN profiles sk ON sk.id = al.shopkeeper_id
LEFT JOIN LATERAL (
  SELECT sum(il.bags_10) AS i10, sum(il.bags_15) AS i15, sum(il.bags_20) AS i20
  FROM issue_lines il JOIN issues i ON i.id = il.issue_id
  WHERE i.flour_mill_id = a.flour_mill_id AND i.issue_date = a.supply_date
    AND il.shopkeeper_id = al.shopkeeper_id
) x ON true
WHERE
  a.flour_mill_id = auth.uid()
  OR my_role() = 'super_admin'
  OR (my_role() = 'supervisor' AND sk.district = ANY(my_supervision_districts()))
  OR (my_role() = 'dfc' AND sk.district = my_district())
  OR (
    my_role() = 'visitor'
    AND sk.district = ANY(my_supervision_districts())
    AND (
      (SELECT visitor_any_date FROM profiles WHERE id = auth.uid())
      OR a.supply_date = (now() AT TIME ZONE 'Asia/Karachi')::date
    )
  );
GRANT SELECT ON v_advances TO authenticated;

CREATE OR REPLACE VIEW v_users WITH (security_invoker = off) AS
SELECT p.id, p.full_name, p.role, p.district, p.zone, p.cnic, p.phone,
       p.shop_name, p.latitude, p.longitude, p.is_active, p.created_at,
       cb.full_name AS created_by_name, p.address, p.can_reactivate,
       p.supervision_districts, p.visitor_any_date
FROM profiles p
LEFT JOIN profiles cb ON cb.id = p.created_by
WHERE
  my_role() = 'super_admin'::user_role
  OR (my_role() = 'supervisor'::user_role AND p.district = ANY(my_supervision_districts()))
  OR (my_role() = 'dfc'::user_role AND p.district = my_district()
      AND p.role = ANY(ARRAY['flour_mill','shopkeeper','survey']::user_role[]))
  OR (my_role() = 'dfc'::user_role AND p.role = 'visitor'::user_role
      AND my_district() = ANY(coalesce(p.supervision_districts, '{}')))
  OR p.id = auth.uid();

DROP FUNCTION IF EXISTS public.admin_create_user(text,text,text,user_role,text,text,text,text,text,numeric,numeric,text,boolean,text[]);
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text, p_password text, p_full_name text, p_role user_role,
  p_district text, p_zone text, p_cnic text, p_phone text, p_shop_name text,
  p_latitude numeric, p_longitude numeric, p_address text DEFAULT NULL::text,
  p_can_reactivate boolean DEFAULT false, p_supervision_districts text[] DEFAULT NULL::text[],
  p_visitor_any_date boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions'
AS $function$
declare uid uuid; caller user_role; caller_district text; eff_district text;
        eff_email text; eff_password text; eff_sup text[];
begin
  select role, district into caller, caller_district from profiles where id = auth.uid();
  if caller = 'super_admin' then
    eff_district := p_district;
    eff_sup := p_supervision_districts;
  elsif caller = 'dfc' then
    if p_role not in ('flour_mill','shopkeeper','survey','visitor') then
      raise exception 'A DFC can only create Flour Mill, Shopkeeper, Survey or Visitor users';
    end if;
    eff_district := caller_district;
    eff_sup := case when p_role = 'visitor' then array[caller_district] else p_supervision_districts end;
  else
    raise exception 'Not authorised to create users';
  end if;
  if p_role in ('flour_mill','shopkeeper','survey','dfc') and eff_district is null then
    raise exception 'District is required for this role';
  end if;
  if p_role = 'visitor' and (eff_sup is null or array_length(eff_sup,1) is null) then
    raise exception 'A visitor needs at least one district';
  end if;

  eff_email := nullif(trim(coalesce(p_email,'')),'');
  eff_password := nullif(trim(coalesce(p_password,'')),'');
  if p_role = 'shopkeeper' then
    if eff_email is null then
      eff_email := 'shop.' || regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g') || '@noreply.flour.pk';
    end if;
    if eff_password is null then
      eff_password := encode(extensions.gen_random_bytes(18), 'hex');
    end if;
  end if;
  if eff_email is null or eff_password is null then
    raise exception 'Email and password are required for this role';
  end if;

  uid := _create_auth_user(eff_email, eff_password);
  insert into profiles(id, full_name, role, district, zone, cnic, phone,
                       shop_name, latitude, longitude, address, created_by,
                       can_reactivate, supervision_districts, visitor_any_date)
  values (uid, p_full_name, p_role,
          case when p_role in ('supervisor','super_admin','visitor') then null else eff_district end,
          case when p_role in ('shopkeeper','survey') then p_zone else null end,
          p_cnic, p_phone,
          case when p_role = 'shopkeeper' then p_shop_name else null end,
          case when p_role = 'shopkeeper' then p_latitude else null end,
          case when p_role = 'shopkeeper' then p_longitude else null end,
          case when p_role = 'shopkeeper' then p_address else null end,
          auth.uid(),
          case when p_role = 'supervisor' then coalesce(p_can_reactivate,false) else false end,
          case when p_role in ('supervisor','visitor') then eff_sup else null end,
          case when p_role = 'visitor' then coalesce(p_visitor_any_date,false) else false end);
  insert into audit_log(actor_id, actor_type, action, entity, entity_id, meta)
  values (auth.uid(), 'user', 'create_user', 'profiles', uid,
          jsonb_build_object('role', p_role, 'email', lower(eff_email)));
  return uid;
end $function$;

DROP FUNCTION IF EXISTS public.admin_update_user(uuid,text,text,text,text,text,text,numeric,numeric,text,boolean,text[]);
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_id uuid, p_full_name text, p_district text, p_zone text, p_phone text, p_cnic text,
  p_shop_name text, p_latitude numeric, p_longitude numeric, p_address text DEFAULT NULL::text,
  p_can_reactivate boolean DEFAULT false, p_supervision_districts text[] DEFAULT NULL::text[],
  p_visitor_any_date boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller user_role; caller_district text; r user_role;
        old_district text; old_zone text; old_sup text[]; eff_district text; eff_zone text;
begin
  select role, district into caller, caller_district from profiles where id = auth.uid();
  select role, district, zone, supervision_districts into r, old_district, old_zone, old_sup
    from profiles where id = p_id;
  if r is null then raise exception 'User not found'; end if;

  if caller = 'super_admin' then
    eff_district := p_district;
  elsif caller = 'supervisor' then
    if old_district is null or not (old_district = any(my_supervision_districts())) then
      raise exception 'This user is outside your supervision districts';
    end if;
    if p_district is not null and not (p_district = any(my_supervision_districts())) then
      raise exception 'You can only move users between your supervision districts';
    end if;
    eff_district := p_district;
  elsif caller = 'dfc' then
    if r = 'visitor' then
      if not (caller_district = any(coalesce(old_sup,'{}'))) then
        raise exception 'You can only edit visitors in your district';
      end if;
    elsif r not in ('flour_mill','shopkeeper','survey') or old_district is distinct from caller_district then
      raise exception 'You can only edit users in your district';
    end if;
    eff_district := caller_district;
  else
    raise exception 'Not authorised';
  end if;

  eff_zone := case when r in ('shopkeeper','survey') then p_zone else null end;

  update profiles set
    full_name = p_full_name,
    district  = case when r in ('supervisor','super_admin','visitor') then null else eff_district end,
    zone      = eff_zone,
    phone     = p_phone,
    cnic      = p_cnic,
    shop_name = case when r = 'shopkeeper' then p_shop_name else shop_name end,
    latitude  = case when r = 'shopkeeper' then p_latitude else latitude end,
    longitude = case when r = 'shopkeeper' then p_longitude else longitude end,
    address   = case when r = 'shopkeeper' then p_address else address end,
    can_reactivate = case when r = 'supervisor' then coalesce(p_can_reactivate,false) else can_reactivate end,
    supervision_districts = case
      when r = 'supervisor' then p_supervision_districts
      when r = 'visitor' then (case when caller = 'dfc' then array[caller_district] else p_supervision_districts end)
      else supervision_districts end,
    visitor_any_date = case when r = 'visitor' then coalesce(p_visitor_any_date,false) else visitor_any_date end
  where id = p_id;

  if r = 'survey' and (eff_zone is distinct from old_zone or eff_district is distinct from old_district) then
    insert into profile_notes(profile_id, note, kind, created_by)
    values (
      p_id,
      'Transferred from ' || coalesce(old_district,'—') || ' / ' || coalesce(old_zone,'—') ||
      ' to ' || coalesce(eff_district,'—') || ' / ' || coalesce(eff_zone,'—'),
      'transfer', auth.uid()
    );
  end if;

  insert into audit_log(actor_id, actor_type, action, entity, entity_id)
  values (auth.uid(), 'user', 'update_user', 'profiles', p_id);
end $function$;

COMMIT;

-- ============================ PART C ========================================
-- Widen the profile CHECK constraints so a visitor (no district column,
-- no CNIC/phone, no zone — same shape as a supervisor) is valid.
BEGIN;

ALTER TABLE profiles DROP CONSTRAINT district_rules;
ALTER TABLE profiles ADD CONSTRAINT district_rules
  CHECK (role = ANY (ARRAY['supervisor','super_admin','visitor']::user_role[])
         OR district IS NOT NULL);

ALTER TABLE profiles DROP CONSTRAINT field_role_ids;
ALTER TABLE profiles ADD CONSTRAINT field_role_ids
  CHECK (role = ANY (ARRAY['dfc','supervisor','super_admin','visitor']::user_role[])
         OR (cnic IS NOT NULL AND phone IS NOT NULL));

ALTER TABLE profiles DROP CONSTRAINT zone_rules;
ALTER TABLE profiles ADD CONSTRAINT zone_rules
  CHECK (
    (role = 'flour_mill'::user_role AND zone IS NULL)
    OR (role = ANY (ARRAY['shopkeeper','survey']::user_role[]) AND zone IS NOT NULL)
    OR (role = ANY (ARRAY['dfc','supervisor','super_admin','visitor']::user_role[]) AND zone IS NULL)
  );

COMMIT;

-- After applying: NOTIFY pgrst, 'reload schema';
