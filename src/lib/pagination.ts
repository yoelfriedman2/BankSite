// Pages through a Supabase query past the default 1000-row PostgREST page cap
// by repeatedly appending .range(). Deliberately dependency-free (no xlsx/
// jszip/admin-client baggage) so any server component or server action can
// import it without pulling in unrelated heavy modules — see DATA-18, which
// found the personal-export and weekly-backup fixes (DATA-06/REL-03) hadn't
// been applied to several other reads of the same tables.
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildPage(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows: rows as T[] };
}
