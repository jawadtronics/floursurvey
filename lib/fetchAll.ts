import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST returns at most this many rows for a plain select. */
const PAGE = 1000;

/**
 * Fetch EVERY row of a view, paging past PostgREST's 1000-row cap.
 *
 * A plain `.select("*")` silently truncates at 1000 rows. That under-reported
 * every total, and because two charts read the same view with different
 * ordering they each got a different 1000 rows and disagreed. All list and
 * analytics reads should go through this.
 *
 * `orderBy` must be a TOTAL order (unique per row) or paging can repeat or drop
 * rows — e.g. v_advances needs advance_id + shopkeeper_id, not advance_id alone.
 */
export async function fetchAll<T>(
  supabase: SupabaseClient,
  view: string,
  orderBy: string[],
  columns = "*"
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page <= 200; page++) {
    let q = supabase.from(view).select(columns).range(page * PAGE, page * PAGE + PAGE - 1);
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    if (!data) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}
