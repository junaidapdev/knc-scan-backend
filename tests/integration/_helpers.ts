import type { supabaseAdmin as SupabaseAdminType } from '@/lib/supabase';

/**
 * Minimal thenable that mimics a Supabase query builder chain. Every
 * navigation method (select, eq, order, range, limit, is, ilike, gte)
 * returns the same thenable so the final `await` resolves to `result`.
 * `single` / `maybeSingle` resolve directly. `insert` / `update` return a
 * nested chain whose final `single`/`maybeSingle` also resolve to `result`.
 */
export function thenableBuilder(result: {
  data: unknown;
  error: unknown;
  count?: number;
}): Record<string, unknown> {
  const resolved = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  const self: Record<string, unknown> = chain;
  const pass = (): Record<string, unknown> => chain;
  self.select = pass;
  self.eq = pass;
  self.neq = pass;
  self.is = pass;
  self.ilike = pass;
  self.order = pass;
  self.range = pass;
  self.limit = pass;
  self.gte = pass;
  self.lte = pass;
  self.single = jest.fn().mockResolvedValue(result);
  self.maybeSingle = jest.fn().mockResolvedValue(result);
  self.insert = jest.fn(() => ({
    select: () => ({
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    }),
    then: resolved.then.bind(resolved),
  }));
  self.update = jest.fn(() => ({
    eq: () => ({
      select: () => ({
        single: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
      }),
      then: resolved.then.bind(resolved),
    }),
  }));
  return self;
}

export function installFromRouter(
  supabaseMock: typeof SupabaseAdminType,
  routes: Record<string, Record<string, unknown> | Record<string, unknown>[]>,
): void {
  const cursors: Record<string, number> = {};
  (supabaseMock.from as jest.Mock).mockImplementation((table: string) => {
    const route = routes[table];
    if (!route) throw new Error(`Unmocked supabase.from('${table}')`);
    if (Array.isArray(route)) {
      const idx = cursors[table] ?? 0;
      const hit = route[Math.min(idx, route.length - 1)];
      cursors[table] = idx + 1;
      return hit;
    }
    return route;
  });
}
