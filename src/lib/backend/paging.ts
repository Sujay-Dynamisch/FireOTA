/**
 * PostgREST returns at most 1000 rows per request (Supabase "max rows"), silently truncating
 * larger selects. Pages through a query until it is exhausted, up to `max` rows.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { pageSize = 1000, max = 200_000 } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
