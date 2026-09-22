export const SUPABASE_PAGE_SIZE = 1_000;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function loadAllPages<T>(params: {
  loadPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: unknown;
  }>;
  maxRows?: number;
  pageSize?: number;
}): Promise<T[]> {
  if (params.maxRows === 0) {
    return [];
  }

  const pageSize = Math.min(
    params.pageSize ?? SUPABASE_PAGE_SIZE,
    params.maxRows ?? SUPABASE_PAGE_SIZE,
  );
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await params.loadPage(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);

    if (
      page.length < pageSize ||
      (params.maxRows !== undefined && rows.length >= params.maxRows)
    ) {
      return params.maxRows === undefined
        ? rows
        : rows.slice(0, params.maxRows);
    }
  }
}
