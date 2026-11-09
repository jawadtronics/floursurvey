-- ============================================================================
-- Allow a mill to dispatch multiple trucks sharing the same truck number.
-- Each dispatch stays a SEPARATE issues row (its own id, lines, photo, time).
--
-- Additive/permissive only: drops a UNIQUE *constraint* (an index rule), which
-- removes no rows, and rewrites create_issue minus the duplicate-truck guard.
-- Every existing issue and issue_line is untouched.
-- ============================================================================
BEGIN;

-- 1. Remove the "one truck number per mill" restriction.
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_flour_mill_id_track_number_key;

-- Keep the column indexed for lookups/grouping (non-unique).
CREATE INDEX IF NOT EXISTS idx_issues_mill_track ON issues (flour_mill_id, track_number);

-- 2. create_issue: identical to before, minus the unique_violation handler.
CREATE OR REPLACE FUNCTION public.create_issue(
  p_track text, p_date date, p_vehicle text, p_lines jsonb,
  p_photo_url text DEFAULT NULL::text,
  p_photo_lat numeric DEFAULT NULL::numeric,
  p_photo_lng numeric DEFAULT NULL::numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare new_issue uuid; ln jsonb; total int := 0; seen uuid[] := '{}'; mill_district text; sid uuid; b int; adv uuid;
begin
  if my_role() is distinct from 'flour_mill' then raise exception 'Only flour mills can create issues'; end if;
  if p_track is null or length(trim(p_track)) = 0 then raise exception 'Truck number is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one shopkeeper'; end if;
  select id into adv from advances where flour_mill_id = auth.uid() and supply_date = p_date;
  if adv is null then
    raise exception 'No Expected Advance submitted for %. Submit one before issuing.', p_date;
  end if;
  select district into mill_district from profiles where id = auth.uid();

  -- Same truck number may be dispatched more than once; each is its own entry.
  insert into issues(track_number, issue_date, vehicle_number, flour_mill_id, district, photo_url, photo_lat, photo_lng)
  values (trim(p_track), p_date, nullif(trim(coalesce(p_vehicle,'')),''), auth.uid(), mill_district, p_photo_url, p_photo_lat, p_photo_lng)
  returning id into new_issue;

  for ln in select * from jsonb_array_elements(p_lines) loop
    sid := (ln->>'shopkeeper_id')::uuid;
    if not exists (select 1 from profiles
                   where id = sid and role = 'shopkeeper' and is_active = true and district = mill_district) then
      raise exception 'Shopkeeper is not registered in your district';
    end if;
    if not exists (select 1 from advance_lines where advance_id = adv and shopkeeper_id = sid) then
      raise exception 'This shopkeeper is not in the Expected Advance for %', p_date;
    end if;
    if sid = any(seen) then raise exception 'Duplicate shopkeeper in this issue'; end if;
    seen := seen || sid;
    b := coalesce((ln->>'bags_10')::int,0) + coalesce((ln->>'bags_15')::int,0) + coalesce((ln->>'bags_20')::int,0);
    if b <= 0 then raise exception 'Each shopkeeper needs at least one bag'; end if;
    insert into issue_lines(issue_id, shopkeeper_id, bags_10, bags_15, bags_20, status, received_at)
    values (new_issue, sid, coalesce((ln->>'bags_10')::int,0), coalesce((ln->>'bags_15')::int,0), coalesce((ln->>'bags_20')::int,0), 'received', now());
    total := total + b;
  end loop;

  update issues set total_bags = total where id = new_issue;
  insert into audit_log(actor_id, actor_type, action, entity, entity_id, meta)
  values (auth.uid(), 'user', 'create_issue', 'issues', new_issue, jsonb_build_object('track', p_track, 'total_bags', total));
  return new_issue;
end $function$;

COMMIT;
