-- Multi-zone survey persons.
--
-- A survey person may now cover several zones. profiles.zones holds the full
-- list; profiles.zone keeps the first of them so every existing view, export
-- and label that reads a single zone carries on working unchanged. Nothing is
-- deleted and no existing row loses data: each current surveyor is backfilled
-- to a one-element array holding the zone they already had.

-- 1. the new column -----------------------------------------------------------
alter table profiles add column if not exists zones text[];

-- 2. backfill every existing survey person from their current single zone -----
update profiles
   set zones = array[zone]
 where role = 'survey' and zones is null and zone is not null;

-- 3. keep zone and zones consistent ------------------------------------------
alter table profiles drop constraint if exists zones_rules;
alter table profiles add constraint zones_rules check (
  case
    when role = 'survey'
      then zones is not null
       and array_length(zones, 1) >= 1
       and zone = zones[1]
    else zones is null
  end
);

-- 4. every zone the signed-in user covers ------------------------------------
create or replace function my_zones()
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(zones, case when zone is null then null else array[zone] end)
  from profiles where id = auth.uid();
$$;
grant execute on function my_zones() to anon, authenticated, service_role;

-- 5. a surveyor's pending list spans all of their zones ----------------------
create or replace view v_survey_pending as
 SELECT sk.id AS shopkeeper_id,
    sk.full_name AS shopkeeper_name,
    sk.shop_name,
    sk.zone,
    sk.district,
    sk.latitude,
    sk.longitude,
    count(*) AS pending_deliveries,
    min(il.received_at) AS pending_since
   FROM issue_lines il
     JOIN issues i ON i.id = il.issue_id
     JOIN profiles sk ON sk.id = il.shopkeeper_id
  WHERE il.status = 'received'::line_status AND il.surveyed_at IS NULL
    AND now() < line_deadline(i.issue_date)
    AND (my_role() = 'super_admin'::user_role
      OR my_role() = 'supervisor'::user_role AND (sk.district = ANY (my_supervision_districts()))
      OR my_role() = 'survey'::user_role AND (sk.zone = ANY (my_zones())) AND sk.district = my_district()
      OR my_role() = 'dfc'::user_role AND sk.district = my_district())
  GROUP BY sk.id, sk.full_name, sk.shop_name, sk.zone, sk.district, sk.latitude, sk.longitude;

-- 6. a survey may be submitted for any shop in any of the surveyor's zones ---
--    The survey is now stamped with the SHOP's zone, which is the zone the
--    visit actually happened in.
create or replace function submit_survey(
  p_shopkeeper uuid, p_b10 integer, p_b15 integer, p_b20 integer, p_notes text,
  p_photo_url text default null, p_photo_lat numeric default null, p_photo_lng numeric default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare my_zs text[]; my_d text; new_survey uuid; sk_zone text; sk_dist text;
begin
  if my_role() is distinct from 'survey' then raise exception 'Only survey persons can submit surveys'; end if;
  select coalesce(zones, array[zone]), district into my_zs, my_d from profiles where id = auth.uid();
  select zone, district into sk_zone, sk_dist from profiles
    where id = p_shopkeeper and role = 'shopkeeper' and is_active = true;
  if sk_zone is null then raise exception 'Shop not found'; end if;
  if not (sk_zone = any(coalesce(my_zs,'{}'))) or sk_dist is distinct from my_d then
    raise exception 'Shop is outside your zones';
  end if;
  if not exists (
    select 1 from issue_lines il join issues i on i.id = il.issue_id
    where il.shopkeeper_id = p_shopkeeper and il.status = 'received' and il.surveyed_at is null
      and now() < line_deadline(i.issue_date)
  ) then raise exception 'No pending survey for this shop (deadline may have passed)'; end if;
  insert into surveys(survey_person_id, shopkeeper_id, zone, declared_bags_10, declared_bags_15, declared_bags_20, notes, source,
                      photo_url, photo_lat, photo_lng)
  values (auth.uid(), p_shopkeeper, sk_zone, coalesce(p_b10,0), coalesce(p_b15,0), coalesce(p_b20,0),
          nullif(trim(coalesce(p_notes,'')),''), 'survey', p_photo_url, p_photo_lat, p_photo_lng)
  returning id into new_survey;
  insert into survey_lines(survey_id, issue_line_id)
    select new_survey, il.id from issue_lines il join issues i on i.id = il.issue_id
    where il.shopkeeper_id = p_shopkeeper and il.status = 'received' and il.surveyed_at is null and now() < line_deadline(i.issue_date);
  update issue_lines il set surveyed_at = now()
    from issues i where i.id = il.issue_id and il.shopkeeper_id = p_shopkeeper
      and il.status = 'received' and il.surveyed_at is null and now() < line_deadline(i.issue_date);
  insert into audit_log(actor_id, actor_type, action, entity, entity_id) values (auth.uid(), 'user', 'submit_survey', 'surveys', new_survey);
  return new_survey;
end $function$;

-- 7. the surveyor named against a missed survey matches on any of their zones -
create or replace view v_missed_surveys as
 SELECT sk.id AS shopkeeper_id,
    sk.full_name AS shopkeeper_name,
    sk.shop_name,
    sk.zone,
    sk.district,
    sk.latitude,
    sk.longitude,
    count(*) AS missed_lines,
    min(i.issue_date) AS oldest_issue_date,
    sum(il.total_bags) AS missed_bags,
    ( SELECT string_agg(DISTINCT p.full_name, ', '::text) AS string_agg
           FROM profiles p
          WHERE p.role = 'survey'::user_role
            AND (sk.zone = ANY (COALESCE(p.zones, ARRAY[p.zone])))
            AND p.district = sk.district
            AND p.is_active = true) AS surveyor_name
   FROM issue_lines il
     JOIN issues i ON i.id = il.issue_id
     JOIN profiles sk ON sk.id = il.shopkeeper_id
  WHERE il.status = 'received'::line_status AND il.surveyed_at IS NULL AND now() >= line_deadline(i.issue_date)
    AND (my_role() = 'super_admin'::user_role
      OR my_role() = 'supervisor'::user_role AND (sk.district = ANY (my_supervision_districts()))
      OR my_role() = 'dfc'::user_role AND sk.district = my_district())
  GROUP BY sk.id, sk.full_name, sk.shop_name, sk.zone, sk.district, sk.latitude, sk.longitude;

-- 8. assigned / visited counts span every zone the surveyor covers -----------
create or replace function get_surveyor_stats(p_from date default null, p_to date default null)
returns table(survey_person_id uuid, survey_person_name text, zone text, district text,
              assigned_surveys bigint, visited_surveys bigint, surveys_submitted bigint)
language sql stable security definer set search_path to 'public' as $function$
  with scope as (
    select sp.id, sp.full_name,
           array_to_string(coalesce(sp.zones, array[sp.zone]), ', ') as zone_label,
           coalesce(sp.zones, array[sp.zone]) as zones,
           sp.district
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
    join profiles sk on sk.zone = any(sc.zones) and sk.district = sc.district and sk.role = 'shopkeeper'
    join issue_lines il on il.shopkeeper_id = sk.id and il.status = 'received'
    join issues i on i.id = il.issue_id
    where (p_from is null or i.issue_date >= p_from)
      and (p_to   is null or i.issue_date <= p_to)
  )
  select sc.id, sc.full_name, sc.zone_label, sc.district,
    coalesce((select count(*) from lines l where l.sid = sc.id), 0),
    coalesce((select count(*) from lines l where l.sid = sc.id and l.surveyed_at is not null), 0),
    coalesce((select count(*) from surveys s
              where s.survey_person_id = sc.id
                and (p_from is null or (s.created_at at time zone 'Asia/Karachi')::date >= p_from)
                and (p_to   is null or (s.created_at at time zone 'Asia/Karachi')::date <= p_to)), 0)
  from scope sc;
$function$;

create or replace function get_surveyor_shops(p_surveyor uuid, p_from date default null, p_to date default null)
returns table(shopkeeper_id uuid, shopkeeper_name text, shop_name text, zone text,
              latitude numeric, longitude numeric, deliveries bigint, surveyed_deliveries bigint,
              issued_bags bigint, visited boolean, surveys_count bigint,
              last_survey_at timestamp with time zone, declared_bags bigint)
language sql stable security definer set search_path to 'public' as $function$
  with sp as (
    select p.id, coalesce(p.zones, array[p.zone]) as zones, p.district
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
    join profiles sk on sk.zone = any(sp.zones) and sk.district = sp.district and sk.role = 'shopkeeper'
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

-- 9. legacy stats view kept in step with the array ---------------------------
create or replace view v_surveyor_stats as
 SELECT id AS survey_person_id,
    full_name AS survey_person_name,
    array_to_string(COALESCE(zones, ARRAY[zone]), ', ') AS zone,
    district,
    ( SELECT count(DISTINCT il.shopkeeper_id) AS count
           FROM issue_lines il
             JOIN profiles sk2 ON sk2.id = il.shopkeeper_id
          WHERE (sk2.zone = ANY (COALESCE(sp.zones, ARRAY[sp.zone]))) AND sk2.district = sp.district AND il.status = 'received'::line_status) AS assigned_shops,
    ( SELECT count(DISTINCT s.shopkeeper_id) AS count
           FROM surveys s
             JOIN profiles sk3 ON sk3.id = s.shopkeeper_id
          WHERE s.survey_person_id = sp.id AND (sk3.zone = ANY (COALESCE(sp.zones, ARRAY[sp.zone]))) AND sk3.district = sp.district) AS visited_shops,
    ( SELECT count(*) AS count
           FROM surveys s
          WHERE s.survey_person_id = sp.id) AS surveys_done
   FROM profiles sp
  WHERE role = 'survey'::user_role AND is_active = true
    AND (my_role() = 'super_admin'::user_role
      OR my_role() = 'supervisor'::user_role AND (district = ANY (my_supervision_districts()))
      OR my_role() = 'dfc'::user_role AND district = my_district());

-- 10. expose the array to the user directory ---------------------------------
create or replace view v_users as
 SELECT p.id, p.full_name, p.role, p.district, p.zone, p.cnic, p.phone, p.shop_name,
    p.latitude, p.longitude, p.is_active, p.created_at,
    cb.full_name AS created_by_name, p.address, p.can_reactivate,
    p.supervision_districts, p.visitor_any_date, p.zones
   FROM profiles p
     LEFT JOIN profiles cb ON cb.id = p.created_by
  WHERE my_role() = 'super_admin'::user_role
    OR my_role() = 'supervisor'::user_role AND (p.district = ANY (my_supervision_districts()))
    OR my_role() = 'dfc'::user_role AND p.district = my_district() AND (p.role = ANY (ARRAY['flour_mill'::user_role, 'shopkeeper'::user_role, 'survey'::user_role]))
    OR my_role() = 'dfc'::user_role AND p.role = 'visitor'::user_role AND (my_district() = ANY (COALESCE(p.supervision_districts, '{}'::text[])))
    OR p.id = auth.uid();

-- 10b. trim / de-duplicate a zone list, preserving the caller's order -------
create or replace function _clean_zones(p text[])
returns text[] language sql immutable set search_path to 'public' as $$
  select nullif(array_agg(z order by ord), '{}')
  from (
    select distinct on (z) z, ord
    from (select trim(x) as z, row_number() over () as ord from unnest(coalesce(p,'{}')) x) t
    where z <> ''
    order by z, ord
  ) d;
$$;
grant execute on function _clean_zones(text[]) to anon, authenticated, service_role;

-- 11. create / update now accept a list of zones for survey persons ----------
--     p_zones is optional and defaults to null, so any caller still sending
--     only p_zone keeps working: a single zone becomes a one-element list.
drop function if exists admin_create_user(text, text, text, user_role, text, text, text, text, text, numeric, numeric, text, boolean, text[], boolean);

create function admin_create_user(
  p_email text, p_password text, p_full_name text, p_role user_role,
  p_district text, p_zone text, p_cnic text, p_phone text, p_shop_name text,
  p_latitude numeric, p_longitude numeric, p_address text default null,
  p_can_reactivate boolean default false, p_supervision_districts text[] default null,
  p_visitor_any_date boolean default false, p_zones text[] default null)
returns uuid language plpgsql security definer
set search_path to 'public', 'auth', 'extensions' as $function$
declare uid uuid; caller user_role; caller_district text; eff_district text;
        eff_email text; eff_password text; eff_sup text[]; eff_zones text[];
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

  -- A survey person may cover several zones; everyone else keeps one.
  if p_role = 'survey' then
    eff_zones := _clean_zones(coalesce(nullif(p_zones, '{}'), array[p_zone]));
    if eff_zones is null then raise exception 'A survey person needs at least one zone'; end if;
    if exists (
      select 1 from unnest(eff_zones) z
      where not exists (
        select 1 from zones zz join districts dd on dd.id = zz.district_id
        where zz.name = z and dd.name = eff_district)
    ) then
      raise exception 'Every zone must belong to the selected district';
    end if;
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
  insert into profiles(id, full_name, role, district, zone, zones, cnic, phone,
                       shop_name, latitude, longitude, address, created_by,
                       can_reactivate, supervision_districts, visitor_any_date)
  values (uid, p_full_name, p_role,
          case when p_role in ('supervisor','super_admin','visitor') then null else eff_district end,
          case when p_role = 'survey' then eff_zones[1]
               when p_role = 'shopkeeper' then p_zone else null end,
          case when p_role = 'survey' then eff_zones else null end,
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
          jsonb_build_object('role', p_role, 'email', lower(eff_email),
                             'zones', to_jsonb(eff_zones)));
  return uid;
end $function$;

drop function if exists admin_update_user(uuid, text, text, text, text, text, text, numeric, numeric, text, boolean, text[], boolean);

create function admin_update_user(
  p_id uuid, p_full_name text, p_district text, p_zone text, p_phone text,
  p_cnic text, p_shop_name text, p_latitude numeric, p_longitude numeric,
  p_address text default null, p_can_reactivate boolean default false,
  p_supervision_districts text[] default null, p_visitor_any_date boolean default false,
  p_zones text[] default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare caller user_role; caller_district text; r user_role;
        old_district text; old_zone text; old_zones text[]; old_sup text[];
        eff_district text; eff_zone text; eff_zones text[];
begin
  select role, district into caller, caller_district from profiles where id = auth.uid();
  select role, district, zone, zones, supervision_districts
    into r, old_district, old_zone, old_zones, old_sup
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

  if r = 'survey' then
    eff_zones := _clean_zones(coalesce(nullif(p_zones, '{}'), array[p_zone]));
    if eff_zones is null then raise exception 'A survey person needs at least one zone'; end if;
    if exists (
      select 1 from unnest(eff_zones) z
      where not exists (
        select 1 from zones zz join districts dd on dd.id = zz.district_id
        where zz.name = z and dd.name = eff_district)
    ) then
      raise exception 'Every zone must belong to this survey person''s district';
    end if;
    eff_zone := eff_zones[1];
  elsif r = 'shopkeeper' then
    eff_zone := p_zone;
  else
    eff_zone := null;
  end if;

  update profiles set
    full_name = p_full_name,
    district  = case when r in ('supervisor','super_admin','visitor') then null else eff_district end,
    zone      = eff_zone,
    zones     = eff_zones,
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

  if r = 'survey' and (
       coalesce(eff_zones,'{}') is distinct from coalesce(old_zones, case when old_zone is null then '{}'::text[] else array[old_zone] end)
       or eff_district is distinct from old_district) then
    insert into profile_notes(profile_id, note, kind, created_by)
    values (
      p_id,
      'Transferred from ' || coalesce(old_district,'—') || ' / ' ||
        coalesce(array_to_string(coalesce(old_zones, case when old_zone is null then '{}'::text[] else array[old_zone] end), ', '), '—') ||
      ' to ' || coalesce(eff_district,'—') || ' / ' ||
        coalesce(array_to_string(eff_zones, ', '), '—'),
      'transfer', auth.uid()
    );
  end if;

  insert into audit_log(actor_id, actor_type, action, entity, entity_id)
  values (auth.uid(), 'user', 'update_user', 'profiles', p_id);
end $function$;

grant execute on function admin_create_user(text, text, text, user_role, text, text, text, text, text, numeric, numeric, text, boolean, text[], boolean, text[]) to authenticated;
grant execute on function admin_update_user(uuid, text, text, text, text, text, text, numeric, numeric, text, boolean, text[], boolean, text[]) to authenticated;
