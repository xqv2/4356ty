// src/actions/cycles.test.ts
// Tests for the cycles server actions. The Supabase client is mocked at the
// module boundary so we can drive each query/insert path deterministically.
// All money is in CENTS.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------
// next/cache.revalidatePath is a no-op in tests; we just want to assert it ran.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Supabase server client — replaced wholesale per test via mockResolvedValue.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock currentYearMonth so ensureCurrentCycle is deterministic regardless of
// when the suite runs. formatCycleLabel stays real (it's pure).
vi.mock('@/lib/format', async () => {
  const actual = await vi.importActual<typeof import('@/lib/format')>(
    '@/lib/format',
  );
  return {
    ...actual,
    currentYearMonth: vi.fn(() => ({ year: 2026, month: 4 })),
  };
});

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { currentYearMonth } from '@/lib/format';
import { createCycle, ensureCurrentCycle, listCycles } from './cycles';

// ---- Helpers ----------------------------------------------------------------

const USER = { id: 'user-1' } as const;

/** Minimal builder for a Supabase query-builder mock. Each method returns the
 *  same object so .from('x').select('*').eq(...).order(...).limit(...) chains.
 *  Terminal awaits resolve to whatever the caller queues via `terminal`. */
type Awaited<T> = { data: T; error: null } | { data: null; error: { message: string } };

interface QueryStub {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  // Direct thenable so `await supabase.from('x').select(...)...` resolves.
  then: (onFulfilled: (v: unknown) => unknown) => Promise<unknown>;
}

/**
 * Build a chainable query stub whose terminal resolution (await on the chain
 * itself, or `.single()`/`.maybeSingle()`) returns the configured payload.
 */
function makeQuery(terminal: Awaited<unknown>): QueryStub {
  const stub: Partial<QueryStub> = {};
  const chain = () => stub as QueryStub;
  stub.select = vi.fn(chain);
  stub.insert = vi.fn(chain);
  stub.update = vi.fn(chain);
  stub.delete = vi.fn(chain);
  stub.eq = vi.fn(chain);
  stub.is = vi.fn(chain);
  stub.order = vi.fn(chain);
  stub.limit = vi.fn(chain);
  stub.single = vi.fn(() => Promise.resolve(terminal));
  stub.maybeSingle = vi.fn(() => Promise.resolve(terminal));
  // Awaiting the chain itself (e.g. for an INSERT with no .single()) resolves
  // to the same terminal payload.
  stub.then = (onFulfilled) => Promise.resolve(terminal).then(onFulfilled);
  return stub as QueryStub;
}

interface SupabaseStub {
  client: {
    auth: { getUser: ReturnType<typeof vi.fn> };
    from: ReturnType<typeof vi.fn>;
  };
  /** Calls to .from() in order, with the table name and the returned stub. */
  fromCalls: Array<{ table: string; query: QueryStub }>;
}

/**
 * Build a fake Supabase client with auth.getUser preloaded and a queue of
 * per-`.from(table)` query stubs. Each call to `.from()` pulls the next stub
 * in `queue`; the test sets the queue order to match the action's call order.
 */
function makeSupabase(opts: {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  queue: Array<{ table?: string; query: QueryStub }>;
}): SupabaseStub {
  const { user = USER, userError = null, queue } = opts;
  const fromCalls: SupabaseStub['fromCalls'] = [];
  const remaining = [...queue];

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: userError,
      })),
    },
    from: vi.fn((table: string) => {
      const next = remaining.shift();
      if (!next) {
        throw new Error(
          `Unexpected supabase.from('${table}') — queue exhausted`,
        );
      }
      if (next.table && next.table !== table) {
        throw new Error(
          `Expected supabase.from('${next.table}'), got '${table}'`,
        );
      }
      fromCalls.push({ table, query: next.query });
      return next.query;
    }),
  };

  return { client, fromCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentYearMonth).mockReturnValue({ year: 2026, month: 4 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---- listCycles -------------------------------------------------------------

describe('listCycles', () => {
  it('returns cycles for the signed-in user, ordered newest first', async () => {
    const cycles = [
      { id: 'c-2026-04', user_id: USER.id, year: 2026, month: 4, label: 'Utilities' },
      { id: 'c-2026-03', user_id: USER.id, year: 2026, month: 3, label: 'Utilities' },
      { id: 'c-2025-12', user_id: USER.id, year: 2025, month: 12, label: 'Utilities' },
    ];
    const query = makeQuery({ data: cycles, error: null });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await listCycles();

    expect(result).toEqual(cycles);
    expect(supa.client.auth.getUser).toHaveBeenCalledOnce();
    expect(supa.client.from).toHaveBeenCalledWith('cycles');
    expect(query.select).toHaveBeenCalledWith('*');
    expect(query.eq).toHaveBeenCalledWith('user_id', USER.id);
    expect(query.order).toHaveBeenNthCalledWith(1, 'year', { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'month', { ascending: false });
  });

  it('returns [] when the query yields null data', async () => {
    const query = makeQuery({ data: null as never, error: null });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(listCycles()).resolves.toEqual([]);
  });

  it('throws "Not authenticated" when there is no user', async () => {
    const supa = makeSupabase({ user: null, queue: [] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(listCycles()).rejects.toThrow('Not authenticated');
    expect(supa.client.from).not.toHaveBeenCalled();
  });

  it('throws the underlying error message when the query fails', async () => {
    const query = makeQuery({
      data: null,
      error: { message: 'permission denied' },
    });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(listCycles()).rejects.toThrow('permission denied');
  });
});

// ---- createCycle ------------------------------------------------------------

describe('createCycle', () => {
  it('inserts a cycle row and revalidates current + new cycle paths', async () => {
    const created = {
      id: 'c-new',
      user_id: USER.id,
      year: 2026,
      month: 5,
      label: 'May Vibes',
    };
    const query = makeQuery({ data: created, error: null });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await createCycle(2026, 5, 'May Vibes');

    expect(result).toEqual(created);
    expect(query.insert).toHaveBeenCalledWith({
      user_id: USER.id,
      year: 2026,
      month: 5,
      label: 'May Vibes',
    });
    expect(query.select).toHaveBeenCalledWith('*');
    expect(query.single).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/c-new');
  });

  it('defaults the label to "Utilities" when omitted', async () => {
    const query = makeQuery({
      data: { id: 'c-1', user_id: USER.id, year: 2026, month: 6, label: 'Utilities' },
      error: null,
    });
    const supa = makeSupabase({ queue: [{ table: 'cycles', query }] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await createCycle(2026, 6);

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Utilities' }),
    );
  });

  it('falls back to "Utilities" when the label is whitespace', async () => {
    const query = makeQuery({
      data: { id: 'c-1', user_id: USER.id, year: 2026, month: 6, label: 'Utilities' },
      error: null,
    });
    const supa = makeSupabase({ queue: [{ table: 'cycles', query }] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await createCycle(2026, 6, '   ');

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Utilities' }),
    );
  });

  it('truncates fractional year/month inputs', async () => {
    const query = makeQuery({
      data: { id: 'c-1', user_id: USER.id, year: 2026, month: 4, label: 'Utilities' },
      error: null,
    });
    const supa = makeSupabase({ queue: [{ table: 'cycles', query }] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await createCycle(2026.9, 4.7);

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2026, month: 4 }),
    );
  });

  it('throws "Not authenticated" when there is no user', async () => {
    const supa = makeSupabase({ user: null, queue: [] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(createCycle(2026, 5)).rejects.toThrow('Not authenticated');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces the insert error message (e.g. unique-index conflict)', async () => {
    const query = makeQuery({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });
    const supa = makeSupabase({ queue: [{ table: 'cycles', query }] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(createCycle(2026, 4)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ---- ensureCurrentCycle -----------------------------------------------------

describe('ensureCurrentCycle', () => {
  it('returns the existing current-month cycle untouched', async () => {
    const existing = {
      id: 'c-existing',
      user_id: USER.id,
      year: 2026,
      month: 4,
      label: 'Utilities',
    };
    const lookup = makeQuery({ data: existing, error: null });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query: lookup }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await ensureCurrentCycle();

    expect(result).toEqual(existing);
    expect(lookup.eq).toHaveBeenCalledWith('user_id', USER.id);
    expect(lookup.eq).toHaveBeenCalledWith('year', 2026);
    expect(lookup.eq).toHaveBeenCalledWith('month', 4);
    expect(lookup.maybeSingle).toHaveBeenCalledOnce();
    // No write paths exercised when the cycle already exists.
    expect(lookup.insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('creates a fresh cycle and seeds the four default bills when there is no prior cycle', async () => {
    // Order of supabase.from() calls in the action:
    //   1. cycles  — lookup for current month (none exists)
    //   2. cycles  — read most-recent prior (none exists)
    //   3. cycles  — insert new cycle
    //   4. bills   — insert default seed bills
    //   5. roommates — confirmatory read
    const lookup = makeQuery({ data: null, error: null });
    const priorRead = makeQuery({ data: [], error: null });
    const newCycle = {
      id: 'c-new',
      user_id: USER.id,
      year: 2026,
      month: 4,
      label: 'April 2026',
    };
    const insertCycle = makeQuery({ data: newCycle, error: null });
    const insertBills = makeQuery({ data: null, error: null });
    const roommatesRead = makeQuery({ data: [], error: null });

    const supa = makeSupabase({
      queue: [
        { table: 'cycles', query: lookup },
        { table: 'cycles', query: priorRead },
        { table: 'cycles', query: insertCycle },
        { table: 'bills', query: insertBills },
        { table: 'roommates', query: roommatesRead },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await ensureCurrentCycle();

    expect(result).toEqual(newCycle);

    // Cycle insert payload — label comes from formatCycleLabel(2026, 4).
    expect(insertCycle.insert).toHaveBeenCalledWith({
      user_id: USER.id,
      year: 2026,
      month: 4,
      label: 'April 2026',
    });

    // Default seed bills: 4 rows, recurring, amount_cents=0, in canonical order.
    expect(insertBills.insert).toHaveBeenCalledTimes(1);
    const seeded = (insertBills.insert.mock.calls[0] as unknown as [unknown[]])[0];
    expect(seeded).toEqual([
      { cycle_id: 'c-new', vendor: 'Electricity', provider: null, kind: 'electricity', recurring: true, amount_cents: 0, position: 0 },
      { cycle_id: 'c-new', vendor: 'Water',       provider: null, kind: 'water',       recurring: true, amount_cents: 0, position: 1 },
      { cycle_id: 'c-new', vendor: 'Trash',       provider: null, kind: 'trash',       recurring: true, amount_cents: 0, position: 2 },
      { cycle_id: 'c-new', vendor: 'Internet',    provider: null, kind: 'internet',    recurring: true, amount_cents: 0, position: 3 },
    ]);

    // Roommates confirmatory read filters by user + active.
    expect(roommatesRead.select).toHaveBeenCalledWith('id');
    expect(roommatesRead.eq).toHaveBeenCalledWith('user_id', USER.id);
    expect(roommatesRead.is).toHaveBeenCalledWith('archived_at', null);

    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/c-new');
  });

  it('carries forward the prior cycle label and bills (amount reset to 0, no pdf_path) when a prior exists', async () => {
    const lookup = makeQuery({ data: null, error: null });
    const prior = {
      id: 'c-prior',
      user_id: USER.id,
      year: 2026,
      month: 3,
      label: 'Casa Utilities',
    };
    const priorRead = makeQuery({ data: [prior], error: null });
    const newCycle = {
      id: 'c-new',
      user_id: USER.id,
      year: 2026,
      month: 4,
      // Label inherited from prior, NOT formatCycleLabel.
      label: 'Casa Utilities',
    };
    const insertCycle = makeQuery({ data: newCycle, error: null });
    const priorBills = [
      { vendor: 'PG&E',     provider: 'PG&E',    kind: 'electricity', recurring: true,  position: 0 },
      { vendor: 'EBMUD',    provider: null,      kind: 'water',       recurring: true,  position: 1 },
      { vendor: 'Comcast',  provider: 'Xfinity', kind: 'internet',    recurring: false, position: 2 },
    ];
    const priorBillsRead = makeQuery({ data: priorBills, error: null });
    const insertBills = makeQuery({ data: null, error: null });
    const roommatesRead = makeQuery({
      data: [{ id: 'rm-1' }, { id: 'rm-2' }],
      error: null,
    });

    const supa = makeSupabase({
      queue: [
        { table: 'cycles', query: lookup },
        { table: 'cycles', query: priorRead },
        { table: 'cycles', query: insertCycle },
        { table: 'bills', query: priorBillsRead },
        { table: 'bills', query: insertBills },
        { table: 'roommates', query: roommatesRead },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await ensureCurrentCycle();
    expect(result).toEqual(newCycle);

    // Inherited label.
    expect(insertCycle.insert).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Casa Utilities' }),
    );

    // Prior bills read scoped to prior cycle id, ordered by position.
    expect(priorBillsRead.select).toHaveBeenCalledWith(
      'vendor, provider, kind, recurring, position',
    );
    expect(priorBillsRead.eq).toHaveBeenCalledWith('cycle_id', 'c-prior');
    expect(priorBillsRead.order).toHaveBeenCalledWith('position', { ascending: true });

    // Carried-forward bills: vendor/provider/kind/recurring/position kept,
    // amount_cents reset to 0, cycle_id swapped to the new cycle.
    const carried = (insertBills.insert.mock.calls[0] as unknown as [unknown[]])[0];
    expect(carried).toEqual([
      { cycle_id: 'c-new', vendor: 'PG&E',    provider: 'PG&E',    kind: 'electricity', recurring: true,  amount_cents: 0, position: 0 },
      { cycle_id: 'c-new', vendor: 'EBMUD',   provider: null,      kind: 'water',       recurring: true,  amount_cents: 0, position: 1 },
      { cycle_id: 'c-new', vendor: 'Comcast', provider: 'Xfinity', kind: 'internet',    recurring: false, amount_cents: 0, position: 2 },
    ]);
    // pdf_path must NOT be carried — the action drops it by selecting only
    // five columns above. Verify it's absent from each seeded row.
    for (const row of carried as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty('pdf_path');
    }

    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/c-new');
  });

  it('skips the bills insert when the prior cycle had no bills', async () => {
    const lookup = makeQuery({ data: null, error: null });
    const prior = { id: 'c-prior', user_id: USER.id, year: 2026, month: 3, label: 'L' };
    const priorRead = makeQuery({ data: [prior], error: null });
    const newCycle = { id: 'c-new', user_id: USER.id, year: 2026, month: 4, label: 'L' };
    const insertCycle = makeQuery({ data: newCycle, error: null });
    const priorBillsRead = makeQuery({ data: [], error: null });
    const roommatesRead = makeQuery({ data: [], error: null });

    const supa = makeSupabase({
      queue: [
        { table: 'cycles', query: lookup },
        { table: 'cycles', query: priorRead },
        { table: 'cycles', query: insertCycle },
        { table: 'bills', query: priorBillsRead },
        // NOTE: no insertBills entry — when seedBills is empty, the action
        // must not call .from('bills') a second time.
        { table: 'roommates', query: roommatesRead },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    const result = await ensureCurrentCycle();
    expect(result).toEqual(newCycle);
  });

  it('throws "Not authenticated" when there is no user', async () => {
    const supa = makeSupabase({ user: null, queue: [] });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(ensureCurrentCycle()).rejects.toThrow('Not authenticated');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces the lookup error', async () => {
    const lookup = makeQuery({
      data: null,
      error: { message: 'lookup failed' },
    });
    const supa = makeSupabase({
      queue: [{ table: 'cycles', query: lookup }],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(ensureCurrentCycle()).rejects.toThrow('lookup failed');
  });

  it('surfaces the create error when inserting the new cycle fails', async () => {
    const lookup = makeQuery({ data: null, error: null });
    const priorRead = makeQuery({ data: [], error: null });
    const insertCycle = makeQuery({
      data: null,
      error: { message: 'insert failed' },
    });
    const supa = makeSupabase({
      queue: [
        { table: 'cycles', query: lookup },
        { table: 'cycles', query: priorRead },
        { table: 'cycles', query: insertCycle },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supa.client as never);

    await expect(ensureCurrentCycle()).rejects.toThrow('insert failed');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
